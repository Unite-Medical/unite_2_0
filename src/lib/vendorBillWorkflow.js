import { db } from './db.js';
import { uid } from './format.js';
import { applyApprovedBillQuantities, matchVendorBill } from './vendorBills.js';

function normalizedInvoice(value) {
  return String(value || '').trim().toLowerCase();
}

export function submitVendorBillLocal({
  po_id,
  vendor_invoice_number,
  invoice_date,
  lines = [],
  submitted_by = 'finance',
} = {}) {
  const invoiceNumber = String(vendor_invoice_number || '').trim();
  if (!po_id || !invoiceNumber) return { ok: false, reason: 'po_and_invoice_required' };
  if (!Array.isArray(lines) || !lines.length) return { ok: false, reason: 'vendor_bill_lines_required' };
  const po = db.get('purchase_orders', po_id);
  if (!po) return { ok: false, reason: 'po_not_found' };
  const existing = db.list('vendor_bills').find((bill) => (
    bill.po_id === po_id && normalizedInvoice(bill.vendor_invoice_number) === normalizedInvoice(invoiceNumber)
  ));
  if (existing) return { ok: true, duplicate: true, vendor_bill: existing, match: existing.match };

  const match = matchVendorBill(po, { vendor_bill_lines: lines });
  const now = new Date().toISOString();
  const vendorBill = db.insert('vendor_bills', {
    id: uid('vbill'),
    po_id: po.id,
    vendor_id: po.vendor_id || null,
    vendor_name: po.vendor_name || null,
    vendor_invoice_number: invoiceNumber,
    invoice_date: invoice_date || now.slice(0, 10),
    lines,
    match,
    status: match.held_amount > 0 ? 'variance_review' : 'matched',
    submitted_by,
    submitted_at: now,
    updated_at: now,
    qbo_bill_id: null,
    qbo_sync_token: null,
  });

  const variances = [
    ...match.lines.filter((line) => line.held_amount > 0).map((line) => ({
      sku: line.sku,
      amount: line.held_amount,
      reason: line.price_variance_amount > 0 ? 'price_or_quantity_variance' : 'quantity_variance',
    })),
    ...match.unexpected_lines.map((line) => ({ sku: line.sku, amount: line.held_amount, reason: line.reason })),
  ];
  for (const variance of variances) {
    db.insert('vendor_bill_variances', {
      id: uid('vbvar'), vendor_bill_id: vendorBill.id, po_id: po.id,
      ...variance, status: 'open', created_at: now,
    });
  }
  db.insert('audit_log', {
    id: uid('aud'), kind: 'ap.vendor_bill_submitted', ref_id: vendorBill.id,
    actor_id: submitted_by, payload: { po_id: po.id, approved_amount: match.approved_amount, held_amount: match.held_amount },
  });
  return { ok: true, vendor_bill: vendorBill, match };
}

export async function approveVendorBillLocal(vendorBillId, {
  approved_by = 'finance',
  postToQbo,
} = {}) {
  const vendorBill = db.get('vendor_bills', vendorBillId);
  if (!vendorBill) return { ok: false, reason: 'vendor_bill_not_found' };
  if (vendorBill.qbo_bill_id) return { ok: true, duplicate: true, vendor_bill: vendorBill, match: vendorBill.match };
  const po = db.get('purchase_orders', vendorBill.po_id);
  if (!po) return { ok: false, reason: 'po_not_found' };
  const match = matchVendorBill(po, { vendor_bill_lines: vendorBill.lines });
  if (!(match.approved_amount > 0)) return { ok: false, reason: 'nothing_approved' };
  if (!po.vendor_qbo_id) return { ok: false, reason: 'vendor_qbo_id_required' };
  if (typeof postToQbo !== 'function') return { ok: false, reason: 'qbo_poster_required' };

  const posting = db.update('vendor_bills', vendorBill.id, {
    status: 'posting_to_qbo', match, updated_at: new Date().toISOString(),
  });
  const qboResult = await postToQbo({ po, vendor_bill: posting, match });
  if (!qboResult?.ok) {
    const restored = db.update('vendor_bills', vendorBill.id, {
      status: match.held_amount > 0 ? 'variance_review' : 'matched',
      qbo_error: qboResult || { reason: 'qbo_failed' }, updated_at: new Date().toISOString(),
    });
    return { ok: false, reason: qboResult?.reason || 'qbo_failed', vendor_bill: restored, match };
  }

  const now = new Date().toISOString();
  db.update('purchase_orders', po.id, {
    ...applyApprovedBillQuantities(po, match),
    last_vendor_bill_id: vendorBill.id,
    updated_at: now,
  });
  const approved = db.update('vendor_bills', vendorBill.id, {
    status: match.held_amount > 0 ? 'approved_short_pay' : 'approved',
    match,
    qbo_bill_id: qboResult.qbo_bill_id,
    qbo_sync_token: qboResult.qbo_sync_token || null,
    approved_by,
    approved_at: now,
    approved_amount: match.approved_amount,
    held_amount: match.held_amount,
    qbo_error: null,
    updated_at: now,
  });
  db.insert('vendor_bill_approvals', {
    id: uid('vbapp'), vendor_bill_id: vendorBill.id, po_id: po.id,
    approved_by, approved_amount: match.approved_amount,
    held_amount: match.held_amount, qbo_bill_id: qboResult.qbo_bill_id, approved_at: now,
  });
  db.insert('audit_log', {
    id: uid('aud'), kind: 'ap.vendor_bill_approved', ref_id: vendorBill.id,
    actor_id: approved_by, payload: { qbo_bill_id: qboResult.qbo_bill_id, approved_amount: match.approved_amount, held_amount: match.held_amount },
  });
  return { ok: true, vendor_bill: approved, match };
}
