# PRD-04 — Warehouse Management System (Cin7 Core)

**Source:** CTO Brief §3, §10 (Priority #3)
**Owner:** Alex (CTO) + Warehouse Lead as product partner
**Status:** draft
**Depends on:** PRD-01 (Platform), PRD-02 (QBO mirror for items + customers), PRD-03 (Flexport receiving trigger)
**Blocks:** PRD-08 (Quoting engine needs real inventory), PRD-12 (Forecasting reads from WMS), and decommissions ~5 Shopify apps

> "Replace Shopify PO/inventory — single source of truth." — Brief §2

---

## 1. North star

Inventory, POs, receiving, pick/pack, and lot tracking all live in one
system (Cin7 Core), connected via API to QBO, ShipStation, and our
B2B portal. Shopify's PO/inventory features are decommissioned. Stock
levels are accurate to the unit, in real time.

---

## 2. Current state

- Inventory + POs are managed inside Shopify (clunky, not a real WMS)
- Multiple Shopify apps duct-tape what's missing (Stockie Low Stock,
  Bundles.app, Order Printer Pro — see brief §3 for the full list)
- ShipStation works via the Shopify plugin (not direct API)
- Our codebase has tables `inventory`, `warehouses`, `products` and a
  `cin7` stub in `services.js` — both ready to be wired

---

## 3. Scope

### In scope

- Stand up Cin7 Core as the WMS
- Replace Shopify-app stack with Cin7-native features (low stock,
  bundles, picking, packing slips, COGS)
- Bidirectional API integration with: Cin7 (master), QBO (PRD-02),
  ShipStation (direct, bypassing Shopify), our B2B portal
- Lot-level tracking with the schema already drafted at
  `docs/schema/lot_tracking.sql`
- Receiving workflow: Flexport `customs_cleared` event → Cin7 receive
  PO automatically
- Demand-driven reorder points (manual now; ML-driven in PRD-12)

### Out of scope

- Replacing Shopify storefront — that's PRD-13's decision. v1 is
  **headless Shopify**: keep Shopify as the public catalog/checkout
  but Cin7 owns inventory truth
- Multi-warehouse robotics / automation
- Surplus inventory intake (PRD-10 covers this; lives in our portal,
  not Cin7)

### Decommission list (Shopify apps)

Per brief §3, these apps can be removed once Cin7 is live:

| App | Saved | Why redundant |
|---|---|---|
| Stockie Low Stock Alert | $19.99/mo | Cin7 has reorder alerts |
| Bundles.app Inventory Sync | $19/mo | Cin7 handles bundle SKUs |
| Order Printer Pro | usage | We auto-PDF from our platform |
| Helium Customer Fields | $26/mo | Our B2B portal handles custom fields (PRD-14) |
| Locksmith B2B gating | $9/mo | Auth-gated catalog (PRD-14) |
| AAA Custom Form Builder | $9.99/mo | Native forms |
| Orderly Emails | $99/yr | HubSpot/transactional email |
| Omnisend | varies | HubSpot consolidation |
| **Total ~$700/yr eliminated** | | |

---

## 4. Data flows

```
PO created in Cin7
    → Flexport booking created (PRD-03)
    → QBO PurchaseOrder posted (PRD-02)
    → our `purchase_orders` table mirrors

Flexport customs_cleared event
    → Cin7 receiving workflow opens
    → expected vs actual quantities reconciled
    → on accept: Cin7 inventory increments + lot rows created
    → QBO Bill posted with landed cost
    → demand model refreshes reorder points (PRD-12)

Order placed in B2B portal / Shopify
    → Cin7 allocates stock from preferred warehouse
    → ShipStation order created (direct API, not via Shopify)
    → pick list printed
    → on `shipped` event: Cin7 decrements + lot rows record buyer
    → QBO Invoice marked shipped
    → customer notification with tracking

Low stock detected in Cin7
    → forecast model (PRD-12) computes reorder qty
    → draft PO created in QBO + alert in `/admin/inventory`
```

---

## 5. Tables we own (mirror Cin7, but enriched)

```sql
-- products mirrors Cin7 master + Shopify catalog fields
-- inventory mirrors Cin7 stock-on-hand per warehouse
-- purchase_orders mirrors Cin7 POs

-- already drafted in repo:
-- docs/schema/lot_tracking.sql — DDL + recall query
```

The audit confirms `docs/schema/lot_tracking.sql` already exists and
is referenced in PRD §6.2 of the original site PRD. PRD-04 applies it
to the live database.

---

## 6. Phases

### Phase 1 — Cin7 account + master data import

- Cin7 Core subscription set up; production + sandbox
- One-time import: 87 active products (from `src/data/realCatalog.js`),
  bundle SKUs, current on-hand quantities
- Warehouse codes match our DB: `wh_atl` (Lithia Springs) and
  `wh_reno` (Nevada)
- Audit-find #1 from PRD-00: `wh_dal` is already deleted

**Exit:** Cin7 admin shows the same SKU + stock counts as
`src/data/realCatalog.js` + current Shopify on-hand.

### Phase 2 — API integration: Cin7 ↔ our DB

- `cin7Client` replaces the `services.js` `cin7` stub
- Inventory poll every 5 minutes (or webhook if Cin7 supports it for
  our tier — check)
- Product upsert: bidirectional; conflict policy: Cin7 wins on stock
  fields, we win on catalog fields (description, images)
- `/admin/inventory` reads from our mirrored table; all writes go to
  Cin7 first

**Exit:** A stock adjustment in Cin7 appears in our admin within 5
minutes. A new product added in our admin appears in Cin7 within 5
minutes.

### Phase 3 — Direct ShipStation API (bypass Shopify plugin)

- Disconnect ShipStation from Shopify
- Reconnect directly via `ssapi.shipstation.com`
- Replace `services.js` `shipstation` stub body with real client
- Multi-warehouse routing: orders ship from the closest warehouse
  with stock
- Carrier rate shop (FedEx / UPS / USPS) per existing simulator
  shape — wire to real rates

**Exit:** Orders flow Cin7 → ShipStation → tracking with no Shopify
involvement.

### Phase 4 — Lot tracking + receiving workflow

- Apply `docs/schema/lot_tracking.sql` to production
- Receiving workflow: scanner UI in `/admin/inventory/receive` (mobile
  optimized) — scan barcode + lot # + qty
- Every shipped line item writes a `lot_tracking` row with `scanned_by`
- Recall query: `SELECT customer_id FROM lot_tracking WHERE lot_number = ?`
  must return all affected customers in under 1 second

**Exit:** A recall test on a known lot returns the customer list in
under 1 second. The `/compliance` page promise of "within one business
day" is now backed by sub-second data.

### Phase 5 — Decommission Shopify apps

- One at a time, off each app in the list above
- A small launch checklist per app: feature parity confirmed → app
  uninstalled → cost stops billing

**Exit:** All 8 listed apps uninstalled; monthly Shopify bill drops
by ~$60.

### Phase 6 — Bundle SKU logic

- Cin7 owns bundle definitions
- Our `products` table includes `bundle_components: [{sku, qty}]`
- Stock for a bundle is computed as `min(component_stock / qty)` so
  the homepage live-inventory widget never overpromises

**Exit:** A bundle with one out-of-stock component reports out-of-stock
on `/catalog`.

---

## 7. Verifier

`scripts/cin7_check.py` (nightly):

- For 30 random SKUs, assert `our_inventory.on_hand` == Cin7
  on-hand within 1 unit
- For 30 random recent orders, assert pick list quantity matches
  shipment quantity
- Alert on drift > 1%

---

## 8. Open questions

1. **Shopify role going forward**: headless commerce engine OR fully
   replaced? Recommend **headless for v1** — Cin7 + portal handle ops,
   Shopify keeps SEO + the existing checkout. Re-evaluate after Phase 5.
2. **WMS staffing**: who owns the Cin7 admin day-to-day? Likely the
   Warehouse Lead. Document in `docs/runbooks/wms.md`.
3. **Mobile scanner choice**: Cin7 has its own mobile app; we may not
   need our own UI for receiving. If theirs is good, Phase 4 simplifies
   to "configure their app" — confirm during Phase 1.
4. **Multi-warehouse stock allocation**: greedy nearest-with-stock vs.
   inventory-balance optimization? Default to greedy nearest; revisit
   when NV warehouse stocks meaningfully.

---

## 9. Out-of-band

- Cin7 Core subscription
- One-time data migration (Cin7 onboarding team helps)
- Physical scanner hardware if not using Cin7's mobile app (Zebra TC22
  or similar, ~$700 each, one per warehouse to start)
- New env vars: `CIN7_ACCOUNT_ID`, `CIN7_API_KEY`,
  `CIN7_WEBHOOK_SECRET` (if applicable)

---

## 10. Definition of done

- All 87+ SKUs live in Cin7, accurate to the unit
- ShipStation runs direct (no Shopify)
- All 8 listed Shopify apps uninstalled, ~$700/yr eliminated
- Lot tracking returns customer lists in <1s on a real lot
- Warehouse Lead has a written runbook
- Forecasting model (PRD-12) reads from Cin7-driven `inventory` table
