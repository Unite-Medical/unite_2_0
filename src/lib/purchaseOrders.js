/**
 * Purchase-order lifecycle — PRD-12 (procurement) + PRD-02 (QBO AP).
 *
 * `draftPurchaseOrders()` in replenishment.js creates POs in `draft`.
 * This module carries each PO the rest of the way:
 *
 *   draft → approved → sent → partially_received → received → closed
 *                                       └→ cancelled (any pre-receipt stage)
 *
 * Each transition is idempotent-ish (guards on current status), writes
 * an audit_log entry, and — where money/goods move — syncs to QBO and
 * the WMS through the existing stubbed clients (real once env keys land).
 */

import { db } from './db.js';
import { uid } from './format.js';
import { qbo } from './services.js';
import { gmail } from './services.js';
import { recalcReorderPoints } from './replenishment.js';

export const PO_STATUS = {
  DRAFT: 'draft',
  APPROVED: 'approved',
  SENT: 'sent',
  PARTIAL: 'partially_received',
  RECEIVED: 'received',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
};

const RECEIVABLE = new Set([PO_STATUS.SENT, PO_STATUS.APPROVED, PO_STATUS.PARTIAL]);

function log(kind, ref_id, payload) {
  db.insert('audit_log', { id: uid('aud'), kind, ref_id, payload });
}

/** Resolve a vendor's purchasing email (synthesized when not on file). */
export function vendorEmail(vendorName) {
  const v = db.list('vendors').find((r) => r.name === vendorName);
  if (v?.email) return v.email;
  const slug = String(vendorName || 'vendor').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `purchasing@${slug || 'vendor'}.example.com`;
}

/** Resolve (and cache) a vendor's QBO id so bills/POs link correctly. */
function vendorQboId(vendorName) {
  const v = db.list('vendors').find((r) => r.name === vendorName);
  return v?.qbo_vendor_id || undefined;
}

/** Outstanding (ordered − received) quantity per line for a PO. */
export function outstandingLines(po) {
  return (po?.line_items || []).map((li) => ({
    ...li,
    received_qty: li.received_qty || 0,
    outstanding: Math.max(0, (li.qty || 0) - (li.received_qty || 0)),
  }));
}

export function isFullyReceived(po) {
  return outstandingLines(po).every((l) => l.outstanding === 0);
}

/**
 * Approve a draft PO. Optionally pushes a matching PurchaseOrder into
 * QBO so the books reflect the open commitment.
 */
export async function approvePurchaseOrder(po_id, { approved_by = 'admin', syncQbo = true } = {}) {
  const po = db.get('purchase_orders', po_id);
  if (!po) return { ok: false, reason: 'not_found' };
  if (po.status !== PO_STATUS.DRAFT) return { ok: false, reason: `cannot_approve_from_${po.status}` };

  let qbo_po_id = po.qbo_po_id || null;
  if (syncQbo) {
    try {
      const res = await qbo.createPurchaseOrder({ po, vendor_qbo_id: vendorQboId(po.vendor_name) });
      qbo_po_id = res?.id || null;
    } catch (err) {
      log('po.qbo_sync_failed', po_id, { error: err.message });
    }
  }

  const updated = db.update('purchase_orders', po_id, {
    status: PO_STATUS.APPROVED,
    approved_by,
    approved_at: new Date().toISOString(),
    qbo_po_id,
  });
  log('po.approved', po_id, { approved_by, qbo_po_id });
  return { ok: true, po: updated };
}

/**
 * Email the PO to the vendor and mark it sent. Uses the Gmail client
 * (outbox queue today; real send once a proxy/credentials are present).
 */
export async function sendPurchaseOrderToVendor(po_id, { sent_by = 'admin' } = {}) {
  const po = db.get('purchase_orders', po_id);
  if (!po) return { ok: false, reason: 'not_found' };
  if (po.status !== PO_STATUS.APPROVED && po.status !== PO_STATUS.DRAFT) {
    return { ok: false, reason: `cannot_send_from_${po.status}` };
  }

  const to = vendorEmail(po.vendor_name);
  const lines = (po.line_items || []).map((l) => `  ${l.qty} × ${l.sku} — ${l.name || ''} @ $${(l.cost || 0).toFixed(2)}`).join('\n');
  try {
    await gmail.send({
      to,
      from: 'purchasing@unitemedical.net',
      subject: `Purchase Order ${po.id} — Unite Medical`,
      body: `Hello,\n\nPlease find Unite Medical purchase order ${po.id}.\n\n${lines}\n\nTotal: $${(po.total_cost || 0).toFixed(2)}\nRequested delivery: ${po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString() : 'ASAP'}\nShip to: Unite Medical, 1487 Trae Lane, Lithia Springs, GA 30122\n\nPlease confirm receipt and expected ship date.\n\n— Unite Medical Purchasing`,
      template_key: 'purchase_order',
      drafted_by: sent_by,
    });
  } catch (err) {
    log('po.send_failed', po_id, { error: err.message });
    return { ok: false, reason: 'send_failed', error: err.message };
  }

  const updated = db.update('purchase_orders', po_id, {
    status: PO_STATUS.SENT,
    sent_by,
    sent_to: to,
    sent_at: new Date().toISOString(),
  });
  log('po.sent', po_id, { to });
  return { ok: true, po: updated, to };
}

/**
 * Receive goods against a PO.
 *
 * @param {string} po_id
 * @param {object} [opts]
 * @param {{sku:string, qty:number}[]} [opts.receipts]  lines received now;
 *        when omitted, receives all outstanding quantities.
 * @param {string} [opts.warehouse_id]  destination warehouse (default wh_atl)
 *
 * Side effects: increments inventory, records a `po_receipts` row,
 * recalculates reorder points, and — once the PO is fully received —
 * posts the vendor Bill to QBO and closes the PO.
 */
export async function receivePurchaseOrder(po_id, { receipts = null, warehouse_id = 'wh_atl', received_by = 'admin' } = {}) {
  const po = db.get('purchase_orders', po_id);
  if (!po) return { ok: false, reason: 'not_found' };
  if (!RECEIVABLE.has(po.status)) return { ok: false, reason: `cannot_receive_from_${po.status}` };

  const lines = po.line_items || [];
  const wanted = receipts || outstandingLines(po).map((l) => ({ sku: l.sku, qty: l.outstanding }));
  const receivedNow = [];

  const nextLines = lines.map((li) => {
    const r = wanted.find((w) => w.sku === li.sku);
    const already = li.received_qty || 0;
    const outstanding = Math.max(0, (li.qty || 0) - already);
    const qty = Math.max(0, Math.min(Number(r?.qty) || 0, outstanding));
    if (qty <= 0) return { ...li, received_qty: already };

    // Inventory receipt at the destination warehouse.
    const inv = db.list('inventory', { where: { sku: li.sku, warehouse_id } })[0];
    if (inv) {
      db.update('inventory', inv.id, { on_hand: (inv.on_hand || 0) + qty });
    } else {
      db.insert('inventory', {
        id: `inv_${warehouse_id.replace('wh_', '')}_${li.sku}`,
        sku: li.sku,
        warehouse_id,
        on_hand: qty,
        reserved: 0,
        reorder_at: 0,
        reorder_qty: 0,
      });
    }
    receivedNow.push({ sku: li.sku, qty, cost: li.cost || 0 });
    return { ...li, received_qty: already + qty };
  });

  const totalUnits = receivedNow.reduce((a, l) => a + l.qty, 0);
  if (totalUnits === 0) return { ok: false, reason: 'nothing_to_receive' };

  const receipt = db.insert('po_receipts', {
    id: uid('rcpt'),
    po_id,
    warehouse_id,
    received_by,
    lines: receivedNow,
    units: totalUnits,
    value: +receivedNow.reduce((a, l) => a + l.qty * (l.cost || 0), 0).toFixed(2),
    received_at: new Date().toISOString(),
  });
  log('po.received', po_id, { receipt_id: receipt.id, units: totalUnits, warehouse: warehouse_id });

  const poAfter = { ...po, line_items: nextLines };
  const fullyReceived = isFullyReceived(poAfter);

  // Recalculate reorder points off the new on-hand position.
  let reorderRows = 0;
  try { reorderRows = recalcReorderPoints(); } catch (err) { log('po.reorder_recalc_failed', po_id, { error: err.message }); }

  // On full receipt, post the vendor Bill (AP) to QBO and close the PO.
  let bill = null;
  if (fullyReceived) {
    try {
      bill = await qbo.createBillFromPO({ po: poAfter, vendor_qbo_id: vendorQboId(po.vendor_name) });
    } catch (err) {
      log('po.bill_failed', po_id, { error: err.message });
    }
  }

  const updated = db.update('purchase_orders', po_id, {
    line_items: nextLines,
    status: fullyReceived ? PO_STATUS.RECEIVED : PO_STATUS.PARTIAL,
    received_at: fullyReceived ? new Date().toISOString() : po.received_at || null,
    qbo_bill_id: bill?.id || po.qbo_bill_id || null,
    bill_amount: bill?.amount ?? po.bill_amount ?? null,
  });

  return { ok: true, po: updated, receipt, fully_received: fullyReceived, reorder_rows: reorderRows, bill };
}

/**
 * Three-way match: PurchaseOrder ↔ goods received ↔ vendor Bill.
 * Returns per-line and total discrepancies so AP can block payment
 * on a mismatch (CTO brief: stop paying for what didn't arrive).
 */
export function threeWayMatch(po_id) {
  const po = db.get('purchase_orders', po_id);
  if (!po) return { ok: false, reason: 'not_found' };

  const receipts = db.list('po_receipts', { where: { po_id } });
  const receivedBySku = {};
  for (const r of receipts) for (const l of r.lines || []) receivedBySku[l.sku] = (receivedBySku[l.sku] || 0) + l.qty;

  const lines = (po.line_items || []).map((li) => {
    const received = receivedBySku[li.sku] || 0;
    return {
      sku: li.sku,
      name: li.name,
      ordered_qty: li.qty || 0,
      received_qty: received,
      qty_variance: received - (li.qty || 0),
      unit_cost: li.cost || 0,
      ordered_value: +((li.qty || 0) * (li.cost || 0)).toFixed(2),
      received_value: +(received * (li.cost || 0)).toFixed(2),
    };
  });

  const orderedTotal = +lines.reduce((a, l) => a + l.ordered_value, 0).toFixed(2);
  const receivedTotal = +lines.reduce((a, l) => a + l.received_value, 0).toFixed(2);
  const billTotal = po.bill_amount ?? null;
  const discrepancies = lines.filter((l) => l.qty_variance !== 0);
  const billMatches = billTotal == null ? null : Math.abs(billTotal - receivedTotal) < 0.01;

  return {
    ok: true,
    po_id,
    lines,
    ordered_total: orderedTotal,
    received_total: receivedTotal,
    bill_total: billTotal,
    qty_matched: discrepancies.length === 0,
    bill_matched: billMatches,
    matched: discrepancies.length === 0 && billMatches !== false,
    discrepancies,
  };
}

/** Cancel a PO before goods are received. */
export async function cancelPurchaseOrder(po_id, { reason = '', cancelled_by = 'admin' } = {}) {
  const po = db.get('purchase_orders', po_id);
  if (!po) return { ok: false, reason: 'not_found' };
  if (po.status === PO_STATUS.RECEIVED || po.status === PO_STATUS.CLOSED) {
    return { ok: false, reason: `cannot_cancel_from_${po.status}` };
  }
  const updated = db.update('purchase_orders', po_id, {
    status: PO_STATUS.CANCELLED,
    cancelled_by,
    cancel_reason: reason,
    cancelled_at: new Date().toISOString(),
  });
  log('po.cancelled', po_id, { reason, cancelled_by });
  return { ok: true, po: updated };
}

/** Close a fully-received PO (terminal, post-reconciliation). */
export function closePurchaseOrder(po_id) {
  const po = db.get('purchase_orders', po_id);
  if (!po) return { ok: false, reason: 'not_found' };
  if (po.status !== PO_STATUS.RECEIVED) return { ok: false, reason: `cannot_close_from_${po.status}` };
  const updated = db.update('purchase_orders', po_id, { status: PO_STATUS.CLOSED, closed_at: new Date().toISOString() });
  log('po.closed', po_id, {});
  return { ok: true, po: updated };
}
