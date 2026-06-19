/**
 * UniteWMS — purchase-order lifecycle (PRD-25 §3, §7 inbound).
 *
 *   draft → approved → sent → partial → received → closed   (or cancelled)
 *
 * Operates on the EXISTING `purchase_orders` table that replenishment.js
 * already drafts (extend, don't duplicate). Receiving a PO line creates lots +
 * posts `receipt` ledger movements (via wms/lots.receiveLot) and posts the QBO
 * landed-cost bill on receipt. Line items carry `received_qty` in their JSONB
 * shape, so PO math (SUM(received_qty) == receipt movements) is verifiable.
 */

import { db } from '../db.js';
import { uid } from '../format.js';
import { lots } from './lots.js';
import { qbo } from '../services.js';
import { recalcReorderPoints } from '../replenishment.js';

const FLOW = {
  draft: ['approved', 'cancelled'],
  approved: ['sent', 'cancelled'],
  sent: ['partial', 'received', 'cancelled'],
  partial: ['partial', 'received', 'cancelled'],
  received: ['closed'],
  closed: [],
  cancelled: [],
};

function audit(kind, ref_id, payload) {
  try { db.insert('audit_log', { id: uid('aud'), kind, ref_id, payload }); } catch { /* never break */ }
}

function get(poId) { return db.get('purchase_orders', poId); }

function canTransition(from, to) {
  return (FLOW[from] || []).includes(to);
}

/** Create a PO (draft). Mostly replenishment.draftPurchaseOrders drives this. */
export function create({ vendor_name, vendor_id = null, line_items = [], expected_delivery = null, warehouse_id = 'wh_atl', created_by = 'manual' }) {
  const lineItems = line_items.map((l) => ({ sku: l.sku, name: l.name, qty: Number(l.qty) || 0, cost: Number(l.cost ?? l.cogs) || 0, received_qty: 0 }));
  const total = +(lineItems.reduce((a, l) => a + l.qty * l.cost, 0)).toFixed(2);
  const row = db.insert('purchase_orders', {
    id: uid('po'), vendor_name, vendor_id, status: 'draft', created_by,
    warehouse_id, line_items: lineItems, total_cost: total,
    expected_delivery: expected_delivery ? new Date(expected_delivery).toISOString() : null,
  });
  audit('wms.po_created', row.id, { vendor: vendor_name, lines: lineItems.length, total });
  return row;
}

function transition(poId, to, extra = {}) {
  const po = get(poId);
  if (!po) return { ok: false, reason: 'po_not_found' };
  if (po.status === to) return { ok: true, po, noop: true };
  if (!canTransition(po.status, to)) return { ok: false, reason: `illegal_transition_${po.status}_to_${to}` };
  const updated = db.update('purchase_orders', poId, { status: to, ...extra });
  audit(`wms.po_${to}`, poId, { from: po.status });
  return { ok: true, po: updated };
}

export function approve(poId, { approved_by = 'manager' } = {}) {
  return transition(poId, 'approved', { approved_by, approved_at: new Date().toISOString() });
}

/** Send to vendor — emails the PO (best effort; never blocks the transition). */
export async function send(poId, { to = null } = {}) {
  const res = transition(poId, 'sent', { sent_at: new Date().toISOString() });
  if (!res.ok) return res;
  try {
    const { mailer } = await import('../mailer.js');
    const po = res.po;
    await mailer.send({
      to: to || po.vendor_email || `orders@${String(po.vendor_name || 'vendor').toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`,
      subject: `Purchase Order ${po.id}`,
      body: `Please confirm PO ${po.id} — ${po.line_items?.length || 0} line(s), total $${(po.total_cost || 0).toLocaleString()}.`,
      template_key: 'po/sent', drafted_by: 'system',
    });
  } catch { /* outbox best effort */ }
  return res;
}

/**
 * Receive against a PO. `receipts` = [{ sku, qty, lot_number, expiration_date,
 * unit_cost }]. Creates lots + posts receipt ledger movements, advances each
 * line's received_qty, sets PO status partial/received, posts the QBO bill
 * when fully received, and recalcs reorder points. Idempotent per receipt.
 *
 * @returns {{ok:boolean, status:string, received:number, lots:Array, bill?:object}}
 */
export async function receive(poId, receipts = [], { received_by = 'receiver', warehouse_id = null } = {}) {
  const po = get(poId);
  if (!po) return { ok: false, reason: 'po_not_found' };
  if (['draft', 'cancelled', 'closed'].includes(po.status)) return { ok: false, reason: `cannot_receive_${po.status}` };

  const wh = warehouse_id || po.warehouse_id || 'wh_atl';
  const lineItems = (po.line_items || []).map((l) => ({ ...l }));
  const lotRows = [];
  let receivedUnits = 0;

  for (const r of receipts) {
    const qty = Number(r.qty) || 0;
    if (!r.sku || qty <= 0) continue;
    const line = lineItems.find((l) => l.sku === r.sku);
    const res = lots.receiveLot({
      sku: r.sku, lot_number: r.lot_number, expiration_date: r.expiration_date || null,
      warehouse_id: wh, qty, unit_cost: r.unit_cost ?? line?.cost ?? null,
      received_by, ref_type: 'purchase_order', ref_id: poId,
      idempotency_key: r.idempotency_key || `po_recv:${poId}:${r.sku}:${r.lot_number || 'nolot'}:${qty}`,
    });
    if (res.ok && !res.duplicate) {
      if (line) line.received_qty = (Number(line.received_qty) || 0) + qty;
      receivedUnits += qty;
      if (res.lot) lotRows.push(res.lot);
    }
  }

  const fullyReceived = lineItems.every((l) => (Number(l.received_qty) || 0) >= (Number(l.qty) || 0));
  const anyReceived = lineItems.some((l) => (Number(l.received_qty) || 0) > 0);
  const nextStatus = fullyReceived ? 'received' : anyReceived ? 'partial' : po.status;

  db.update('purchase_orders', poId, {
    line_items: lineItems,
    status: nextStatus,
    received_at: fullyReceived ? new Date().toISOString() : po.received_at || null,
  });
  audit('wms.po_received', poId, { received_units: receivedUnits, status: nextStatus });

  // QBO landed-cost bill on full receipt (best effort).
  let bill = null;
  if (fullyReceived && !po.qbo_bill_id) {
    try {
      if (typeof qbo.createBill === 'function') {
        bill = await qbo.createBill({ po_id: poId, vendor_name: po.vendor_name, amount: po.total_cost, lines: lineItems });
      } else if (typeof qbo.createBillFromFlexport === 'function') {
        bill = await qbo.createBillFromFlexport({ shipment: { id: poId, freight_total_usd: 0, customs_total_usd: 0 } });
      }
      if (bill) db.update('purchase_orders', poId, { qbo_bill_id: bill.id || bill.qbo_bill_id || null });
    } catch (err) { audit('wms.po_bill_failed', poId, { error: err.message }); }
  }

  // Refresh reorder points now that stock landed.
  try { recalcReorderPoints(); } catch { /* non-fatal */ }

  return { ok: true, status: nextStatus, received: receivedUnits, lots: lotRows, bill };
}

export function close(poId) { return transition(poId, 'closed', { closed_at: new Date().toISOString() }); }
export function cancel(poId, { reason = 'manual' } = {}) { return transition(poId, 'cancelled', { cancelled_at: new Date().toISOString(), cancel_reason: reason }); }

/** Expected vs received units for a PO (drives the board + the verifier). */
export function progress(poId) {
  const po = get(poId);
  if (!po) return null;
  const ordered = (po.line_items || []).reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const received = (po.line_items || []).reduce((a, l) => a + (Number(l.received_qty) || 0), 0);
  return { id: poId, status: po.status, ordered, received, remaining: ordered - received };
}

export const purchaseOrders = { create, approve, send, receive, close, cancel, progress };
