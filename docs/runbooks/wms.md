# UniteWMS — Operations Runbook (PRD-25)

UniteWMS is the native warehouse management system. It replaces the external
Cin7 dependency as the **system of record for stock**.

## The one rule

> `on_hand(sku, warehouse) == SUM(stock_movements.qty_delta)`

`stock_movements` is **append-only** and `src/lib/wms/ledger.js` is its **only
writer**. Nothing else may insert a movement or mutate `inventory.on_hand`.
`inventory` is a materialized projection kept current by `ledger.post()` in the
same synchronous tick as the movement insert.

```
available = on_hand − reserved        (available-to-promise; gates the storefront)
```

## Module map (`src/lib/wms/`)

| Module             | Owns                                                            |
|--------------------|----------------------------------------------------------------|
| `ledger.js`        | `post`, `reverse`, `reconcile`, `rebuildProjection`, `seedOpeningBalances` — **the only stock writer** |
| `availability.js`  | reads: `onHand`, `reserved`, `availableToPromise`, `stockBySku`, `summary` |
| `reservations.js`  | `reserve` / `commit` / `release` (held → reserved; ship → on_hand). Explodes bundles. |
| `lots.js`          | `receiveLot`, `pickFEFO`, recall `genealogy`, `expiringSoon`    |
| `purchaseOrders.js`| draft→approved→sent→partial→received→closed; `receive()` creates lots + posts receipts |
| `picking.js`       | FEFO pick-list preview (`buildPickList`, `shortPick`)          |
| `packing.js`       | `packSlip` (PDF) + `cartonize`                                  |
| `shipping.js`      | `confirmShip` — FEFO lot decrement + per-lot ship movements + genealogy; `recall` |
| `transfers.js`     | inter-warehouse `createTransfer`/`shipTransfer`/`receiveTransfer` (transfer_out → in_transit → transfer_in) |
| `counts.js`        | cycle counts: `openCount`/`recordCount`/`postCount` (variances → ledger) |
| `adjustments.js`   | reason-coded `damage`/`loss`/`found`                            |
| `bundles.js`       | kit availability = min(component_available/qty); explosion      |
| `access.js`        | role tiers: operator / manager / admin                         |

## Reason codes

`receipt`, `ship`, `adjust_damage`, `adjust_loss`, `found`, `transfer_out`,
`transfer_in`, `count_variance`, `reservation_commit`, `return_restock`,
`opening_count`.

## Idempotency

Every movement may carry an `idempotency_key`. Re-posting the same key is a
no-op that returns the prior movement. Keys in use:

- receipts: `recv:<ref>:<sku>:<lot>:<wh>` / `po_recv:<po>:<sku>:<lot>:<qty>` / `flx:<shipment>:<sku>`
- ship: `ship:<order>:<reservation>:<lot|nolot>`
- transfers: `xfer_out:<id>:<line>` / `xfer_in:<id>:<line>`
- counts: `count:<session>:<line>`
- reversal: `reverse:<movement_id>`
- opening: `open:<sku>:<wh>`

Webhooks retry; double-processing is a corruption bug, not an edge case.

## Roles (`access.js`)

- **operator** — receive, pick, pack, ship, count
- **manager** — operator + adjust, transfer, PO approve/send
- **admin** — manager + reverse movements, reconcile, override

App `admin` maps to the WMS `admin` tier. Pin a narrower tier with
`session.wms_role`. All WMS screens sit behind `RequireAdmin` as well.

## Admin screens

- `/admin/inventory` — dashboard (reads via `availability`)
- `/admin/inventory/receive` — receiving workstation (PO + blind receipts)
- `/admin/inventory/lots` — lots, expiring-soon, **recall lookup (<1s SLA)**
- `/admin/inventory/count` — cycle count + quick adjustments
- `/admin/inventory/transfers` — inter-warehouse transfers
- `/admin/purchase-orders` — PO board
- `/admin/replenishment` — forecast + **Close reorder loop (forecast → POs)**

## Server-authoritative writes

`api/wms/{movement,receive,ship,reserve,reconcile}.js` write the durable
`um_rows` store directly (guarded by `DB_SYNC_TOKEN`; `503` when unconfigured).
The SPA mirrors `um_rows` via `/api/db/sync`, so server-posted movements
propagate to every client on the next pull.

## Procedures

### Recall
1. `/admin/inventory/lots` → Recall lookup → enter the lot number.
2. The genealogy query returns every affected order + customer in < 1s.

### Receiving against a PO
1. `/admin/purchase-orders` → Approve → Send.
2. `/admin/inventory/receive` → pick the open PO → scan SKU + lot + expiry + qty
   → Post. Receipts create lots, post `receipt` movements, advance
   `received_qty`, post the QBO bill on full receipt, and recalc reorder points.

### Cycle count
1. `/admin/inventory/count` → Open new count → enter counted quantities.
2. Post → non-zero variances post `count_variance` movements; on_hand reconciles.

### Nightly reconciliation
- `POST /api/wms/reconcile` (cron / Trigger.dev). Recomputes on_hand from the
  ledger and repairs drift. Healthy = `drift: 0`.
- In-process equivalent: `ledger.reconcile()`.

### Undo a movement
- `ledger.reverse(movementId)` posts a compensating movement (append-only —
  never a delete). Idempotent per movement (`reverse:<id>`).

## Verification

- `npm run wms:seed` → backfill opening balances + write `tmp/wms_snapshot.json`.
- `npm run wms:check` (or `python3 scripts/wms_check.py`) → asserts the ledger
  invariant, no negative on_hand, no oversell, reservation math, PO math, lot
  conservation.
- `node scripts/verify_orchestration.mjs` → end-to-end WMS scenarios (reserve
  concurrency, FEFO ship + recall, transfers, counts, adjustments, bundles,
  reversal, reconcile).
