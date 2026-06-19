/**
 * Inbound receiving pipeline — CTO brief success criterion #2:
 *
 *   "A Flexport shipment clears customs → inventory updates
 *    automatically, landed cost posts to QuickBooks, and the run rate
 *    model re-calculates the reorder point."
 *
 * receiveClearedShipment() is the single entry point. It is invoked:
 *   - by flexport.handleWebhookEvent on `shipment.cleared` (server),
 *   - or manually from /admin/orders → inbound panel (today's demo).
 *
 * Chain (all-or-log, never throws to the caller):
 *   1. increment inventory at the destination warehouse per line item
 *   2. post the landed-cost Bill to QBO (freight + duties → COGS)
 *   3. recalc reorder points via the run-rate model
 *   4. write audit entries for each hop
 */

import { db } from './db.js';
import { uid } from './format.js';
import { qbo } from './services.js';
import { lowStockAlerts, recalcReorderPoints } from './replenishment.js';
import { lots } from './wms/lots.js';
import { ledger } from './wms/ledger.js';

const PORT_TO_WAREHOUSE = {
  USATL: 'wh_atl',
  USSAV: 'wh_atl',  // Savannah drays to Atlanta
  USOAK: 'wh_reno',
  USLAX: 'wh_reno',
};

function log(kind, ref_id, payload) {
  db.insert('audit_log', { id: uid('aud'), kind, ref_id, payload });
}

/**
 * @param {object} shipment  A `flexport_shipments` row (mirror). Line
 *   items may live on the row (`line_items: [{sku, qty, unit_cost}]`)
 *   or be passed explicitly.
 */
export async function receiveClearedShipment(shipment, { line_items = null } = {}) {
  if (!shipment) return { ok: false, reason: 'no_shipment' };
  const lines = line_items || shipment.line_items || [];
  const warehouseId = PORT_TO_WAREHOUSE[shipment.destination_port] || 'wh_atl';
  const result = { ok: true, shipment_id: shipment.id, received: 0, bill: null, reorder_rows: 0 };

  // 1) Inventory receive — through the WMS ledger (PRD-25). Lines that carry
  //    lot/expiry land as lots (lot-tracked); the rest post a plain `receipt`
  //    movement. on_hand only ever moves via ledger.post.
  result.lots = [];
  for (const li of lines) {
    if (!li.sku || !li.qty) continue;
    const qty = Number(li.qty);
    if (li.lot_number || li.expiration_date) {
      const r = lots.receiveLot({
        sku: li.sku, lot_number: li.lot_number, expiration_date: li.expiration_date || null,
        warehouse_id: warehouseId, qty, unit_cost: li.unit_cost ?? null,
        received_from_shipment: shipment.id, received_by: 'flexport',
        ref_type: 'flexport_shipment', ref_id: shipment.id,
      });
      if (r.lot) result.lots.push(r.lot.id);
    } else {
      ledger.post({
        sku: li.sku, warehouse_id: warehouseId, qty_delta: qty, reason: ledger.REASONS.RECEIPT,
        ref_type: 'flexport_shipment', ref_id: shipment.id, unit_cost: li.unit_cost ?? null,
        actor_id: 'flexport', idempotency_key: `flx:${shipment.id}:${li.sku}`,
        note: 'Flexport clearance receipt',
      });
    }
    result.received += qty;
  }
  log('receiving.inventory_received', shipment.id, { warehouse: warehouseId, units: result.received, lines: lines.length, lots: result.lots.length });

  // 2) Landed-cost bill → QBO ----------------------------------------------
  try {
    const freight = Number(shipment.freight_total_usd) || 0;
    const customs = Number(shipment.customs_total_usd) || 0;
    if (freight + customs > 0) {
      const bill = await qbo.createBillFromFlexport({ shipment, vendor_qbo_id: shipment.vendor_qbo_id });
      result.bill = bill;
      log('receiving.qbo_bill_posted', shipment.id, { bill_id: bill?.id, amount: freight + customs });
    } else {
      log('receiving.qbo_bill_skipped', shipment.id, { reason: 'no_landed_cost_on_shipment' });
    }
  } catch (err) {
    result.bill_error = err.message;
    log('receiving.qbo_bill_failed', shipment.id, { error: err.message });
  }

  // 3) Run-rate model recalc -----------------------------------------------
  try {
    result.reorder_rows = recalcReorderPoints();
  } catch (err) {
    log('receiving.reorder_recalc_failed', shipment.id, { error: err.message });
  }

  // 4) Close out the mirror row ---------------------------------------------
  db.update('flexport_shipments', shipment.id, {
    status: 'received',
    received_at: new Date().toISOString(),
    received_warehouse: warehouseId,
  });
  log('receiving.complete', shipment.id, result);

  return result;
}

/**
 * Demo/test helper: fabricate an inbound shipment carrying restock
 * quantities for the N lowest-cover SKUs, then run it through the full
 * receive chain. Lets ops exercise criterion #2 end-to-end today.
 */
export async function simulateInboundShipment({ sku_count = 3 } = {}) {
  const need = lowStockAlerts().slice(0, sku_count);
  const products = db.list('products');
  const lines = (need.length ? need : products.slice(0, sku_count).map((p) => ({ sku: p.sku, suggested_qty: p.moq || 50, cogs: p.cogs })))
    .map((r) => ({ sku: r.sku, qty: r.suggested_qty || r.moq || 50, unit_cost: r.cogs || 1 }));

  const freight = +(380 + Math.random() * 900).toFixed(2);
  const customs = +(lines.reduce((a, l) => a + l.qty * l.unit_cost, 0) * 0.045).toFixed(2);

  const shipment = db.insert('flexport_shipments', {
    id: uid('flx_shp'),
    flexport_shipment_id: `SIM-${uid('s').slice(2)}`,
    mode: 'LCL',
    origin_port: 'CNSHA',
    destination_port: 'USATL',
    status: 'cleared',
    line_items: lines,
    line_items_count: lines.length,
    freight_total_usd: freight,
    customs_total_usd: customs,
    eta: new Date().toISOString(),
    customer_facing: false,
  });
  log('receiving.simulated_clearance', shipment.id, { lines: lines.length, freight, customs });

  const result = await receiveClearedShipment(shipment);
  return { shipment, result };
}
