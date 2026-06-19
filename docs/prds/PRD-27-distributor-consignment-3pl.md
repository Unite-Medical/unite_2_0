# PRD-27 — Distributor / 3PL Ordering, Consignment Inventory & Blind Shipping

**Source:** Founder directive (Damon, 2026-06-19): "We also have distributors who store product in our warehouse… need to account for this so these distributors can upload and attach any required paperwork that ships with their orders… the ability to blind ship… third-party shipping billing… show them a comparison of shipping costs… pull our shipping rates from our carriers and add a 10% mark up."
**Owner:** Alex (CTO)
**Status:** draft
**Depends on:** PRD-26 (customer order core — pricing, payment, RBAC), PRD-25 (UniteWMS — native inventory ledger, lots/expiry, reservations/ATP, receiving + pick/pack/ship, barcode workflows), PRD-24 (fulfillment orchestrator), PRD-17 (PDF document pipeline — packing slips), PRD-14 (B2B portal/accounts)
**Blocks:** distributor revenue (3PL fees, shipping markup) + listing distributor stock on the Unite storefront

> "When a distributor ships something from Unite, they don't want their customers to see it came from Unite — they want it to appear like it came from them." — Damon, 2026-06-19

---

## 1. North star

A distributor who stores **their own** product in Unite's warehouse can log in, see **their inventory** (separate from Unite's), place and fulfill orders against it — quick orders, reorders, or by **uploading their customer's PO** and having the system recognize the items, quantities, and ship-to — and have those orders **blind ship** under their brand (their label identity, Unite's address) with **their required paperwork** (their packing slip / inserts) on the box. They choose to ship on **their own carrier account** or on **Unite's marked-up rates**, and see a **side-by-side cost comparison** before they decide. Unite tracks every owner's stock, lot, and expiration through a **scan-in / scan-out** process — no manual data entry by warehouse staff.

The same distributor can also buy **Unite's** products. And in some cases Unite **sells the distributor's stock** through the Unite storefront — drawing down the same consignment pool.

---

## 2. Current state

- `inventory` (`0003_inventory.sql`) tracks `on_hand` / `reserved` per `(product_sku, warehouse_id)` — **no owner dimension**. All stock is implicitly Unite's.
- `lot_tracking` exists with `lot_number`, `expiration_date`, `warehouse_id`, `scanned_by`, `received_at`/`shipped_at` — the **schema for lot + expiration capture is already there**, but there is no scan UI/device flow and no owner tag.
- `src/lib/fulfillment.js` generates a **Unite** packing slip (PRD-17 `generateDocument({ type: 'packing_slip' })`) and ships from `wh_atl` on Unite rates. No blind-ship identity, no custom paperwork attach, no third-party billing.
- `src/lib/external/shipstation.js` — `getRates()` / `createLabel()` stubbed; rates not yet marked up or compared.
- `src/pages/ServiceDistributors.jsx` exists (marketing), but there is **no distributor operational portal**.
- The WMS Alex is wiring is **not yet pushed** (origin at `b3ebca2`); this PRD declares it a dependency and defines the contract it must satisfy (owner-tagged scan events).

---

## 3. Scope

### In scope

- **Segregated consignment inventory**: distributor-owned stock tracked separately from Unite-owned stock, never commingled in the numbers, billable as 3PL.
- **Per-item key details**: lot number, expiration date, and arbitrary product attributes captured at receive and carried through to shipment (recall traceability).
- **Scan-in / scan-out** warehouse flow: barcode-driven receiving and picking, **no manual entry**. Support label/barcode generation that encodes lot+expiration, plus photo/document upload as a fallback capture method.
- **Distributor operational portal**: a distributor sees and orders against **their** inventory *and* Unite's catalog, whether or not their items appear on the public storefront.
- **Sell-through**: when Unite sells a distributor's item (storefront or Unite rep), it **decrements that distributor's consignment stock** and records the owner for settlement.
- **Front-end vs. back-only listing**: a distributor SKU can be (a) listed for Unite to sell on the website, or (b) warehouse-only — never public, but still orderable by the distributor.
- **Blind / white-label shipping**: ship label + paperwork present the **distributor's brand identity with Unite's (or a configured) address** — recipient never sees "Unite Medical."
- **Custom packing slips & inserts**: distributors upload their own packing-slip template + any required paperwork that must ship with their orders.
- **Customer-PO ingestion**: distributor uploads their customer's PO (PDF/xlsx); system parses items, quantities, ship-to; matches to known SKUs; produces a draft order for confirmation.
- **Third-party shipping billing**: distributor ships on **their own carrier account** (bill-to-third-party) **or** on Unite's rates and Unite bills them.
- **Carrier-rate markup + comparison**: pull live carrier rates, apply a **configurable markup (default 10%)**, and show **"Unite rate vs. your rate"** side by side.
- **Quick orders, reorders, multi-email notifications** for distributors (reuses PRD-26 mechanics).

### Out of scope

- The customer ordering core (pricing resolver, payment allowlist, rep RBAC) — **PRD-26**.
- The fulfillment orchestrator internals — **PRD-24** (this PRD adds owner/blind/paperwork inputs to it).
- International / customs documentation for distributor outbound (domestic v1).
- Automated 3PL storage-fee billing run (tracked as open question — invoice hooks defined, billing cadence deferred).

---

## 4. Consignment inventory model

The core change: **inventory gains an owner**. Unite-owned and distributor-owned stock of the *same physical product* are tracked as separate pools and never summed together for availability.

```
inventory_lots (owner-tagged, lot-level)
   owner_type ∈ { unite, distributor }
   owner_org_id            ← which distributor (null when unite)
   product_sku             ← Unite catalog SKU OR distributor's own SKU
   lot_number, expiration_date
   qty_on_hand, qty_reserved
   warehouse_id, bin/location
   received_via_scan_id    ← provenance to the scan event

Availability is always scoped:
   availableFor(owner, sku) = Σ lots WHERE owner matches
```

- A distributor never sees Unite's quantities as theirs, and vice-versa.
- **Sell-through**: if a distributor SKU is flagged `unite_sellable`, a Unite storefront/rep sale reserves and decrements **that distributor's** lots, and writes a `consignment_movement` row (owner, qty, sale ref) for settlement.
- **Listing visibility** per distributor product: `storefront` (public, Unite sells it) | `warehouse_only` (never public; distributor orders against it). Distributors order against either; only `storefront` items render on the site.
- Distributors can also order **Unite-owned** catalog products (acting as a normal customer per PRD-26).

---

## 5. Scan-in / scan-out (warehouse, zero manual entry)

The brief is explicit: easy for warehouse staff, **scan-driven, not typed**. The `lot_tracking` schema already supports the data; this defines the capture flow.

**Receive (scan-in):**
1. Staff opens the receive station (tablet/scanner), selects the inbound (or the distributor + PO).
2. Scan the manufacturer barcode (GS1/UDI) → system parses **GTIN + lot + expiration** from the barcode where present (GS1 Application Identifiers `(01)(10)(17)`).
3. If the barcode lacks lot/expiration: fallback capture — **snap a photo** of the box label (OCR-assisted extraction, staff confirms) **or** the system **prints a Unite barcode** that encodes the lot+expiration for that pallet so every subsequent pick is a single scan.
4. Each scan writes an owner-tagged `inventory_lots` row + a `scan_events` row (`scanned_by`, station, ts). No keyboard entry of lot/exp.

**Pick / ship (scan-out):**
1. Pick list (Unite or distributor packing slip) drives the pick.
2. Staff scans each item out → decrements the specific lot, writes the shipped lot to `lot_tracking` (recall trace), advances the order.
3. FEFO (first-expiry-first-out) suggested pick order so near-dated lots go first.

Capture methods supported, in preference order: **(1) native GS1/UDI barcode scan → (2) Unite-generated encoded barcode → (3) photo + OCR confirm → (4) manual entry (last resort, flagged).**

---

## 6. Blind / white-label shipping

When a distributor's order ships, the recipient must believe it came from the distributor.

- Each distributor has one or more **ship-from identities**: brand name + return address + (optional) logo for the label and paperwork. Default identity = distributor brand name with Unite's warehouse address (so returns still reach the warehouse) — configurable.
- **Label**: ShipStation order created with the distributor's `shipFrom` name/address (not "Unite Medical"). No Unite branding on the label.
- **Packing slip**: the distributor's uploaded template (PRD-17 renders it), not Unite's. Falls back to a neutral (un-branded) slip if none uploaded — **never** the Unite-branded one for a blind order.
- **Inserts / required paperwork**: distributor-uploaded documents (COA, IFU, marketing inserts) are attached to the order and included in the pack-out checklist so the warehouse includes them.
- Blind mode is a per-order flag defaulting to the distributor account's setting; Unite stocked items a distributor resells can also blind-ship.

---

## 7. Customer-PO ingestion

A distributor uploads the PO **their** customer sent them; Unite turns it into a draft order.

```
upload (PDF / xlsx / image)
   → parse (reuse PRD-18 xlsx parser; PDF/image via OCR + AI extract)
   → recognize: line items, quantities, ship-to address, PO number
   → match each line to a SKU:
        distributor's own SKU  → consignment lot
        Unite catalog SKU      → Unite stock
        unmatched              → flagged for distributor to map (learns the mapping)
   → produce a DRAFT order (blind-ship defaults applied) for one-click confirm
```

- Extraction confidence shown per line; low-confidence lines require confirmation (no silent wrong-SKU orders).
- Learned mappings (their part # → our SKU) persist so repeat POs auto-match.
- Ship-to parsed into a structured address; PO number carried onto the order + paperwork.

---

## 8. Shipping: third-party billing, markup & comparison

Distributors either ship on **their** carrier account or on **Unite's marked-up rates** — and see the trade-off before choosing.

**Rate markup (configurable):**
- Pull live rates from Unite's carriers (ShipStation/carrier APIs).
- Apply markup: `unite_rate = carrier_cost × (1 + markup_pct)`, default **10%** (e.g. $9.00 → $9.90).
- Markup is **adjustable**: a global default plus optional per-distributor override; can be raised or lowered.

**Comparison view (at order time):**

| Option | Cost to distributor | Notes |
|---|---|---|
| **Unite rate** (their carrier cost + markup) | `$9.90` | Unite bills it on their invoice |
| **Your account** (third-party billing) | their negotiated rate | billed direct to their carrier account |

- Showing the comparison is the lever: it drives volume to Unite's rates (keeping Unite's negotiated rates low) while always giving the distributor the choice.
- **Third-party billing**: when the distributor ships on their own account, the ShipStation label uses **bill-to-third-party** with their carrier account # + zip — no shipping charge hits Unite.
- **Unite rate chosen**: the marked-up amount is added to the distributor's order/invoice as a freight line.

---

## 9. Distributor portal

`/distributor/*` — gated to distributor accounts (extends PRD-14 roles).

- `/distributor/inventory` — **their** consignment stock: SKU, lot, expiration, qty on-hand/reserved, location, listing visibility (storefront vs warehouse-only). Near-expiry highlighting.
- `/distributor/order` — quick order + catalog (their items + Unite items), blind-ship defaults.
- `/distributor/po-upload` — upload customer PO → draft order.
- `/distributor/reorder` — saved lists / past orders (PRD-26 mechanics).
- `/distributor/shipping` — ship-from identities, carrier accounts (third-party), markup view, rate-comparison preferences.
- `/distributor/documents` — upload packing-slip template + required inserts.
- `/distributor/settlement` — sell-through report: what Unite sold from their stock, owed/settled.
- Multi-email notification recipients (reuses PRD-26 `account_notification_recipients`).

Admin: `/admin/consignment` — per-distributor stock, scan-event audit, markup overrides, blind-ship identity approval.

---

## 10. Data model additions

> **Reconciliation note (PRD-25 UniteWMS):** UniteWMS already owns an append-only
> `stock_movements` ledger, a lot/expiry model, reservations/ATP, and barcode
> receiving/picking. The tables below are written as standalone for clarity, but
> the **preferred implementation is to extend the WMS ledger with an
> `owner_type` / `owner_org_id` dimension** rather than create a parallel
> inventory store — so distributor-owned stock is the same ledger, just
> owner-scoped. `inventory_lots`, `scan_events`, and `consignment_movements`
> below should fold into / reference the WMS equivalents where they exist (see
> §14 open question 1). Treat the DDL as the *required fields*, not a mandate to
> duplicate the WMS.

```sql
-- Migration: 0022_distributor_consignment.sql

-- Owner-tagged, lot-level inventory. Supersedes the implicit "all stock is
-- Unite's" assumption in 0003_inventory.sql for distributor pools.
CREATE TABLE IF NOT EXISTS inventory_lots (
  id                  TEXT PRIMARY KEY,
  owner_type          TEXT NOT NULL DEFAULT 'unite' CHECK (owner_type IN ('unite','distributor')),
  owner_org_id        TEXT REFERENCES organizations(id),       -- null when owner_type='unite'
  product_sku         TEXT REFERENCES products(sku),           -- Unite SKU when applicable
  distributor_sku     TEXT,                                    -- distributor's own part # (warehouse-only items)
  lot_number          TEXT,
  expiration_date     DATE,
  qty_on_hand         INT NOT NULL DEFAULT 0,
  qty_reserved        INT NOT NULL DEFAULT 0,
  warehouse_id        TEXT REFERENCES warehouses(id),
  bin_location        TEXT,
  attributes          JSONB,                                   -- arbitrary per-product key details
  received_via_scan_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invlots_owner ON inventory_lots (owner_type, owner_org_id, product_sku);
CREATE INDEX IF NOT EXISTS idx_invlots_expiry ON inventory_lots (expiration_date) WHERE qty_on_hand > 0;

-- Distributor product listing: visibility + whether Unite may sell it.
CREATE TABLE IF NOT EXISTS distributor_products (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  distributor_sku     TEXT NOT NULL,
  name                TEXT NOT NULL,
  mapped_unite_sku    TEXT REFERENCES products(sku),           -- when listed/sold via Unite catalog
  visibility          TEXT NOT NULL DEFAULT 'warehouse_only'
                        CHECK (visibility IN ('storefront','warehouse_only')),
  unite_sellable      BOOLEAN NOT NULL DEFAULT FALSE,          -- Unite may sell-through this stock
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_org_id, distributor_sku)
);

-- Scan events — provenance for receive + pick (zero-manual-entry proof).
CREATE TABLE IF NOT EXISTS scan_events (
  id                  TEXT PRIMARY KEY,
  kind                TEXT NOT NULL CHECK (kind IN ('receive','pick','adjust')),
  inventory_lot_id    TEXT REFERENCES inventory_lots(id),
  order_id            TEXT REFERENCES orders(id),
  raw_barcode         TEXT,                                    -- the scanned payload
  parsed              JSONB,                                   -- { gtin, lot, expiration } from GS1 AIs
  capture_method      TEXT CHECK (capture_method IN ('gs1_scan','unite_barcode','photo_ocr','manual')),
  photo_url           TEXT,                                    -- fallback capture image
  scanned_by          TEXT,                                    -- profile.id / station id
  station             TEXT,
  scanned_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scan_lot ON scan_events (inventory_lot_id);

-- Sell-through movements for consignment settlement.
CREATE TABLE IF NOT EXISTS consignment_movements (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id),
  inventory_lot_id    TEXT REFERENCES inventory_lots(id),
  order_id            TEXT REFERENCES orders(id),
  qty                 INT NOT NULL,
  unit_cost           NUMERIC(10,2),                           -- owed to distributor (settlement basis)
  movement            TEXT NOT NULL CHECK (movement IN ('sold_by_unite','shipped_for_distributor','adjust')),
  settled             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Distributor ship-from identities (blind / white-label).
CREATE TABLE IF NOT EXISTS distributor_ship_identities (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brand_name          TEXT NOT NULL,                           -- appears as shipper
  return_address      JSONB NOT NULL,                          -- defaults to Unite warehouse addr
  logo_url            TEXT,
  is_default          BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Distributor-supplied paperwork that must ship with their orders.
CREATE TABLE IF NOT EXISTS distributor_documents (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  doc_type            TEXT NOT NULL CHECK (doc_type IN ('packing_slip_template','insert','coa','ifu','other')),
  name                TEXT NOT NULL,
  file_url            TEXT NOT NULL,
  include_on_every_order BOOLEAN NOT NULL DEFAULT FALSE,       -- inserts that always ship
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Distributor carrier accounts for third-party billing.
CREATE TABLE IF NOT EXISTS distributor_carrier_accounts (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  carrier             TEXT NOT NULL,                           -- fedex | ups | usps | dhl
  account_number      TEXT NOT NULL,
  billing_zip         TEXT NOT NULL,
  is_default          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shipping markup config (global default + per-distributor override).
CREATE TABLE IF NOT EXISTS shipping_markup_config (
  id                  TEXT PRIMARY KEY,
  scope               TEXT NOT NULL CHECK (scope IN ('global','distributor')),
  owner_org_id        TEXT REFERENCES organizations(id),       -- null when scope='global'
  markup_pct          NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  updated_by          TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope, owner_org_id)
);

-- Customer-PO ingestion: uploaded source + parsed/learned mappings.
CREATE TABLE IF NOT EXISTS distributor_po_uploads (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_url            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'parsing'
                        CHECK (status IN ('parsing','needs_mapping','ready','ordered','failed')),
  parsed              JSONB,                                   -- { lines:[], ship_to:{}, po_number }
  draft_order_id      TEXT REFERENCES orders(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS distributor_sku_map (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_sku        TEXT NOT NULL,                           -- their customer's / their own part #
  resolved_sku        TEXT,                                    -- Unite SKU or distributor_sku
  resolved_kind       TEXT CHECK (resolved_kind IN ('unite','distributor')),
  UNIQUE (owner_org_id, external_sku)
);

-- Order additions for blind ship + ownership routing.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS on_behalf_of_org_id TEXT REFERENCES organizations(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS blind_ship BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_identity_id TEXT REFERENCES distributor_ship_identities(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_bill_to TEXT
  CHECK (shipping_bill_to IN ('unite_rate','third_party'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_account_id TEXT REFERENCES distributor_carrier_accounts(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_po_upload_id TEXT REFERENCES distributor_po_uploads(id);
```

---

## 11. Module contract sketch

```
src/lib/consignment.js
  availableFor({ owner_type, owner_org_id, sku })      → owner-scoped availability
  reserveConsignment(owner, sku, qty)                  → reserves owner's lots (FEFO)
  recordSellThrough({ owner_org_id, order_id, lots })  → consignment_movements

src/lib/scanning.js
  parseGs1(barcode)                                    → { gtin, lot, expiration }
  receiveScan({ owner, barcode|photo, station, by })   → inventory_lots + scan_events row
  pickScan({ order_id, barcode })                      → decrement lot + lot_tracking write
  generateLotBarcode(lot, expiration)                  → encoded label for warehouse print

src/lib/blindShip.js
  shipIdentityFor(order)                               → distributor brand + address (or fallback)
  packingDocsFor(order)                                → distributor template + required inserts

src/lib/shippingRates.js
  quoteRates({ weight, dims, ship_to })                → live carrier rates
  applyMarkup(cost, org)                               → cost × (1 + markup_pct)  [global/override]
  compareForDistributor(order)                         → [{ unite_rate }, { their_account }]

src/lib/poIngestion.js
  ingestPo({ owner_org_id, file })                     → parse → match → draft order
  resolveSku(owner_org_id, external_sku)               → mapping (learns + persists)
```

ShipStation client (`external/shipstation.js`) extends to accept `shipFrom` identity, `billToThirdParty` (account #, zip), and to return rate arrays for comparison. Fulfillment orchestrator (PRD-24) reads `orders.blind_ship` / `ship_identity_id` / `shipping_bill_to` / `carrier_account_id` and selects the right label + packing doc accordingly.

---

## 12. Phases

### Phase 1 — Consignment inventory + ownership
- `inventory_lots` owner model; `availableFor` owner-scoping; distributor vs Unite pools never commingled.
- `/distributor/inventory` read view + `/admin/consignment`.

**Exit:** A distributor sees only their stock; Unite availability for the same product is unaffected; admin sees both pools side by side.

### Phase 2 — Scan-in / scan-out
- GS1/UDI barcode parse (`(01)(10)(17)`); receive + pick scan flows; `scan_events` provenance.
- Fallback capture: photo+OCR confirm and Unite-generated encoded lot barcode. FEFO pick suggestion.

**Exit:** Warehouse staff receives a pallet and picks an order entirely by scanning — lot + expiration captured with zero keyboard entry; near-dated lots picked first.

### Phase 3 — Distributor ordering + sell-through
- Distributor quick order / reorder against their stock + Unite catalog (PRD-26 mechanics).
- `unite_sellable` storefront listing; a Unite sale decrements the distributor's lots + writes `consignment_movements`.

**Exit:** A distributor places an order against their consignment stock; separately, a Unite storefront sale of a `unite_sellable` distributor SKU draws down that distributor's lots and shows in their settlement report.

### Phase 4 — Blind / white-label shipping + custom paperwork
- Ship-from identities; ShipStation `shipFrom` override; distributor packing-slip template + always-include inserts via PRD-17.
- Pack-out checklist lists required documents.

**Exit:** A distributor order ships with their brand on the label and their packing slip + insert in the box; no "Unite Medical" appears to the recipient; a non-blind Unite order is unaffected.

### Phase 5 — Third-party billing + rate markup + comparison
- Live rate pull; configurable markup (default 10%, global + per-distributor override).
- "Unite rate vs your account" comparison at order time; third-party bill-to on the label when chosen; freight line added when Unite rate chosen.

**Exit:** A distributor sees $9.00 carrier cost shown as $9.90 Unite rate next to their own account rate, picks one; third-party choice bills their carrier (no charge to Unite), Unite-rate choice adds the marked-up freight to their invoice; admin changes markup to 12% and the quote updates.

### Phase 6 — Customer-PO ingestion
- Upload PDF/xlsx/image → parse items, qty, ship-to, PO #; match to SKUs; learned `distributor_sku_map`.
- Low-confidence lines flagged for mapping; confirmed POs become draft orders with blind-ship defaults.

**Exit:** A distributor uploads a customer PO; the system produces a draft order with correct items, quantities, and ship-to; an unrecognized part # is flagged, mapped once, and auto-matches on the next upload.

---

## 13. Verifier

`scripts/consignment_check.py` (added once Phase 1 lands):

- Assert availability is **always** owner-scoped — no query sums distributor + Unite stock as one number.
- Assert every receive and pick has a `scan_events` row; flag any inventory change with `capture_method='manual'`.
- Assert a Unite sale of a `unite_sellable` distributor SKU writes a `consignment_movements` row and decrements the distributor's lot (not Unite's).
- Assert a blind-ship order's label + packing slip carry **no** Unite identity and use the distributor `ship_identity_id`.
- Assert `applyMarkup` is the only path producing a distributor-facing shipping price (no raw carrier cost shown as the Unite rate).
- Assert third-party-billed orders set `billToThirdParty` and add no freight charge to Unite.

---

## 14. Open questions

1. **WMS integration boundary** — UniteWMS (PRD-25) shipped as the native warehouse system (append-only `stock_movements` ledger, lots/expiry, reservations/ATP, receiving + pick/pack/ship, barcode workflows). This PRD's consignment must be **owner-tagged extensions of that ledger**, not a parallel inventory store: `inventory_lots` here should reconcile to (or fold into) UniteWMS's lot + movement model with an `owner_type`/`owner_org_id` dimension, and `scan_events` should reuse the WMS receiving/picking capture rather than a second scanner UI. **Action for Alex:** confirm whether owner-tagging lands as columns on the existing WMS lot/movement tables (preferred — one ledger) vs. the separate tables sketched in §10, so we don't double-build receive/pick.
2. **Barcode standard** — are distributor inbounds reliably GS1/UDI-marked, or do many arrive with non-standard / no barcodes (making photo-OCR or Unite-generated barcodes the common path, not the fallback)? Drives how much OCR effort to invest.
3. **Settlement cadence** — how/when does Unite pay distributors for sell-through (and bill 3PL storage + the shipping markup)? Movements are recorded now; the billing run is deferred — needs its own cadence decision (monthly statement vs per-sale).
4. **Blind-ship return address** — distributor's own address, Unite's warehouse, or a neutral PO box? Default assumed = distributor brand + Unite warehouse address (so returns reach the goods). Confirm per distributor.
5. **Lot/expiration on Unite-owned stock** — extend scan-in/out to all Unite inventory too, or distributor consignment first? Recommendation: build owner-agnostic, roll out to consignment first.
6. **Markup transparency** — should the distributor see the raw carrier cost, or only the marked-up Unite rate next to their own account rate? Recommendation: show only Unite rate vs their rate (don't expose Unite's carrier cost).

---

## 15. Out-of-band

- **UniteWMS (PRD-25)** is the inventory/scan foundation — shipped. This PRD's consignment owner-tagging, scan reuse, and lot/expiry capture build on the WMS `stock_movements` ledger + lot model (see §10 reconciliation note + open question 1).
- Warehouse scanner / tablet hardware + label printer (for Unite-generated lot barcodes) — shared with UniteWMS receiving.
- ShipStation third-party-billing + `shipFrom` override confirmed on the live account.
- Carrier rate API access for live rate pulls (ShipStation or direct FedEx/UPS).
- OCR/AI extraction budget for PO + box-label parsing (reuses PRD-11 Claude + PRD-18 xlsx).
- Initial distributor onboarding data: ship-from identities, carrier accounts, packing-slip templates, required inserts, consignment opening counts.

---

## 16. Definition of done

- Distributor-owned stock is tracked separately from Unite's, lot- and expiration-level, never commingled.
- Warehouse staff receive and pick by **scanning** — lot + expiration captured with zero manual entry (photo/encoded-barcode fallbacks exist).
- A distributor orders against their own stock and Unite's catalog; some of their SKUs sell on the Unite storefront (drawing down their pool), others stay warehouse-only but remain orderable by them.
- Distributor orders **blind ship** under their brand with their packing slip + required inserts; the recipient never sees Unite.
- Distributors ship on their own carrier account (third-party billed) or on Unite's marked-up rates, after seeing a "Unite rate vs. your rate" comparison; markup defaults to 10% and is adjustable globally and per distributor.
- A distributor uploads their customer's PO and the system produces a correct draft order (items, quantities, ship-to), learning SKU mappings over time.
- Every sell-through movement is recorded for settlement; multi-recipient notifications fire per PRD-26.
