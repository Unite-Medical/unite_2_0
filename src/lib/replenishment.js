/**
 * Run-rate replenishment engine — PRD-12 (client-side model).
 *
 * The CTO brief's success criterion #2 ends with "...run rate model
 * re-calculates the reorder point." This module IS that model, in its
 * pre-Prophet form: a trailing-window run rate per SKU computed from
 * actual order history, converted into a reorder point with lead-time
 * + safety-stock cover.
 *
 *   run_rate    = units sold in trailing window / window days
 *   reorder_pt  = run_rate × (vendor lead time + safety days)
 *   days_cover  = on_hand_total / run_rate
 *
 * The Python sidecar (forecasting/) replaces the run-rate math with
 * Prophet seasonal forecasts once deployed; the interface here
 * (computeReplenishment → rows with status/days_cover/suggested_qty)
 * stays identical so the UI doesn't change.
 */

import { db } from './db.js';
import { uid } from './format.js';
import { cin7 } from './services.js';

export const DEFAULTS = {
  window_days: 90,      // trailing demand window
  lead_time_days: 35,   // ocean freight CN → GA, door-to-door
  safety_days: 14,      // buffer for customs / vendor slip
};

/** Units sold per SKU over the trailing window, from real order lines. */
export function computeRunRates({ window_days = DEFAULTS.window_days } = {}) {
  const cutoff = Date.now() - window_days * 86400000;
  const orders = db.list('orders').filter((o) => {
    const t = new Date(o.placed_at || o.created_at || 0).getTime();
    return t >= cutoff && o.status !== 'cancelled';
  });
  const orderIds = new Set(orders.map((o) => o.id));

  const unitsBySku = {};
  for (const li of db.list('order_items')) {
    if (!orderIds.has(li.order_id)) continue;
    unitsBySku[li.sku] = (unitsBySku[li.sku] || 0) + (Number(li.qty) || 0);
  }

  const out = {};
  for (const [sku, units] of Object.entries(unitsBySku)) {
    out[sku] = { units_sold: units, run_rate: units / window_days };
  }
  return out;
}

/**
 * Full replenishment table: one row per SKU with demand, cover, and a
 * suggested order quantity. Sorted most-urgent first.
 */
export function computeReplenishment(opts = {}) {
  const { lead_time_days = DEFAULTS.lead_time_days, safety_days = DEFAULTS.safety_days } = opts;
  const rates = computeRunRates(opts);
  const products = db.list('products');
  const inventory = db.list('inventory');

  const onHandBySku = {};
  for (const inv of inventory) {
    onHandBySku[inv.sku] = (onHandBySku[inv.sku] || 0) + (Number(inv.on_hand) || 0);
  }

  const rows = products.map((p) => {
    const rate = rates[p.sku]?.run_rate || 0;
    const onHand = onHandBySku[p.sku] || 0;
    const reorderPoint = Math.ceil(rate * (lead_time_days + safety_days));
    const daysCover = rate > 0 ? onHand / rate : Infinity;

    let status = 'ok';
    if (onHand === 0 && rate > 0) status = 'stockout';
    else if (rate > 0 && onHand <= reorderPoint) status = 'reorder';
    else if (rate > 0 && daysCover < (lead_time_days + safety_days) * 1.5) status = 'watch';

    // Order up to: cover the next lead time + safety window twice over,
    // respecting vendor MOQ.
    const targetUnits = Math.ceil(rate * (lead_time_days + safety_days) * 2);
    const suggestedQty = status === 'reorder' || status === 'stockout'
      ? Math.max(p.moq || 1, targetUnits - onHand)
      : 0;

    return {
      sku: p.sku,
      name: p.name,
      vendor: p.vendor,
      cogs: p.cogs,
      moq: p.moq || 1,
      run_rate: +rate.toFixed(3),
      units_sold_window: rates[p.sku]?.units_sold || 0,
      on_hand: onHand,
      reorder_point: reorderPoint,
      days_cover: Number.isFinite(daysCover) ? Math.round(daysCover) : null,
      status,
      suggested_qty: suggestedQty,
    };
  });

  const rank = { stockout: 0, reorder: 1, watch: 2, ok: 3 };
  rows.sort((a, b) => (rank[a.status] - rank[b.status]) || ((a.days_cover ?? 1e9) - (b.days_cover ?? 1e9)));
  return rows;
}

/** Rows that need action today — used by the CEO digest + inventory alerts. */
export function lowStockAlerts(opts = {}) {
  return computeReplenishment(opts).filter((r) => r.status === 'stockout' || r.status === 'reorder');
}

/**
 * Draft purchase orders from the current replenishment table, grouped
 * by vendor. Writes `purchase_orders` rows (status: draft) and pushes
 * each to the WMS as an AUTHORISED PO (stubbed until credentials land).
 */
export async function draftPurchaseOrders({ rows = null, created_by = 'run-rate-model' } = {}) {
  const need = (rows || lowStockAlerts()).filter((r) => r.suggested_qty > 0);
  if (!need.length) return [];

  const byVendor = {};
  for (const r of need) (byVendor[r.vendor || 'Unassigned vendor'] ||= []).push(r);

  const created = [];
  for (const [vendor, lines] of Object.entries(byVendor)) {
    const id = uid('po');
    const total = +(lines.reduce((a, l) => a + l.suggested_qty * (l.cogs || 0), 0)).toFixed(2);
    const lineItems = lines.map((l) => ({ sku: l.sku, name: l.name, qty: l.suggested_qty, cost: l.cogs || 0 }));

    const wms = await cin7.createPO({
      vendor_name: vendor,
      line_items: lineItems,
      expected_delivery_date: new Date(Date.now() + DEFAULTS.lead_time_days * 86400000),
    });

    const row = db.insert('purchase_orders', {
      id,
      vendor_name: vendor,
      status: 'draft',
      created_by,
      line_items: lineItems,
      total_cost: total,
      wms_po_id: wms?.id || null,
      expected_delivery: new Date(Date.now() + DEFAULTS.lead_time_days * 86400000).toISOString(),
    });
    db.insert('audit_log', { id: uid('aud'), kind: 'replenish.po_drafted', ref_id: id, payload: { vendor, lines: lineItems.length, total } });
    created.push(row);
  }
  return created;
}

/**
 * Recalculate + persist reorder points onto inventory rows so the rest
 * of the app (inventory page, digest) reads fresh thresholds. Called
 * after receiving events and on demand from the admin UI.
 */
export function recalcReorderPoints(opts = {}) {
  const table = computeReplenishment(opts);
  let updated = 0;
  for (const row of table) {
    if (row.run_rate <= 0) continue;
    for (const inv of db.list('inventory', { where: { sku: row.sku } })) {
      // Split the SKU-level reorder point across warehouses by their share of stock.
      const share = row.on_hand > 0 ? (inv.on_hand / row.on_hand) : 0.5;
      db.update('inventory', inv.id, { reorder_at: Math.max(1, Math.ceil(row.reorder_point * share)) });
      updated += 1;
    }
  }
  db.insert('audit_log', { id: uid('aud'), kind: 'replenish.reorder_points_recalced', ref_id: null, payload: { rows: updated } });
  return updated;
}
