/**
 * UniteWMS — availability reads (PRD-25 §4.2).
 *
 * Read helpers off the `inventory` projection and the `lots`/`stock_movements`
 * ledger. These are the ONLY supported way the rest of the app should ask
 * "how much do we have?" — never sum `inventory.on_hand` ad hoc.
 *
 *   available = on_hand - reserved          (available-to-promise)
 *
 * Pure functions (no React) so they run in the browser, in Node verifiers,
 * and in serverless routes. Callers that need reactivity subscribe to the
 * `inventory` table (e.g. db.useTable('inventory')) and call these in a memo.
 */

import { db } from '../db.js';

function num(v) { return Number(v) || 0; }

/** All inventory rows for a sku, optionally narrowed to one warehouse. */
function rows(sku, warehouse_id) {
  const where = { sku };
  if (warehouse_id) where.warehouse_id = warehouse_id;
  return db.list('inventory', { where });
}

/** On-hand units for a sku (summed across warehouses unless one is given). */
export function onHand(sku, warehouse_id = null) {
  return rows(sku, warehouse_id).reduce((a, r) => a + num(r.on_hand), 0);
}

/** Reserved (allocated) units for a sku. */
export function reserved(sku, warehouse_id = null) {
  return rows(sku, warehouse_id).reduce((a, r) => a + num(r.reserved), 0);
}

/** Available-to-promise = on_hand − reserved. */
export function availableToPromise(sku, warehouse_id = null) {
  return onHand(sku, warehouse_id) - reserved(sku, warehouse_id);
}

/** Lots holding a sku (qty_remaining > 0), FEFO-ordered (earliest expiry first). */
export function byLot(sku, warehouse_id = null) {
  const where = { product_sku: sku };
  if (warehouse_id) where.warehouse_id = warehouse_id;
  return db.list('lots', { where })
    .filter((l) => num(l.qty_remaining) > 0)
    .sort((a, b) => {
      const ax = a.expiration_date || '9999-12-31';
      const bx = b.expiration_date || '9999-12-31';
      return ax < bx ? -1 : ax > bx ? 1 : 0;
    });
}

/** Raw movement history for a sku (most recent first), optionally per-warehouse. */
export function movements(sku, warehouse_id = null) {
  const all = db.list('stock_movements', { orderBy: 'occurred_at', dir: 'desc' });
  return all.filter((m) => (m.sku || m.product_sku) === sku && (!warehouse_id || m.warehouse_id === warehouse_id));
}

/** Sum of movement deltas for a sku — the ledger's own answer for on-hand. */
export function ledgerOnHand(sku, warehouse_id = null) {
  return movements(sku, warehouse_id).reduce((a, m) => a + num(m.qty_delta), 0);
}

/**
 * Map of sku -> { on_hand, reserved, available } summed across warehouses.
 * Used by the inventory dashboard so its totals come through this module.
 */
export function stockBySku() {
  const m = new Map();
  for (const r of db.list('inventory')) {
    const cur = m.get(r.sku) || { on_hand: 0, reserved: 0, available: 0 };
    cur.on_hand += num(r.on_hand);
    cur.reserved += num(r.reserved);
    cur.available = cur.on_hand - cur.reserved;
    m.set(r.sku, cur);
  }
  return m;
}

/** Portfolio-level rollup for the /admin/inventory header cards. */
export function summary() {
  const inv = db.list('inventory');
  const totalOnHand = inv.reduce((a, r) => a + num(r.on_hand), 0);
  const totalReserved = inv.reduce((a, r) => a + num(r.reserved), 0);
  const low = inv.filter((r) => num(r.on_hand) <= num(r.reorder_at)).length;
  const out = inv.filter((r) => num(r.on_hand) === 0).length;
  return {
    total_on_hand: totalOnHand,
    total_reserved: totalReserved,
    total_available: totalOnHand - totalReserved,
    low,
    out,
  };
}

export const availability = {
  onHand,
  reserved,
  availableToPromise,
  byLot,
  movements,
  ledgerOnHand,
  stockBySku,
  summary,
};
