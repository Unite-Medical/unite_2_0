/**
 * UniteWMS — reservations / available-to-promise (PRD-25 Phase 1, §3 outbound).
 *
 *   available = on_hand − reserved
 *
 * Reservations make oversell impossible: two orders can never hold the same
 * unit. A `held` reservation increments `inventory.reserved` (NOT on_hand — the
 * stock is still physically present until it ships). On ship the reservation is
 * `committed`: reserved is released AND the ledger posts a `ship` movement that
 * decrements on_hand. A cancelled order `release`s: reserved drops, nothing
 * shipped.
 *
 * Invariant the verifier enforces: SUM(reservations.held.qty) == inventory.reserved.
 *
 * `inventory.reserved` is a projection field (not on_hand), so this module is
 * allowed to write it; on_hand still moves ONLY through ledger.post().
 */

import { db } from '../db.js';
import { uid } from '../format.js';
import { availability } from './availability.js';
import { ledger } from './ledger.js';

// Greedy allocation order — nearest/primary warehouse first (PRD default).
const WAREHOUSE_PRIORITY = ['wh_atl', 'wh_reno'];

function num(v) { return Number(v) || 0; }

function audit(kind, ref_id, payload) {
  try { db.insert('audit_log', { id: uid('aud'), kind, ref_id, payload }); } catch { /* never break */ }
}

function inventoryRow(sku, warehouse_id) {
  return db.list('inventory', { where: { sku, warehouse_id } })[0] || null;
}

/** Warehouses that stock a sku, ordered by allocation priority then availability. */
function warehousesFor(sku) {
  const rows = db.list('inventory', { where: { sku } });
  return rows
    .map((r) => r.warehouse_id)
    .sort((a, b) => {
      const pa = WAREHOUSE_PRIORITY.indexOf(a);
      const pb = WAREHOUSE_PRIORITY.indexOf(b);
      const ra = pa === -1 ? 99 : pa;
      const rb = pb === -1 ? 99 : pb;
      if (ra !== rb) return ra - rb;
      return availability.availableToPromise(sku, b) - availability.availableToPromise(sku, a);
    });
}

function heldFor(orderId, sku = null) {
  const where = { order_id: orderId, status: 'held' };
  if (sku) where.product_sku = sku;
  return db.list('reservations', { where });
}

function bumpReserved(sku, warehouse_id, delta) {
  const row = inventoryRow(sku, warehouse_id);
  if (row) {
    db.update('inventory', row.id, { reserved: Math.max(0, num(row.reserved) + delta) });
  } else if (delta > 0) {
    db.insert('inventory', { id: `inv_${String(warehouse_id).replace(/^wh_/, '')}_${sku}`, sku, warehouse_id, on_hand: 0, reserved: delta, reorder_at: 0, reorder_qty: 0 });
  }
}

function lineItems(orderLike) {
  if (orderLike && Array.isArray(orderLike.items)) return orderLike.items;
  const orderId = typeof orderLike === 'string' ? orderLike : orderLike?.id;
  return db.list('order_items', { where: { order_id: orderId } }).map((li) => ({ sku: li.sku, qty: li.qty }));
}

function orderId(orderLike) {
  return typeof orderLike === 'string' ? orderLike : orderLike?.id;
}

/**
 * Reserve stock for an order. Allocates greedily across warehouses, never
 * beyond available-to-promise. Idempotent per (order, sku): a line already
 * held is not re-reserved. Returns per-line allocations + shortfall.
 *
 * @returns {{ok:boolean, order_id:string, lines:Array, shortfall:number}}
 */
export function reserve(orderLike) {
  const oid = orderId(orderLike);
  if (!oid) return { ok: false, reason: 'missing_order' };
  const items = lineItems(orderLike);
  const lines = [];
  let totalShortfall = 0;

  for (const it of items) {
    const sku = it.sku;
    let need = num(it.qty);
    if (!sku || need <= 0) continue;

    // Idempotency: if this order already holds this sku, treat as done.
    const already = heldFor(oid, sku).reduce((a, r) => a + num(r.qty), 0);
    if (already >= need) { lines.push({ sku, requested: need, reserved: already, shortfall: 0, allocations: [], idempotent: true }); continue; }
    need -= already;

    const allocations = [];
    for (const wh of warehousesFor(sku)) {
      if (need <= 0) break;
      const avail = availability.availableToPromise(sku, wh);
      const take = Math.min(avail, need);
      if (take <= 0) continue;
      const row = db.insert('reservations', {
        id: uid('resv'), order_id: oid, product_sku: sku, sku, warehouse_id: wh,
        qty: take, status: 'held', created_at: new Date().toISOString(),
      });
      bumpReserved(sku, wh, take);
      allocations.push({ warehouse_id: wh, qty: take, reservation_id: row.id });
      need -= take;
    }

    const reservedNow = allocations.reduce((a, x) => a + x.qty, 0);
    if (need > 0) totalShortfall += need;
    lines.push({ sku, requested: num(it.qty), reserved: already + reservedNow, shortfall: need, allocations });
  }

  audit('wms.reserve', oid, { lines: lines.length, shortfall: totalShortfall });
  return { ok: true, order_id: oid, lines, shortfall: totalShortfall };
}

/**
 * Commit an order's held reservations (it has shipped). Releases `reserved`
 * and posts a `ship` movement per allocation so on_hand drops through the
 * ledger. Optional `lotAllocations` (sku -> [{warehouse_id, qty, lot_id}])
 * lets Phase-3 shipping attach FEFO lot ids to the movements.
 *
 * @returns {{ok:boolean, committed:number, movements:Array}}
 */
export function commit(orderLike, { lotAllocations = null, actor_id = 'system' } = {}) {
  const oid = orderId(orderLike);
  if (!oid) return { ok: false, reason: 'missing_order' };
  const held = heldFor(oid);
  const movements = [];

  for (const r of held) {
    const lot = lotAllocations?.[r.sku]?.find((l) => l.warehouse_id === r.warehouse_id);
    const res = ledger.post({
      sku: r.sku,
      warehouse_id: r.warehouse_id,
      qty_delta: -num(r.qty),
      reason: ledger.REASONS.SHIP,
      ref_type: 'order',
      ref_id: oid,
      lot_id: lot?.lot_id || null,
      actor_id,
      idempotency_key: `ship:${oid}:${r.id}`,
      note: 'Reservation committed on ship',
    });
    if (res.ok && !res.duplicate) bumpReserved(r.sku, r.warehouse_id, -num(r.qty));
    db.update('reservations', r.id, { status: 'committed', committed_at: new Date().toISOString() });
    if (res.movement) movements.push(res.movement);
  }

  audit('wms.reservation_commit', oid, { committed: held.length });
  return { ok: true, committed: held.length, movements };
}

/**
 * Release an order's held reservations (cancelled / expired). Frees reserved;
 * nothing ships, on_hand untouched.
 */
export function release(orderLike) {
  const oid = orderId(orderLike);
  if (!oid) return { ok: false, reason: 'missing_order' };
  const held = heldFor(oid);
  for (const r of held) {
    bumpReserved(r.sku, r.warehouse_id, -num(r.qty));
    db.update('reservations', r.id, { status: 'released', released_at: new Date().toISOString() });
  }
  audit('wms.reservation_release', oid, { released: held.length });
  return { ok: true, released: held.length };
}

/** Total held units for an order (across skus/warehouses). */
export function heldQty(orderId_) {
  return heldFor(orderId_).reduce((a, r) => a + num(r.qty), 0);
}

export const reservations = { reserve, commit, release, heldQty };
