/**
 * UniteWMS — the stock-movement ledger (PRD-25 §4.1, the heart of the system).
 *
 *   on_hand(sku, warehouse)  ≝  SUM(stock_movements.qty_delta)
 *
 * `stock_movements` is APPEND-ONLY and THIS MODULE IS ITS ONLY WRITER. No
 * other file may insert a movement or mutate `inventory.on_hand` directly —
 * `inventory` is a materialized projection kept current by `post()` in the
 * same synchronous tick as the movement insert.
 *
 * Atomicity: the durable runtime is the synchronous in-memory store
 * (src/lib/db.js), mirrored to Postgres via remoteDb. Because `db.insert`
 * and `db.update` are synchronous and there is no `await` between the
 * movement insert and the projection update, the pair is effectively one
 * transaction at runtime; the relational tier (0019_wms.sql) wraps the same
 * two writes in a real DB transaction.
 *
 * Idempotency (PRD §11): a movement may carry an `idempotency_key`. Re-posting
 * the same key is a no-op that returns the prior movement — webhooks retry,
 * and double-receiving is a data-corruption bug, not an edge case.
 */

import { db } from '../db.js';
import { uid } from '../format.js';

/** Typed movement reasons (mirror of the 0019_wms.sql `reason` enum-ish set). */
export const REASONS = Object.freeze({
  RECEIPT: 'receipt',
  SHIP: 'ship',
  ADJUST_DAMAGE: 'adjust_damage',
  ADJUST_LOSS: 'adjust_loss',
  FOUND: 'found',
  TRANSFER_OUT: 'transfer_out',
  TRANSFER_IN: 'transfer_in',
  COUNT_VARIANCE: 'count_variance',
  RESERVATION_COMMIT: 'reservation_commit',
  RETURN_RESTOCK: 'return_restock',
  OPENING_COUNT: 'opening_count',
});

const VALID_REASONS = new Set(Object.values(REASONS));

function audit(kind, ref_id, payload) {
  try {
    db.insert('audit_log', { id: uid('aud'), kind, ref_id, payload });
  } catch {
    // audit must never break the ledger write
  }
}

function inventoryRow(sku, warehouse_id) {
  return db.list('inventory', { where: { sku, warehouse_id } })[0] || null;
}

function inventoryId(sku, warehouse_id) {
  const short = String(warehouse_id).replace(/^wh_/, '');
  return `inv_${short}_${sku}`;
}

/**
 * Find a prior movement with this idempotency key (a repeated key is a no-op).
 */
function findByIdempotencyKey(key) {
  if (!key) return null;
  return db.list('stock_movements', { where: { idempotency_key: key } })[0] || null;
}

/**
 * Post a stock movement — the ONLY supported way to change stock.
 *
 * @param {object} m
 * @param {string} m.sku           product sku (required)
 * @param {string} m.warehouse_id  e.g. 'wh_atl' (required)
 * @param {number} m.qty_delta     signed integer, non-zero (required)
 * @param {string} m.reason        one of REASONS (required)
 * @param {string} [m.ref_type]    purchase_order|order|transfer|count|manual
 * @param {string} [m.ref_id]
 * @param {string} [m.bin_id]
 * @param {(string|number)} [m.lot_id]
 * @param {number} [m.unit_cost]
 * @param {string} [m.actor_id]
 * @param {string} [m.note]
 * @param {string} [m.idempotency_key]
 * @returns {{ok:boolean, duplicate?:boolean, reason?:string, movement?:object, on_hand?:number}}
 */
export function post(m = {}) {
  const {
    sku,
    warehouse_id,
    reason,
    ref_type = null,
    ref_id = null,
    bin_id = null,
    lot_id = null,
    unit_cost = null,
    actor_id = null,
    note = null,
    idempotency_key = null,
  } = m;

  const qty_delta = Number(m.qty_delta);

  if (!sku) return { ok: false, reason: 'missing_sku' };
  if (!warehouse_id) return { ok: false, reason: 'missing_warehouse_id' };
  if (!Number.isInteger(qty_delta) || qty_delta === 0) return { ok: false, reason: 'invalid_qty_delta' };
  if (!reason || !VALID_REASONS.has(reason)) return { ok: false, reason: 'invalid_reason' };

  // 1) Idempotency — a repeated key returns the prior result, no second write.
  if (idempotency_key) {
    const prior = findByIdempotencyKey(idempotency_key);
    if (prior) {
      return { ok: true, duplicate: true, movement: prior, on_hand: inventoryRow(sku, warehouse_id)?.on_hand ?? 0 };
    }
  }

  // 2) Append the movement (append-only ledger entry) ...
  const movement = db.insert('stock_movements', {
    id: uid('mov'),
    occurred_at: new Date().toISOString(),
    product_sku: sku,
    sku, // runtime join key (mirrors product_sku for the relational tier)
    warehouse_id,
    bin_id,
    lot_id,
    qty_delta,
    reason,
    ref_type,
    ref_id,
    unit_cost,
    actor_id,
    idempotency_key,
    note,
  });

  // 3) ... and update the inventory projection in the same synchronous tick.
  const existing = inventoryRow(sku, warehouse_id);
  let on_hand;
  if (existing) {
    on_hand = (Number(existing.on_hand) || 0) + qty_delta;
    db.update('inventory', existing.id, { on_hand });
  } else {
    on_hand = qty_delta;
    db.insert('inventory', {
      id: inventoryId(sku, warehouse_id),
      sku,
      warehouse_id,
      on_hand,
      reserved: 0,
      reorder_at: 0,
      reorder_qty: 0,
    });
  }

  // 4) Audit trail (the movement itself is the primary audit record).
  audit(`wms.${reason}`, ref_id || movement.id, {
    movement_id: movement.id,
    sku,
    warehouse_id,
    qty_delta,
    on_hand,
    ref_type,
    actor_id,
  });

  return { ok: true, movement, on_hand };
}

/**
 * Rebuild the inventory projection from the ledger — the ledger owns the
 * projection, so reconciliation/backfill go through here (never a raw write).
 * If a (sku, warehouse_id) filter is given, only those rows are rebuilt.
 *
 * @returns {number} number of inventory rows written
 */
export function rebuildProjection({ sku = null, warehouse_id = null } = {}) {
  const movements = db.list('stock_movements');
  const sums = new Map(); // `${sku}|${wh}` -> sum
  for (const mv of movements) {
    const s = mv.sku || mv.product_sku;
    const wh = mv.warehouse_id;
    if (!s || !wh) continue;
    if (sku && s !== sku) continue;
    if (warehouse_id && wh !== warehouse_id) continue;
    const key = `${s}|${wh}`;
    sums.set(key, (sums.get(key) || 0) + Number(mv.qty_delta || 0));
  }

  let written = 0;
  for (const [key, sum] of sums) {
    const [s, wh] = key.split('|');
    const row = inventoryRow(s, wh);
    if (row) {
      if ((Number(row.on_hand) || 0) !== sum) { db.update('inventory', row.id, { on_hand: sum }); written += 1; }
    } else {
      db.insert('inventory', { id: inventoryId(s, wh), sku: s, warehouse_id: wh, on_hand: sum, reserved: 0, reorder_at: 0, reorder_qty: 0 });
      written += 1;
    }
  }
  return written;
}

/**
 * Phase-0 backfill: seed one `opening_count` movement per current
 * inventory.on_hand so the ledger reconciles to today's numbers, then rebuild
 * the projection from movements. Idempotent (keyed `open:<sku>:<wh>`), so it is
 * safe to re-run. This is the migration off directly-edited on_hand.
 *
 * @returns {{seeded:number, skipped:number, rebuilt:number}}
 */
export function seedOpeningBalances({ actor_id = 'phase0_backfill' } = {}) {
  const rows = db.list('inventory');
  let seeded = 0;
  let skipped = 0;
  for (const inv of rows) {
    const sku = inv.sku;
    const wh = inv.warehouse_id;
    if (!sku || !wh) { skipped += 1; continue; }
    const key = `open:${sku}:${wh}`;
    if (findByIdempotencyKey(key)) { skipped += 1; continue; }
    const opening = Number(inv.on_hand) || 0;
    // Append the opening movement directly; rebuildProjection() below sets the
    // projection from SUM(movements), so we don't double-count the existing
    // on_hand that this movement represents.
    db.insert('stock_movements', {
      id: uid('mov'),
      occurred_at: new Date().toISOString(),
      product_sku: sku,
      sku,
      warehouse_id: wh,
      bin_id: null,
      lot_id: null,
      qty_delta: opening,
      reason: REASONS.OPENING_COUNT,
      ref_type: 'manual',
      ref_id: 'phase0_opening',
      unit_cost: null,
      actor_id,
      idempotency_key: key,
      note: 'Phase-0 opening balance (seeded from inventory.on_hand)',
    });
    seeded += 1;
  }
  const rebuilt = rebuildProjection();
  audit('wms.opening_backfill', 'phase0_opening', { seeded, skipped, rebuilt });
  return { seeded, skipped, rebuilt };
}

/**
 * Reverse a movement (undo) — PRD §11. The ledger is append-only, so an undo
 * is a NEW compensating movement (qty_delta negated) that references the
 * original, never a delete. Idempotent: `reverse:<movement_id>` guarantees a
 * given movement is reversed at most once.
 *
 * @returns {{ok:boolean, reason?:string, duplicate?:boolean, movement?:object}}
 */
export function reverse(movementId, { actor_id = 'ops', note = null } = {}) {
  const orig = db.get('stock_movements', movementId)
    || db.list('stock_movements', { where: { id: movementId } })[0];
  if (!orig) return { ok: false, reason: 'movement_not_found' };
  if (orig.reverses_movement_id) return { ok: false, reason: 'cannot_reverse_a_reversal' };

  const key = `reverse:${movementId}`;
  const prior = findByIdempotencyKey(key);
  if (prior) return { ok: true, duplicate: true, movement: prior };

  const res = post({
    sku: orig.sku || orig.product_sku,
    warehouse_id: orig.warehouse_id,
    qty_delta: -Number(orig.qty_delta),
    reason: orig.reason,
    ref_type: orig.ref_type,
    ref_id: orig.ref_id,
    bin_id: orig.bin_id || null,
    lot_id: orig.lot_id || null,
    unit_cost: orig.unit_cost ?? null,
    actor_id,
    idempotency_key: key,
    note: note || `Reversal of ${movementId}`,
  });
  if (res.movement) db.update('stock_movements', res.movement.id, { reverses_movement_id: movementId });
  audit('wms.reverse', movementId, { reversal_id: res.movement?.id, qty_delta: -Number(orig.qty_delta) });
  return res;
}

/**
 * Nightly reconciliation (PRD §11): assert on_hand == SUM(movements) for every
 * (sku, warehouse) and repair any drift by rebuilding from the ledger (the
 * source of truth). Returns a report; a healthy system reports drift: 0.
 *
 * @returns {{checked:number, drift:number, repaired:number, details:Array}}
 */
export function reconcile() {
  const sums = new Map();
  for (const mv of db.list('stock_movements')) {
    const s = mv.sku || mv.product_sku; const wh = mv.warehouse_id;
    if (!s || !wh) continue;
    sums.set(`${s}|${wh}`, (sums.get(`${s}|${wh}`) || 0) + Number(mv.qty_delta || 0));
  }
  const details = [];
  let checked = 0;
  let drift = 0;
  // Union of projection rows and ledger keys.
  const keys = new Set(sums.keys());
  for (const r of db.list('inventory')) keys.add(`${r.sku}|${r.warehouse_id}`);
  for (const key of keys) {
    const [s, wh] = key.split('|');
    const ledgerSum = sums.get(key) || 0;
    const row = inventoryRow(s, wh);
    const projected = row ? (Number(row.on_hand) || 0) : 0;
    checked += 1;
    if (projected !== ledgerSum) {
      drift += 1;
      details.push({ sku: s, warehouse_id: wh, projected, ledger: ledgerSum, delta: ledgerSum - projected });
    }
  }
  const repaired = drift > 0 ? rebuildProjection() : 0;
  audit('wms.reconcile', 'nightly', { checked, drift, repaired });
  return { checked, drift, repaired, details };
}

export const ledger = { post, reverse, reconcile, rebuildProjection, seedOpeningBalances, REASONS };
