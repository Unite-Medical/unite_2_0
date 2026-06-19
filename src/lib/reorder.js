/**
 * Reorder + saved order lists — PRD-26 §2/§4.
 *
 * One-click reorder from any past order or a named saved list, re-priced at
 * CURRENT contract terms (never the stale historical price). Lines whose price
 * changed since last time are flagged so the buyer can acknowledge.
 */

import { db } from './db.js';
import { uid } from './format.js';
import { resolveCustomerPrice } from './customerPricing.js';

function repriceLines(org, lines) {
  return lines.map((l) => {
    const base = db.get('products', l.sku)?.price ?? l.list_price ?? l.prior_unit_price ?? 0;
    const priced = resolveCustomerPrice({ org, sku: l.sku, qty: l.qty, basePrice: base });
    const prior = l.prior_unit_price ?? null;
    const changed = prior != null && Math.abs(prior - priced.unit_price) > 0.001;
    return {
      sku: l.sku,
      name: l.name || db.get('products', l.sku)?.name || l.sku,
      qty: l.qty,
      unit_price: priced.unit_price,
      list_price: priced.list_price,
      basis: priced.basis,
      prior_unit_price: prior,
      price_changed: changed,
      price_delta: prior != null ? +(priced.unit_price - prior).toFixed(2) : 0,
    };
  });
}

/** Re-priced cart cloned from a past order, at current contract terms. */
export function buildReorder(orderId, org) {
  const items = db.list('order_items', { where: { order_id: orderId } });
  return repriceLines(org, items.map((it) => ({ sku: it.sku, name: it.name, qty: it.qty, prior_unit_price: it.unit_price })));
}

/** Re-priced cart from a saved list. */
export function buildReorderFromList(listId, org) {
  const lines = db.list('reorder_list_items', { where: { list_id: listId } });
  return repriceLines(org, lines.map((l) => ({ sku: l.product_sku, qty: l.qty })));
}

export const reorderLists = {
  forOrg(orgId) {
    return db.list('reorder_lists', { where: { org_id: orgId } })
      .map((l) => ({ ...l, items: db.list('reorder_list_items', { where: { list_id: l.id } }) }));
  },
  saveList(org, name, lines, createdBy = null) {
    const list = db.insert('reorder_lists', { id: uid('rol'), org_id: org.id, name, created_by: createdBy, created_at: new Date().toISOString() });
    for (const l of lines) {
      if (!l.sku || !(l.qty > 0)) continue;
      db.insert('reorder_list_items', { id: uid('roli'), list_id: list.id, product_sku: l.sku, qty: l.qty });
    }
    return list;
  },
  removeList(id) {
    for (const it of db.list('reorder_list_items', { where: { list_id: id } })) db.remove('reorder_list_items', it.id);
    db.remove('reorder_lists', id);
  },
};
