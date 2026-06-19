# Cursor Handoff — Build UniteWMS (PRD-25)

**Goal:** Implement PRD-25 — a native, owned Inventory + Warehouse Management
System for Unite Medical — replacing the Cin7 Core rental. Read
`docs/prds/PRD-25-native-wms.md` in full before writing code. This doc is the
execution plan: build order, exact files, patterns to copy, and the acceptance
gate per phase.

---

## 0. Operating rules (read first)

1. **Match the existing codebase. Do not introduce new frameworks.** This is
   Vite + React 19 + React Router 7, plain ES modules, a client-side reactive DB
   (`src/lib/db.js`) that mirrors to Neon Postgres via `src/lib/remoteDb.js`, and
   Vercel serverless functions in `api/`. No TypeScript, no Redux, no ORM — match
   what's there.
2. **Copy the established integration pattern.** Every external client in
   `src/lib/external/*.js` uses the `realOrStub({ scope, predicate, real, stub })`
   helper from `src/lib/external/_http.js` and routes through
   `/api/proxy/<service>`. Study `src/lib/external/cin7.js` and
   `src/lib/receiving.js` before writing anything — your code must look like it.
3. **The ledger is sacred.** `stock_movements` is append-only. NOTHING outside
   `src/lib/wms/ledger.js` may write it, and `inventory.on_hand` is only ever
   updated by the ledger module inside the same transaction as the movement.
   No other file may mutate `on_hand` directly. Grep for existing direct writes
   (`receiving.js`, `fulfillment.js`) and route them through the ledger.
4. **Every mutation is audited.** Use the existing `audit_log` pattern
   (`db.insert('audit_log', { id: uid('aud'), kind, ref_id, payload })`).
5. **Idempotency.** Movement posts accept an `idempotency_key`; a repeated key is
   a no-op that returns the prior result. Webhooks (Flexport/ShipStation) retry —
   double-receiving is a data-corruption bug, not an edge case.
6. **Ship behind the verifier.** Create `scripts/wms_check.py` early and keep it
   green. Do not advance a phase until its exit criteria + the verifier pass.
7. **Work phase by phase. Open a PR per phase.** Do not build all 7 phases in one
   diff. Each phase must leave the app runnable (`npm run dev`), lint-clean
   (`npm run lint`), and build-clean (`npm run build`).

---

## 1. Repo orientation (where things live)

| You need | It's at |
|---|---|
| Client DB API (`db.insert/list/update/get/upsert`) | `src/lib/db.js` |
| Neon write-through mirror | `src/lib/remoteDb.js`, `api/db/sync.js` |
| Integration helper (`realOrStub`, `env`, `API_BASE`, `fetchJson`) | `src/lib/external/_http.js` |
| Cin7 adapter to retire (pattern reference) | `src/lib/external/cin7.js` |
| Working receiving chain to evolve | `src/lib/receiving.js` |
| Working replenishment + PO drafting | `src/lib/replenishment.js` |
| Working zero-touch fulfillment | `src/lib/fulfillment.js` |
| Service re-exports (callers import from here) | `src/lib/services.js` |
| PDF engine (packing slips, PO PDFs) | `src/lib/pdf.js`, `src/lib/documents.js` |
| Existing schema migrations | `docs/schema/migrations/00xx_*.sql` |
| Inventory/lot tables today | `0003_inventory.sql`, `lot_tracking.sql` |
| Admin pages to evolve | `src/pages/admin/AdminInventory.jsx`, `AdminReplenishment.jsx`, `AdminFulfillment.jsx` |
| Routing | `src/App.jsx` (admin routes are `RequireAdmin`-wrapped) |
| Migration runner | `npm run db:migrate` (`scripts/migrate.mjs`) |
| Runtime verifier to extend | `scripts/verify_orchestration.mjs` |

---

## 2. New code you will create

```
docs/schema/migrations/0019_wms.sql      -- all new tables (see PRD §5)
src/lib/wms/
  ledger.js          -- post(movement) + projection update (ONLY writer)
  availability.js    -- onHand / reserved / availableToPromise / byLot
  reservations.js    -- reserve / release / commit
  lots.js            -- receiveLot / pickFEFO / genealogy / expiringSoon
  purchaseOrders.js  -- PO lifecycle: create→approve→send→receive→close
  picking.js         -- buildPickList(FEFO) / confirmPick / shortPick
  packing.js         -- packing slip via pdf.js / cartonize
  shipping.js        -- ShipStation label + lot commit on ship
  transfers.js       -- wh↔wh transfer (movement pair)
  counts.js          -- cycle count sessions + variance posting
  adjustments.js     -- reason-coded manual deltas
  bundles.js         -- kit explosion + min-component availability
api/wms/
  movement.js        -- POST: validate + ledger.post (server-authoritative)
  receive.js         -- POST: receive against a PO
  reserve.js         -- POST: reserve/commit/release
  ship.js            -- POST: confirm ship → FEFO + label
src/pages/admin/
  AdminReceiving.jsx        -- /admin/inventory/receive  (mobile/barcode)
  AdminCount.jsx            -- /admin/inventory/count
  AdminTransfers.jsx        -- /admin/inventory/transfers
  AdminLots.jsx             -- /admin/inventory/lots (+ recall lookup)
  AdminPurchaseOrders.jsx   -- /admin/purchase-orders
scripts/wms_check.py        -- the verifier (PRD §10)
docs/runbooks/wms.md         -- warehouse operator runbook (Phase 6)
```

Update `src/lib/services.js` to re-export the `wms/*` modules and **remove the
`cin7` re-export** (retire `external/cin7.js`; leave the file for PRD-04 fallback
but stop importing it).

---

## 3. Build order (one PR per phase)

### PR 1 — Phase 0: Ledger foundation
- Write `0019_wms.sql` (PRD §5): `stock_movements`, `bins`, `lots`,
  `reservations`, `count_*`, `transfers*`, PO column adds, `v_availability` view.
- `wms/ledger.js`: `post({ sku, warehouse_id, qty_delta, reason, ref_type,
  ref_id, lot_id, unit_cost, actor_id, idempotency_key })` — inserts the movement
  AND updates the `inventory` projection in one transaction; writes `audit_log`.
- `wms/availability.js`: read helpers off the projection/view.
- **Backfill:** a one-shot (`scripts/wms_seed_movements.mjs`) that posts a
  `receipt` movement equal to each current `inventory.on_hand` so the ledger
  reconciles to today's numbers.
- `scripts/wms_check.py` v1: assert `on_hand == SUM(qty_delta)` per (sku, wh).
- **Gate:** verifier green; `/admin/inventory` reads through `availability.js`.

### PR 2 — Phase 1: Reservations / ATP
- `wms/reservations.js`: `reserve(order)`, `commit(order)`, `release(order)`.
  `available = on_hand - reserved`; refuse to reserve beyond available.
- Wire checkout (`src/pages/Checkout.jsx`) + `fulfillment.js` reserve step to it.
- Storefront/catalog gate on `available` not `on_hand`.
- Verifier: no `available < 0`; `SUM(reservations.held) == inventory.reserved`.
- **Gate:** concurrency test — two orders for the last unit, exactly one wins.

### PR 3 — Phase 2: Purchase orders + receiving + lots
- `wms/purchaseOrders.js`: lifecycle on the existing `purchase_orders` table
  (replenishment.js already drafts them — extend, don't duplicate). Statuses:
  draft→approved→sent→partial→received→closed.
- `wms/lots.js` `receiveLot()`; `AdminReceiving.jsx` workstation (mobile,
  barcode-first; scan SKU+lot+expiry+qty against open PO line; blind +
  discrepancy flows).
- **Evolve `receiving.js`**: its Flexport `cleared` chain must now create `lots`
  rows + post ledger `receipt` movements (it currently writes `on_hand`
  directly — route that through `ledger.post`). Keep the QBO bill + reorder
  recalc it already does.
- `api/wms/receive.js` server route.
- Verifier: PO received_qty == receipt movements; lot conservation.
- **Gate:** receive a PO with lot+expiry → on-hand + QBO bill both reflect it;
  partial receipt leaves PO `partial`.

### PR 4 — Phase 3: Pick / pack / ship + FEFO + recall
- `wms/picking.js` FEFO pick lists; `wms/packing.js` packing slip via `pdf.js`;
  `wms/shipping.js` ShipStation label + on-ship lot decrement.
- On `shipped`: `lots.pickFEFO` decrements `qty_remaining`; post `ship` movement;
  write `lot_tracking` genealogy (lot → order_id + customer_id).
- `AdminLots.jsx` with a recall lookup box running the §7 recall query.
- Verifier: recall query < 1s; FEFO correctness.
- **Gate:** ship an order → correct (earliest-expiry) lot decremented; recall on
  that lot returns the customer in < 1s.

### PR 5 — Phase 4: Counts, transfers, adjustments, bins
- `wms/counts.js`, `wms/transfers.js`, `wms/adjustments.js`; bin granularity on
  movements/inventory. `AdminCount.jsx`, `AdminTransfers.jsx`.
- Variance/adjustment/transfer all post reason-coded movements.
- **Gate:** a count variance corrects on-hand via a `count_variance` movement; a
  transfer moves stock with an in-transit window.

### PR 6 — Phase 5: Bundles + storefront truth + forecast loop
- `wms/bundles.js`: kit explosion; availability = `min(component_on_hand / qty)`.
- Homepage live-inventory widget + `/catalog` read real `available`.
- Close the Prophet reorder loop (`replenishment.js` already supports it).
- **Gate:** bundle with one OOS component shows OOS on `/catalog`.

### PR 7 — Phase 6: Hardening
- Idempotency keys enforced on every movement post; movement reversal/undo;
  nightly reconciliation job; role-based access (operator/manager/admin);
  `docs/runbooks/wms.md`.
- **Gate:** verifier green; a week of reconciliation finds zero drift.

---

## 4. Patterns to copy verbatim

**Integration client skeleton** (for `wms/shipping.js` ShipStation calls,
GTIN/GS1 at receive) — mirror `external/cin7.js`:
```js
import { API_BASE, env, fetchJson, realOrStub } from '../external/_http.js';
// realOrStub({ scope, label, predicate: () => isConfigured() || viaBackendProxy(),
//              real: async () => {...}, stub: async () => {...} })
```

**Ledger post (the heart — server-authoritative):**
```js
// src/lib/wms/ledger.js
export async function post(m) {
  // 1. if m.idempotency_key already in stock_movements → return prior result
  // 2. db.insert('stock_movements', { id, ...m, occurred_at })
  // 3. update inventory projection: on_hand += m.qty_delta (upsert row)
  // 4. db.insert('audit_log', { kind: `wms.${m.reason}`, ref_id: m.ref_id, payload: m })
  // steps 2-3 in ONE transaction
}
```

**Audit + uid:** `import { uid } from '../format.js'` then
`db.insert('audit_log', { id: uid('aud'), kind, ref_id, payload })`.

---

## 5. Acceptance — the whole thing is done when

- `npm run lint` and `npm run build` are clean.
- `python3 scripts/wms_check.py` passes all checks (ledger invariant, no
  oversell, lot conservation, recall < 1s, PO math, reservation math).
- `node scripts/verify_orchestration.mjs` passes (extend it with WMS checks).
- No file other than `wms/ledger.js` writes `stock_movements` or mutates
  `inventory.on_hand` (grep to prove it).
- `external/cin7.js` is no longer imported by `services.js`.
- Each phase's gate (above) demonstrably passes.

---

## 6. Guardrails / do-not

- ❌ Do not edit `inventory.on_hand` anywhere except `ledger.js`.
- ❌ Do not let the browser write stock directly in production — go through
  `api/wms/*`.
- ❌ Do not duplicate the `purchase_orders` table — extend the existing one.
- ❌ Do not add a new state-management lib, ORM, or TypeScript.
- ❌ Do not break the existing `receiving.js` / `fulfillment.js` / `replenishment.js`
  call sites — evolve them through the ledger, keep their public functions.
- ✅ Do keep the `realOrStub` stub paths working so the app still runs with no
  keys (demo mode must never break).
- ✅ Do ask (in the PR description) if a business rule is ambiguous — e.g.
  allocation strategy (greedy nearest-warehouse is the PRD default), backorder
  behavior, negative-stock policy (forbidden by default).

---

## 7. First commit

Start with **PR 1 / Phase 0** only: `0019_wms.sql` + `wms/ledger.js` +
`wms/availability.js` + the backfill seed + `wms_check.py` v1, with
`/admin/inventory` reading through `availability.js`. Get the ledger invariant
green before touching anything else. Everything in UniteWMS stands on that one
guarantee: **on_hand is always the sum of its movements.**
