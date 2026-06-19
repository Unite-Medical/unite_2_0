/**
 * UniteWMS — pick lists (PRD-25 Phase 3, §7 outbound).
 *
 * Builds a FEFO (first-expire-first-out) pick plan for an order: which lot, in
 * which bin, in which warehouse, and how many units. This is a NON-MUTATING
 * preview — qty_remaining is only decremented at ship (wms/shipping.js). Used
 * by the fulfillment + lots admin screens and the operator pick workflow.
 */

import { db } from '../db.js';
import { availability } from './availability.js';

function num(v) { return Number(v) || 0; }

/** FEFO-ordered lots for a sku in a warehouse with stock remaining. */
function fefoLots(sku, warehouse_id) {
  return db.list('lots', { where: { product_sku: sku, warehouse_id } })
    .filter((l) => num(l.qty_remaining) > 0)
    .sort((a, b) => {
      const ax = a.expiration_date || '9999-12-31';
      const bx = b.expiration_date || '9999-12-31';
      if (ax !== bx) return ax < bx ? -1 : 1;
      return (a.received_at || '') < (b.received_at || '') ? -1 : 1;
    });
}

/**
 * Build a pick list for an order. For each line, allocate FEFO across the
 * warehouse(s) holding the sku. Lines with lots produce lot-specific picks;
 * lines without lot-tracked stock fall back to a warehouse-level pick.
 *
 * @returns {{order_id:string, lines:Array, short:Array, fully_pickable:boolean}}
 */
export function buildPickList(orderId, { warehousePriority = ['wh_atl', 'wh_reno'] } = {}) {
  const items = db.list('order_items', { where: { order_id: orderId } });
  const lines = [];
  const short = [];

  for (const it of items) {
    let need = num(it.qty);
    const picks = [];
    const whs = [...new Set(db.list('inventory', { where: { sku: it.sku } }).map((r) => r.warehouse_id))]
      .sort((a, b) => warehousePriority.indexOf(a) - warehousePriority.indexOf(b));

    for (const wh of whs) {
      if (need <= 0) break;
      // Prefer lot-tracked picks (FEFO); fall back to bulk on_hand.
      for (const lot of fefoLots(it.sku, wh)) {
        if (need <= 0) break;
        const take = Math.min(num(lot.qty_remaining), need);
        if (take <= 0) continue;
        picks.push({ warehouse_id: wh, lot_id: lot.id, lot_number: lot.lot_number, bin_id: lot.bin_id || null, expiration_date: lot.expiration_date, qty: take });
        need -= take;
      }
      if (need > 0) {
        const bulk = availability.availableToPromise(it.sku, wh) - picks.filter((p) => p.warehouse_id === wh).reduce((a, p) => a + p.qty, 0);
        const take = Math.min(Math.max(0, bulk), need);
        if (take > 0) { picks.push({ warehouse_id: wh, lot_id: null, lot_number: null, bin_id: null, expiration_date: null, qty: take }); need -= take; }
      }
    }

    const picked = picks.reduce((a, p) => a + p.qty, 0);
    lines.push({ sku: it.sku, name: it.name, requested: num(it.qty), picked, shortfall: Math.max(0, need), picks });
    if (need > 0) short.push({ sku: it.sku, shortfall: need });
  }

  return { order_id: orderId, lines, short, fully_pickable: short.length === 0 };
}

/** Lines that cannot be fully picked from available stock. */
export function shortPick(orderId) {
  return buildPickList(orderId).short;
}

export const picking = { buildPickList, shortPick };
