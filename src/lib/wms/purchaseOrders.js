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
import { recalcReorderPoints } from '../replenishment.js';
import { validateTrackingFields } from '../productTracking.js';
import { createVendorReviewToken, hashVendorReviewToken } from '../vendorPoTokens.js';
import { matchVendorBill } from '../vendorBills.js';

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
export function create({ vendor_name, vendor_id = null, vendor_email = null, line_items = [], expected_delivery = null, warehouse_id = 'wh_atl', created_by = 'manual' }) {
  const lineItems = line_items.map((l) => ({
    sku: l.sku,
    name: l.name,
    qty: Number(l.qty) || 0,
    cost: Number(l.cost ?? l.cogs) || 0,
    received_qty: 0,
    accepted_qty: 0,
    rejected_qty: 0,
    billed_qty: 0,
    billable_qty: 0,
    vendor_backorder_qty: Number(l.qty) || 0,
  }));
  const total = +(lineItems.reduce((a, l) => a + l.qty * l.cost, 0)).toFixed(2);
  const row = db.insert('purchase_orders', {
    id: uid('po'), vendor_name, vendor_id, vendor_email, status: 'draft', created_by,
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

/** Send to vendor only after an explicit operator action. */
export async function send(poId, { to = null, sent_by = 'system' } = {}) {
  const current = get(poId);
  if (!current) return { ok: false, reason: 'po_not_found' };
  const recipient = to || current.vendor_email || null;
  if (!recipient) return { ok: false, reason: 'vendor_email_missing' };

  const token = createVendorReviewToken();
  const revision = Number(current.revision || 1);
  const tokenHash = await hashVendorReviewToken(token, poId, revision);
  const sentAt = new Date().toISOString();
  const res = transition(poId, 'sent', {
    sent_at: sentAt,
    sent_by,
    sent_to: recipient,
    vendor_review_token: null,
    vendor_review_token_hash: tokenHash,
    vendor_review_revision: revision,
    vendor_response: 'pending',
  });
  if (!res.ok) return res;

  const reviewUrl = `https://unitemedical.net/vendor/purchase-orders/${poId}?token=${encodeURIComponent(token)}`;

  let message = null;
  try {
    const { mailer } = await import('../mailer.js');
    const po = res.po;
    message = await mailer.send({
      to: recipient,
      from: 'suppliers@unitemedical.net',
      subject: `Purchase Order ${po.id}`,
      body: [
        `Please review Unite Medical purchase order ${po.id}.`,
        '',
        `Review purchase order: ${reviewUrl}`,
        '',
        'Use the review page to acknowledge, request changes, or tell us you cannot fulfill the order.',
      ].join('\n'),
      template_key: 'po/sent',
      drafted_by: sent_by,
    });
  } catch (err) {
    audit('wms.po_send_failed', poId, { error: err.message });
  }

  const providerMessageId = message?.provider_message_id || message?.id || null;
  const updated = db.update('purchase_orders', poId, {
    outbound_message_id: providerMessageId,
    outbound_message_status: message?.status || 'queued',
    outbound_message_provider: message?.provider || 'outbox',
  });
  db.insert('po_communications', {
    id: uid('poc'), po_id: poId, kind: 'sent', actor: sent_by,
    provider: message?.provider || 'outbox', message_id: providerMessageId,
    payload: { to: recipient, review_url: reviewUrl }, occurred_at: sentAt,
  });
  return { ...res, po: updated, message };
}

/**
 * Receive against a sent PO. Every line is validated before the first ledger
 * write so wrong-SKU, overage, and required tracking failures are atomic stops.
 */
export async function receive(poId, receipts = [], { received_by = 'receiver', warehouse_id = null } = {}) {
  const po = get(poId);
  if (!po) return { ok: false, reason: 'po_not_found' };
  if (po.po_type === 'consignment_settlement') return { ok: false, reason: 'settlement_po_not_receivable' };
  if (!['sent', 'partial'].includes(po.status)) return { ok: false, reason: `cannot_receive_${po.status}` };
  if (!Array.isArray(receipts) || receipts.length === 0) return { ok: false, reason: 'no_receipts' };

  const wh = warehouse_id || po.warehouse_id || 'wh_atl';
  const lineItems = (po.line_items || []).map((line) => ({ ...line }));
  const quantitiesBySku = new Map();

  for (const receipt of receipts) {
    const qty = Number(receipt.qty) || 0;
    if (!receipt.sku || qty <= 0) return { ok: false, reason: 'invalid_receipt_line', sku: receipt.sku || null };
    const line = lineItems.find((candidate) => candidate.sku === receipt.sku);
    if (!line) return { ok: false, reason: 'sku_not_on_po', sku: receipt.sku };
    const tracking = validateTrackingFields(receipt.sku, { ...receipt, received_by });
    if (!tracking.ok) return tracking;
    quantitiesBySku.set(receipt.sku, (quantitiesBySku.get(receipt.sku) || 0) + qty);
  }
  for (const [sku, incoming] of quantitiesBySku) {
    const line = lineItems.find((candidate) => candidate.sku === sku);
    const remaining = Math.max(0, Number(line.qty || 0) - Number(line.accepted_qty ?? line.received_qty ?? 0));
    if (incoming > remaining) return { ok: false, reason: 'overage_requires_manager', sku, incoming, remaining };
  }

  const lotRows = [];
  const acceptedLines = [];
  let receivedUnits = 0;
  for (const receipt of receipts) {
    const qty = Number(receipt.qty);
    const line = lineItems.find((candidate) => candidate.sku === receipt.sku);
    const result = lots.receiveLot({
      sku: receipt.sku,
      lot_number: receipt.lot_number || null,
      expiration_date: receipt.expiration_date || null,
      capture_method: receipt.capture_method || null,
      not_applicable_reason: receipt.not_applicable_reason || null,
      warehouse_id: wh,
      qty,
      unit_cost: receipt.unit_cost ?? line.cost ?? null,
      received_by,
      ref_type: 'purchase_order',
      ref_id: poId,
      idempotency_key: receipt.idempotency_key || `po_recv:${poId}:${receipt.sku}:${receipt.lot_number || 'nolot'}:${qty}`,
    });
    if (!result.ok) return { ok: false, reason: result.reason, sku: receipt.sku };
    if (result.duplicate) continue;

    line.received_qty = Number(line.received_qty || 0) + qty;
    line.accepted_qty = Number(line.accepted_qty || 0) + qty;
    line.vendor_backorder_qty = Math.max(0, Number(line.qty || 0) - line.accepted_qty);
    line.billable_qty = Math.max(0, line.accepted_qty - Number(line.billed_qty || 0));
    receivedUnits += qty;
    acceptedLines.push({
      sku: receipt.sku,
      qty,
      unit_cost: receipt.unit_cost ?? line.cost ?? null,
      lot_number: receipt.lot_number || null,
      expiration_date: receipt.expiration_date || null,
      capture_method: receipt.capture_method || null,
      not_applicable_reason: receipt.not_applicable_reason || null,
    });
    if (result.lot) lotRows.push(result.lot);
  }
  if (receivedUnits === 0) return { ok: false, reason: 'nothing_to_receive' };

  const fullyReceived = lineItems.every((line) => Number(line.accepted_qty ?? line.received_qty ?? 0) >= Number(line.qty || 0));
  const nextStatus = fullyReceived ? 'received' : 'partial';
  const receivedAt = new Date().toISOString();
  const receipt = db.insert('po_receipts', {
    id: uid('rcpt'),
    po_id: poId,
    warehouse_id: wh,
    received_by,
    lines: acceptedLines,
    units: receivedUnits,
    value: +acceptedLines.reduce((sum, line) => sum + line.qty * Number(line.unit_cost || 0), 0).toFixed(2),
    received_at: receivedAt,
  });
  const updated = db.update('purchase_orders', poId, {
    line_items: lineItems,
    status: nextStatus,
    received_at: fullyReceived ? receivedAt : po.received_at || null,
    last_receipt_at: receivedAt,
  });
  audit('wms.po_received', poId, { receipt_id: receipt.id, received_units: receivedUnits, status: nextStatus });

  const shortageLines = lineItems.filter((line) => Number(line.vendor_backorder_qty || 0) > 0);
  if (shortageLines.length) {
    if (!db.list('tasks', { where: { kind: 'po_shortage', ref_id: poId, status: 'open' } }).length) {
      db.insert('tasks', {
        id: uid('task'), kind: 'po_shortage', subject: `Short receipt on ${poId}`,
        owner_email: 'accounting@unitemedical.net', status: 'open', ref_type: 'purchase_order', ref_id: poId,
        payload: { lines: shortageLines.map((line) => ({ sku: line.sku, ordered: line.qty, accepted: line.accepted_qty, outstanding: line.vendor_backorder_qty })) },
        created_at: receivedAt,
      });
    }
    audit('wms.po_shortage', poId, { lines: shortageLines.map((line) => ({ sku: line.sku, outstanding: line.vendor_backorder_qty })) });
    try {
      const { mailer } = await import('../mailer.js');
      await mailer.send({
        to: 'accounting@unitemedical.net', from: 'warehouse@unitemedical.net',
        subject: `Short receipt on ${poId}`, body: `Only accepted receipts are payable. Review ${poId} before paying the vendor bill.`,
        template_key: 'po/shortage', drafted_by: 'wms',
      });
    } catch { /* task remains durable */ }
  }

  for (const accepted of acceptedLines) {
    let available = accepted.qty;
    const pending = db.list('backorders', { where: { sku: accepted.sku, status: 'pending' } })
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    for (const backorder of pending) {
      if (available <= 0) break;
      const allocated = Math.min(available, Number(backorder.quantity || 0));
      if (allocated <= 0) continue;
      available -= allocated;
      db.update('backorders', backorder.id, {
        stock_arrived_at: receivedAt,
        stock_arrived_qty: Number(backorder.stock_arrived_qty || 0) + allocated,
        source_po_id: poId,
        status: 'stock_arrived',
      });
      if (!db.list('tasks', { where: { kind: 'backorder_stock_arrived', ref_id: backorder.id } }).length) {
        db.insert('tasks', {
          id: uid('task'), kind: 'backorder_stock_arrived', subject: `Backorder stock arrived for ${backorder.order_id}`,
          owner_email: backorder.assigned_owner_email || 'ops@unitemedical.net', status: 'open',
          ref_type: 'backorder', ref_id: backorder.id,
          payload: { po_id: poId, sku: accepted.sku, quantity: allocated }, created_at: receivedAt,
        });
      }
      audit('backorder.stock_arrived', backorder.id, { po_id: poId, sku: accepted.sku, quantity: allocated });
      try {
        const { mailer } = await import('../mailer.js');
        await mailer.send({
          to: backorder.assigned_owner_email || 'ops@unitemedical.net',
          from: 'warehouse@unitemedical.net',
          subject: `Backorder stock arrived for ${backorder.order_id}`,
          body: `${allocated} unit(s) of ${accepted.sku} arrived on ${poId}. Review and release the linked suborder.`,
          template_key: 'backorder/stock_arrived', drafted_by: 'wms',
        });
      } catch { /* task remains durable */ }
    }
  }

  try { recalcReorderPoints(); } catch { /* non-fatal */ }
  return { ok: true, status: nextStatus, received: receivedUnits, lots: lotRows, receipt, purchase_order: updated };
}

export function payableSummary(poId, { vendor_bill_lines = [] } = {}) {
  const po = get(poId);
  return matchVendorBill(po, { vendor_bill_lines });
}

export function close(poId) {
  const po = get(poId);
  if (!po) return { ok: false, reason: 'po_not_found' };
  if (po.po_type === 'consignment_settlement') {
    if (!po.paid_at || Number(po.paid_amount || 0) + 0.001 < Number(po.total_cost || 0)) {
      return { ok: false, reason: 'settlement_payment_evidence_required' };
    }
    return transition(poId, 'closed', { closed_at: new Date().toISOString() });
  }
  const bills = db.list('vendor_bills', { where: { po_id: poId } });
  const openVariances = db.list('vendor_bill_variances', { where: { po_id: poId, status: 'open' } });
  const unbilled = (po.line_items || []).some((line) => Number(line.accepted_qty ?? line.received_qty ?? 0) > Number(line.billed_qty || 0));
  const pendingBill = bills.some((bill) => !['approved', 'cancelled'].includes(bill.status));
  if (po.ap_posting_lock || unbilled || pendingBill || openVariances.length) return { ok: false, reason: 'ap_unresolved' };
  return transition(poId, 'closed', { closed_at: new Date().toISOString() });
}
export function cancel(poId, { reason = 'manual' } = {}) {
  const po = get(poId);
  if (!po) return { ok: false, reason: 'po_not_found' };
  if (po.vendor_response === 'acknowledged') return { ok: false, reason: 'acknowledged_po_cannot_be_cancelled' };
  return transition(poId, 'cancelled', {
    cancelled_at: new Date().toISOString(),
    cancel_reason: reason,
    vendor_review_token: null,
    vendor_review_token_hash: null,
    vendor_review_revision: null,
    revision: Number(po.revision || 1) + 1,
  });
}

/** Expected vs received units for a PO (drives the board + the verifier). */
export function progress(poId) {
  const po = get(poId);
  if (!po) return null;
  const ordered = (po.line_items || []).reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const received = (po.line_items || []).reduce((a, l) => a + (Number(l.received_qty) || 0), 0);
  return { id: poId, status: po.status, ordered, received, remaining: ordered - received };
}

export const purchaseOrders = { create, approve, send, receive, payableSummary, close, cancel, progress };
