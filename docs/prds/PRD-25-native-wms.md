# PRD-25 — Unite Native Inventory & Warehouse Management System (UniteWMS)

**Source:** Alex (CTO) + Damon (CEO) — pre-launch decision to own the WMS
instead of renting Cin7 Core (~$349–799/mo) — see `docs/Unite_Medical_Decisions.docx` D-16.
**Owner:** Alex (CTO) · Warehouse Lead as product partner
**Status:** draft / proposed
**Supersedes:** PRD-04 (Cin7 Core) — *for the build path.* PRD-04's data flows,
decommission list, and lot-tracking SLA are inherited; only the "buy Cin7"
mechanism is replaced with "build UniteWMS."
**Depends on:** PRD-01 (Platform Foundation — serverless proxy + Neon),
PRD-02 (QBO — landed-cost bills), PRD-03 (Flexport — receiving trigger).
**Blocks / unblocks:** PRD-08 (Quoting needs real inventory), PRD-12
(Forecasting reads on-hand), PRD-24 (Zero-touch fulfillment reserves stock),
and the `/compliance` recall SLA.

> "Build our own inventory + WMS — robust, owned, and wired into the rest of
> the platform — rather than pay Cin7 forever." — Damon, 2026-06-19

---

## 0. Why build instead of buy (the thesis)

| Dimension | Cin7 Core (rent) | UniteWMS (build) |
|---|---|---|
| Cost | $349–799/mo forever (~$4.2k–9.6k/yr) | One-time build + Neon/Vercel marginal cost |
| Data ownership | Lives in Cin7; API rate-limited | Lives in **our** Neon Postgres |
| Fit | Generic; we bend to their model | Modeled exactly on medical-distribution needs (lot/expiry, HCPCS, FDA) |
| Integration | API round-trips, polling, drift | **Same database** as orders/quotes/fulfillment — zero drift, no sync lag |
| Extensibility | Limited to their roadmap | We own every line; AI features (PRD-11) plug straight in |
| Risk | Vendor lock-in, price hikes | We carry the maintenance burden |

**The decisive technical advantage:** every other surface (orders,
fulfillment, replenishment, quoting, receiving, compliance) **already reads and
writes the same in-app DB**. Cin7 forces a sync boundary — poll every 5 min,
reconcile drift, run a nightly `cin7_check.py` to detect when the two systems
disagree. A native WMS **erases that boundary**: inventory truth and order truth
are one transaction. That is strictly more robust than any API-synced WMS.

**Honest cost of building:** we take on receiving UX, cycle-count discipline,
barcode hardware integration, and the long tail of edge cases (damaged goods,
partial receipts, returns-to-stock, stock takes) that Cin7 ships for free. This
PRD is scoped to make that tractable, not to pretend it's trivial.

---

## 1. North star

A single, owned system where **inventory, lots/expiry, purchase orders,
receiving, pick/pack/ship, adjustments, transfers, and cycle counts** all live
in our Neon Postgres, are mutated through one auditable service layer, and are
connected by direct API to **QuickBooks** (landed-cost + COGS), **ShipStation**
(labels/tracking), **Flexport** (inbound clearance), and our **B2B portal +
storefront**. Stock is accurate to the unit, in real time, with a full
movement ledger behind every number.

Three non-negotiables:
1. **Every stock change is a ledger entry.** On-hand is a *projection* of an
   append-only `stock_movements` table, never a directly-edited integer. This is
   the single most important architectural decision in this doc.
2. **Lot + expiry traceability** good enough that a recall query returns every
   affected customer in **< 1 second** (backs the `/compliance` SLA).
3. **Reservations are real.** Available-to-promise = on_hand − reserved, so two
   orders can never sell the same unit (the bug Cin7's `Allocated` field solves).

---

## 2. Current state (what already exists in the repo)

UniteWMS is **not greenfield** — ~60% of the data model and the surrounding
chains already ship as stubs:

| Asset | File | State |
|---|---|---|
| `inventory` table (on_hand, reserved, reorder_at) | `docs/schema/migrations/0003_inventory.sql` | exists |
| `warehouses` table (wh_atl, wh_reno) | same | exists |
| `lot_tracking` table + recall query | `docs/schema/lot_tracking.sql` | exists, unused |
| `purchase_orders` (drafted by replenishment) | `0015_replenishment_digest.sql` | exists |
| Cin7 adapter (to be replaced by native service) | `src/lib/external/cin7.js` | stub |
| Inbound receiving chain | `src/lib/receiving.js` | **working** (Flexport→inventory→QBO→reorder) |
| Run-rate replenishment + PO drafting | `src/lib/replenishment.js` | **working** |
| Zero-touch fulfillment (reserve→ship) | `src/lib/fulfillment.js` | **working** |
| Admin inventory / replenishment / fulfillment pages | `src/pages/admin/*` | exist |

**What's missing and this PRD adds:** the append-only movement ledger, true
reservations/ATP, lot+expiry capture at receive and consumption at ship, a
receiving UI, cycle counts, inter-warehouse transfers, bin/location granularity,
and barcode-scanner workflows — i.e. the parts that make it a *WMS* rather than a
stock-count mirror.

---

## 3. Scope

### In scope
- **Stock-movement ledger** as the source of truth (replaces direct `on_hand`
  edits everywhere).
- **Reservations / available-to-promise** engine.
- **Lot & expiration** capture at receive, FEFO consumption at ship, full
  genealogy (`received_from_shipment` → `order_id`/`customer_id`).
- **Purchase orders**: create → approve → send to vendor → receive (partial +
  over/under) → close, with QBO bill posting on receipt.
- **Receiving workstation UI** (mobile/tablet, barcode-first): scan SKU + lot +
  expiry + qty against an open PO, with blind-receipt and discrepancy flows.
- **Pick / pack / ship**: pick lists, packing slips (reuse `src/lib/pdf.js`),
  ShipStation label creation, lot decrement on ship.
- **Cycle counts & stock takes** with variance posting to the ledger.
- **Inter-warehouse transfers** (wh_atl ↔ wh_reno) with in-transit state.
- **Bin/location** sub-warehouse granularity (aisle/shelf/bin).
- **Bundle/kit SKUs**: stock = `min(component_on_hand / qty)`.
- **Adjustments** (damage, loss, found) — reason-coded, ledgered.
- **Direct API integrations**: QBO, ShipStation, Flexport, GS1 (GTIN validation
  at product onboard), storefront/portal.
- **Demand-driven reorder points** (already in `replenishment.js`; this PRD
  feeds it real movement data).
- **Roles & audit**: warehouse_operator / warehouse_manager / admin, every
  mutation in `audit_log`.

### Out of scope (v1)
- Robotics / conveyor / AS-RS automation.
- Multi-currency vendor billing (PRD-22 already handles FOB→USD normalization
  upstream).
- 3PL/dropship orchestration beyond our two warehouses.
- Serial-number tracking (lot-level is the medical requirement; serialized
  devices are a v2 if Class III volume grows).
- Replacing the Shopify storefront (PRD-13 decision); UniteWMS owns inventory
  truth regardless of which storefront sits in front.

---

## 4. Architecture

### 4.1 The ledger principle (read this twice)

```
on_hand(sku, warehouse, bin)  ≝  SUM(stock_movements.qty_delta)
                                  WHERE sku/warehouse/bin match
```

`stock_movements` is **append-only**. Nothing edits `inventory.on_hand`
directly. Every receipt, ship, adjustment, transfer, and count writes a signed
delta with a typed reason and a reference to its source document. `inventory` is
a **materialized projection** (kept current via a transactional trigger or a
recompute service) so reads stay fast, but the ledger is the truth. Benefits:
perfect auditability, trivial point-in-time reconstruction, no "how did stock go
negative" mysteries, and a natural undo (post a reversing movement).

### 4.2 Service layer (single write path)

All mutations go through `src/lib/wms/` so business rules live in exactly one
place:

```
src/lib/wms/
  ledger.js        post(movement) — the ONLY writer of stock_movements;
                   updates the inventory projection in the same transaction
  availability.js  onHand(), reserved(), availableToPromise(), byLot()
  reservations.js  reserve(order), release(order), commit(order) [→ ship]
  lots.js          receiveLot(), pickFEFO(), genealogy(), expiringSoon()
  receiving.js     (evolve existing) PO receipt → lots + ledger + QBO bill
  purchaseOrders.js create/approve/send/receive/close lifecycle
  picking.js       buildPickList(order), confirmPick(), shortPick()
  packing.js       packSlip(order) [pdf.js], cartonize()
  shipping.js      ShipStation label, tracking, lot-commit on ship
  transfers.js     wh→wh transfer with in_transit ledger pair
  counts.js        cycle count sessions, variance → adjustment movements
  adjustments.js   reason-coded manual deltas (damage/loss/found)
  bundles.js       kit explosion + min-component availability
```

The current `external/cin7.js` is **retired**; `services.js` re-exports the
native modules so existing callers (`fulfillment.js`, `replenishment.js`,
admin pages) keep working with minimal churn.

### 4.3 Where it runs

- **Data:** Neon Postgres (PRD-01). The in-browser DB stays the dev/demo mirror;
  `remoteDb.js` write-through persists movements.
- **Mutations:** serverless routes under `api/wms/*` behind the existing auth
  proxy. The browser never writes stock directly in production — it POSTs intents
  that the server validates and ledgers (prevents client-tampered stock).
- **Integrations:** through the existing `/api/proxy/<service>` pattern so
  secrets stay server-side.

---

## 5. Data model (new + evolved tables)

New migration `0019_wms.sql`. Evolves the existing `inventory`/`lot_tracking`.

```sql
-- 5.1 The ledger — append-only, the source of truth -----------------------
CREATE TABLE stock_movements (
  id            BIGSERIAL PRIMARY KEY,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  product_sku   TEXT NOT NULL REFERENCES products(sku),
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id),
  bin_id        TEXT REFERENCES bins(id),
  lot_id        BIGINT REFERENCES lots(id),
  qty_delta     INT  NOT NULL,                 -- signed: +receipt / -ship
  reason        TEXT NOT NULL,                 -- receipt|ship|adjust_damage|
                                               -- adjust_loss|found|transfer_out|
                                               -- transfer_in|count_variance|
                                               -- reservation_commit|return_restock
  ref_type      TEXT,                          -- purchase_order|order|transfer|count|manual
  ref_id        TEXT,
  unit_cost     NUMERIC(12,4),                 -- landed cost at receipt (FIFO/FEFO)
  actor_id      TEXT,                          -- profile.id / station id
  note          TEXT
);
CREATE INDEX idx_mov_sku_wh   ON stock_movements (product_sku, warehouse_id);
CREATE INDEX idx_mov_ref      ON stock_movements (ref_type, ref_id);
CREATE INDEX idx_mov_lot      ON stock_movements (lot_id);

-- 5.2 Inventory projection (kept current from the ledger) ------------------
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS bin_id TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS in_transit INT NOT NULL DEFAULT 0;
-- on_hand + reserved already exist; available = on_hand - reserved (view below)

CREATE OR REPLACE VIEW v_availability AS
  SELECT product_sku, warehouse_id,
         SUM(on_hand)  AS on_hand,
         SUM(reserved) AS reserved,
         SUM(on_hand) - SUM(reserved) AS available
  FROM inventory GROUP BY product_sku, warehouse_id;

-- 5.3 Bins / locations ----------------------------------------------------
CREATE TABLE bins (
  id            TEXT PRIMARY KEY,             -- e.g. ATL-A12-3
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id),
  zone          TEXT, aisle TEXT, shelf TEXT, position TEXT,
  pickable      BOOLEAN DEFAULT TRUE,
  UNIQUE (warehouse_id, id)
);

-- 5.4 Lots (evolves lot_tracking into receive-time lots) ------------------
CREATE TABLE lots (
  id             BIGSERIAL PRIMARY KEY,
  product_sku    TEXT NOT NULL REFERENCES products(sku),
  lot_number     TEXT NOT NULL,
  expiration_date DATE,
  warehouse_id   TEXT NOT NULL REFERENCES warehouses(id),
  bin_id         TEXT REFERENCES bins(id),
  qty_received   INT NOT NULL,
  qty_remaining  INT NOT NULL,                -- decremented FEFO at ship
  unit_cost      NUMERIC(12,4),
  received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_from_shipment TEXT,
  received_by    TEXT,
  UNIQUE (product_sku, lot_number, warehouse_id)
);
CREATE INDEX idx_lots_lot   ON lots (lot_number);
CREATE INDEX idx_lots_fefo  ON lots (product_sku, warehouse_id, expiration_date);

-- lot_tracking (existing) becomes the SHIP-SIDE genealogy: which lot went
-- to which order/customer. Keep it; populate it from shipping.js on commit.

-- 5.5 Purchase orders (evolve existing) -----------------------------------
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
  -- draft → approved → sent → partial → received → closed → cancelled
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
-- line items already carry received_qty in the JSONB shape (replenishment.js)

-- 5.6 Reservations --------------------------------------------------------
CREATE TABLE reservations (
  id            BIGSERIAL PRIMARY KEY,
  order_id      TEXT NOT NULL,
  product_sku   TEXT NOT NULL REFERENCES products(sku),
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id),
  qty           INT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'held',  -- held → committed → released
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_resv_order ON reservations (order_id);

-- 5.7 Counts & transfers --------------------------------------------------
CREATE TABLE count_sessions (
  id TEXT PRIMARY KEY, warehouse_id TEXT, status TEXT DEFAULT 'open',
  started_by TEXT, started_at TIMESTAMPTZ DEFAULT NOW(), closed_at TIMESTAMPTZ
);
CREATE TABLE count_lines (
  id BIGSERIAL PRIMARY KEY, session_id TEXT REFERENCES count_sessions(id),
  product_sku TEXT, bin_id TEXT, system_qty INT, counted_qty INT, variance INT
);
CREATE TABLE transfers (
  id TEXT PRIMARY KEY, from_wh TEXT, to_wh TEXT, status TEXT DEFAULT 'draft',
  -- draft → in_transit → received
  created_at TIMESTAMPTZ DEFAULT NOW(), shipped_at TIMESTAMPTZ, received_at TIMESTAMPTZ
);
CREATE TABLE transfer_lines (
  id BIGSERIAL PRIMARY KEY, transfer_id TEXT REFERENCES transfers(id),
  product_sku TEXT, qty INT, lot_id BIGINT
);
```

**Invariant the verifier enforces:** for every (sku, warehouse),
`inventory.on_hand == SUM(stock_movements.qty_delta)`. If they ever diverge, the
ledger wins and the projection is rebuilt.

---

## 6. Integrations (direct, via the existing proxy)

| System | Direction | What flows | PRD link |
|---|---|---|---|
| **QuickBooks** | push | Landed-cost **Bill** on PO receipt (freight+duty→COGS); Invoice marked shipped | PRD-02; `receiving.js` already calls `qbo.createBillFromFlexport` |
| **ShipStation** | push/pull | Create label on ship; ingest tracking + `shipped` webhook → lot commit | PRD-04 §3 (direct API, bypass Shopify) |
| **Flexport** | pull | `shipment.cleared` → open receipt against PO | PRD-03; `receiving.js` entry point exists |
| **GS1** | pull | GTIN mod-10 + validation at product onboard / receive scan | existing `/admin/products/onboard` |
| **Storefront / B2B portal** | push | `v_availability.available` gates add-to-cart & checkout | PRD-08/14 |
| **Forecast sidecar** | pull | Prophet daily mean refines reorder points | PRD-12; `replenishment.js` ready |

All keyed through `/api/proxy/<service>` — **no new secret model**; reuses the
keys in `docs/Unite_Medical_Keys_and_Accounts.docx` (Stripe-adjacent ones not
needed here; QBO/ShipStation/Flexport/GS1 are).

---

## 7. Core flows (must all be transactional + audited)

```
INBOUND (PO → stock)
  PO approved → sent to vendor (email via Resend / PDF via pdf.js)
  Flexport shipment.cleared  (or manual "Receive" on the workstation)
    → receiving UI: scan SKU + lot + expiry + qty against open PO line
    → lots row created; stock_movements +qty (reason=receipt, unit_cost=landed)
    → inventory projection += qty
    → PO line received_qty += qty; PO status → partial/received
    → QBO landed-cost Bill posted
    → replenishment.recalcReorderPoints()
  (this chain already exists in receiving.js — PRD wraps it in lots+ledger)

OUTBOUND (order → ship)
  Order placed → reservations.reserve(): available checked, reserved += qty
    → (cannot reserve more than available — no oversell)
  Pick list built (FEFO lot selection per line)
    → operator confirms pick (scan) → reservation status=committed
  Pack → packing slip PDF → ShipStation label
  shipped webhook → lots.pickFEFO decrements qty_remaining
    → stock_movements -qty (reason=ship); inventory.on_hand -= qty; reserved -= qty
    → lot_tracking row: lot → order_id + customer_id (recall genealogy)
    → QBO invoice marked shipped; customer notified with tracking

ADJUST / COUNT / TRANSFER
  Cycle count session → count_lines variance → stock_movements (count_variance)
  Damage/loss/found → adjustments → stock_movements (reason-coded)
  Transfer wh_atl→wh_reno → movement pair (transfer_out / in_transit / transfer_in)

RECALL (the SLA)
  SELECT customer genealogy WHERE lot_number = $1  → < 1s, all affected buyers
```

---

## 8. UI surfaces

Evolve the existing admin shell (`/admin/inventory`, `/admin/replenishment`,
`/admin/fulfillment` already exist):

| Route | Purpose |
|---|---|
| `/admin/inventory` | On-hand/available/reserved per SKU per warehouse + bin drill-down; movement history per SKU |
| `/admin/inventory/receive` | **Receiving workstation** — mobile/tablet, barcode-first, against open POs; blind + discrepancy receipts |
| `/admin/inventory/count` | Cycle-count sessions; scan-to-count; variance review → post |
| `/admin/inventory/transfers` | Create/track wh↔wh transfers |
| `/admin/inventory/lots` | Lot browser; expiring-soon (FEFO) alerts; recall lookup box |
| `/admin/purchase-orders` | PO lifecycle board (draft→closed); receive against PO |
| `/admin/fulfillment` | (exists) pick/pack/ship — now backed by reservations + FEFO |
| `/admin/replenishment` | (exists) run-rate/Prophet reorder + 1-click PO draft |

Receiving + counting screens must work on a **handheld scanner / phone**
(large tap targets, camera-or-wedge barcode input, offline-tolerant queue).

---

## 9. Phases (each ships behind a verifier; phase N gated on N−1)

### Phase 0 — Ledger foundation
Migration `0019_wms.sql`; `wms/ledger.js` + `availability.js`; backfill: seed a
`receipt` movement per current `inventory.on_hand` so the projection reconciles.
**Exit:** `on_hand == SUM(movements)` for every SKU; reads come from the view.

### Phase 1 — Reservations / ATP
`wms/reservations.js`; wire checkout + `fulfillment.js` to reserve→commit;
storefront gates on `available`, not `on_hand`.
**Exit:** two concurrent orders for the last unit — exactly one succeeds.

### Phase 2 — Purchase orders + receiving + lots
PO lifecycle; receiving workstation UI; lots at receive; QBO bill on receipt;
evolve `receiving.js` to write lots + ledger.
**Exit:** receive a PO with a lot+expiry; on-hand and a QBO bill both reflect it;
partial receipt leaves the PO `partial`.

### Phase 3 — Pick / pack / ship + FEFO + recall genealogy
FEFO pick lists; packing slips (`pdf.js`); ShipStation labels; lot decrement +
`lot_tracking` genealogy on ship.
**Exit:** ship an order → correct lot decremented FEFO; recall query on that lot
returns the customer in < 1s.

### Phase 4 — Counts, transfers, adjustments, bins
Cycle counts with variance posting; wh↔wh transfers with in-transit; reason-coded
adjustments; bin granularity.
**Exit:** a cycle count variance posts a `count_variance` movement and corrects
on-hand; a transfer moves stock with an in-transit window.

### Phase 5 — Bundles + storefront truth + forecast loop
Kit explosion; bundle availability = min(component); homepage live-inventory
widget reads real available; Prophet reorder loop closed.
**Exit:** a bundle with one OOS component shows OOS on `/catalog`.

### Phase 6 — Hardening
Idempotency keys on all movement posts; movement reversal/undo; nightly
reconciliation job; role-based access; runbook for the Warehouse Lead.
**Exit:** verifier green; reconciliation finds zero drift over a week.

---

## 10. Verifier

`scripts/wms_check.py` (CI + nightly):
- **Ledger invariant:** for all (sku, wh), `on_hand == SUM(qty_delta)`. Hard fail.
- **No oversell:** no `available < 0` in `v_availability`.
- **Lot conservation:** `SUM(lots.qty_remaining) == SUM(on_hand)` per sku/wh
  for lot-tracked items.
- **Recall latency:** recall query on a seeded lot returns < 1s.
- **PO math:** `SUM(line.received_qty) == receipt movements` per PO.
- **Reservation math:** `SUM(reservations.held) == inventory.reserved`.

Plus `node scripts/verify_orchestration.mjs` extended with WMS runtime checks.

---

## 11. Non-functional requirements

- **Consistency:** all multi-row mutations in a single DB transaction; movement
  posts carry an **idempotency key** (so a retried webhook can't double-receive).
- **Performance:** availability reads < 50 ms (indexed projection); recall < 1 s.
- **Auditability:** every mutation → `audit_log` + the movement itself is the
  audit trail.
- **Offline tolerance:** receiving/counting UI queues scans locally and syncs.
- **Security:** stock mutations only via server routes; role-gated; no client
  writes to `on_hand` in prod.
- **Observability:** movement volume, drift alerts, expiring-lot alerts surface
  on `/admin/inventory` and the CEO digest.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Build underestimates WMS edge cases | Phase gating; start with the 2-warehouse, ~87-SKU reality; lean on the ledger to make any state recoverable |
| Receiving discipline (staff don't scan) | Mobile-first UI, blind receipts, manager variance review; mirror Cin7's own app ergonomics |
| Barcode hardware | Support camera scan + USB/BT wedge; Zebra TC22 optional, not required |
| Data migration from Shopify on-hand | One-time seed as Phase-0 `receipt` movements; reconcile against a physical count |
| We become the support team | Runbook + verifier + reconciliation job; the ledger means no unrecoverable states |
| Scope creep into serialized/robotics | Explicitly out of scope v1 |

---

## 13. Out-of-band (what Damon/ops provide)

- A **physical opening count** per warehouse to seed Phase 0 accurately.
- Barcode symbology in use (UPC/GTIN/Code128?) and label format.
- Whether to keep Shopify as headless storefront (PRD-13) — UniteWMS is agnostic.
- Scanner hardware decision (camera-phone vs Zebra TC22 ~$700 ea).
- Keys already in the keys doc: QBO, ShipStation, Flexport, GS1.

---

## 14. Definition of done

- All ~87+ SKUs live in UniteWMS, on-hand == ledger, accurate to the unit.
- No oversell possible (reservations enforced at checkout).
- Receive → lots + QBO landed-cost bill, automatically, on Flexport clearance.
- Ship → FEFO lot decrement + recall genealogy; recall query < 1 s on a real lot.
- Cycle counts, transfers, adjustments all post to the ledger and reconcile.
- Bundles report truthful availability on the storefront.
- `scripts/wms_check.py` green; nightly reconciliation finds zero drift.
- Warehouse Lead has a written runbook (`docs/runbooks/wms.md`).
- **Cin7 subscription never started** — ~$4.2k–9.6k/yr saved.

---

## 15. Relationship to PRD-04

PRD-04 (Cin7 Core) stays in the repo as the **"rent" alternative**. If UniteWMS
proves too costly to maintain, PRD-04 is the fallback: the `external/cin7.js`
adapter still exists and `services.js` can re-point to it. This PRD is the
**"own it"** path and is the recommended direction per D-16.
