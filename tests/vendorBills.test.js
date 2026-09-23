import { test } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../src/lib/db.js';
import { purchaseOrders } from '../src/lib/wms/purchaseOrders.js';
import { applyApprovedBillQuantities, matchVendorBill } from '../src/lib/vendorBills.js';
import { buildSettlementDrafts } from '../api/_lib/distributorSettlement.js';
import { buildQboApprovedBill, postQboApprovedBill } from '../api/_lib/qboBills.js';
import { approveVendorBillLocal, submitVendorBillLocal } from '../src/lib/vendorBillWorkflow.js';

function payablePo(suffix) {
  const id = `po_payable_${suffix}`;
  db.insert('purchase_orders', {
    id,
    status: 'partial',
    vendor_id: 'vendor_payable',
    vendor_name: 'Payable Vendor',
    line_items: [{ sku: `PAY-${suffix}`, name: 'Payable line', qty: 10, cost: 5, accepted_qty: 8, received_qty: 8, billed_qty: 0 }],
    total_cost: 50,
  });
  return { id, sku: `PAY-${suffix}` };
}

test('payable matcher holds an unexpected vendor-bill SKU in full', () => {
  const po = payablePo('EXTRA');
  const result = purchaseOrders.payableSummary(po.id, {
    vendor_bill_lines: [
      { sku: po.sku, qty: 8, unit_cost: 5 },
      { sku: 'NOT-ON-PO', qty: 1, unit_cost: 100000 },
    ],
  });

  assert.equal(result.approved_amount, 40);
  assert.equal(result.held_amount, 100000);
  assert.equal(result.can_approve_full_bill, false);
  assert.equal(result.unexpected_lines.length, 1);
  assert.equal(result.unexpected_lines[0].sku, 'NOT-ON-PO');
});

test('QBO bill payload contains only matched approved quantity at PO-capped cost', () => {
  const po = {
    id: 'po_qbo', vendor_qbo_id: 'QBO-VENDOR-9',
    line_items: [{ sku: 'PAY-QBO', name: 'Payable line', qty: 10, cost: 5, accepted_qty: 8, billed_qty: 0, qbo_item_id: 'QBO-ITEM-4' }],
  };
  const match = purchaseOrders.payableSummary(payablePo('QBO-MATCH').id, {
    vendor_bill_lines: [{ sku: 'PAY-QBO-MATCH', qty: 8, unit_cost: 500 }],
  });
  const normalizedMatch = { ...match, lines: match.lines.map((line) => ({ ...line, sku: 'PAY-QBO' })) };
  const payload = buildQboApprovedBill({
    po,
    vendor_bill: { id: 'vbill_1', vendor_invoice_number: 'INV-44', invoice_date: '2026-07-18' },
    match: normalizedMatch,
    inventory_account_id: 'QBO-ASSET-1',
  });

  assert.equal(payload.VendorRef.value, 'QBO-VENDOR-9');
  assert.match(payload.DocNumber, /^UM-[A-F0-9]{16}$/);
  assert.match(payload.PrivateNote, /vendor invoice INV-44/);
  assert.equal(payload.Line.length, 1);
  assert.equal(payload.Line[0].Amount, 40);
  assert.equal(payload.Line[0].ItemBasedExpenseLineDetail.ItemRef.value, 'QBO-ITEM-4');

  const updated = applyApprovedBillQuantities(po, normalizedMatch);
  assert.equal(updated.line_items[0].billed_qty, 8);
});

test('payable matcher approves contracted PO cost and holds vendor price inflation', () => {
  const po = payablePo('PRICE');
  const result = purchaseOrders.payableSummary(po.id, {
    vendor_bill_lines: [{ sku: po.sku, qty: 8, unit_cost: 500 }],
  });

  assert.equal(result.approved_amount, 40);
  assert.equal(result.held_amount, 3960);
  assert.equal(result.can_approve_full_bill, false);
  assert.equal(result.lines[0].po_unit_cost, 5);
  assert.equal(result.lines[0].vendor_unit_cost, 500);
  assert.equal(result.lines[0].price_variance_amount, 3960);
});

test('duplicate vendor invoice SKUs aggregate before matching so no invoice quantity disappears', () => {
  const po = payablePo('DUPLICATE');
  const result = purchaseOrders.payableSummary(po.id, {
    vendor_bill_lines: [
      { sku: po.sku, qty: 4, unit_cost: 5 },
      { sku: po.sku, qty: 4, unit_cost: 5 },
    ],
  });

  assert.equal(result.lines[0].vendor_billed_qty, 8);
  assert.equal(result.lines[0].approved_qty, 8);
  assert.equal(result.approved_amount, 40);
  assert.equal(result.held_amount, 0);
});

test('local finance workflow approves only accepted quantity and retains the short-pay variance', async () => {
  const poRef = payablePo('LOCAL-FLOW');
  db.update('purchase_orders', poRef.id, { vendor_qbo_id: 'QBO-VENDOR-LOCAL' });
  const submitted = submitVendorBillLocal({
    po_id: poRef.id,
    vendor_invoice_number: 'INV-LOCAL-44',
    invoice_date: '2026-07-18',
    lines: [{ sku: poRef.sku, qty: 8, unit_cost: 500 }],
    submitted_by: 'finance-local',
  });

  assert.equal(submitted.ok, true);
  assert.equal(submitted.vendor_bill.status, 'variance_review');
  assert.equal(submitted.match.approved_amount, 40);
  assert.equal(submitted.match.held_amount, 3960);
  assert.equal(db.list('vendor_bill_variances', { where: { vendor_bill_id: submitted.vendor_bill.id } }).length, 1);

  let qboCalls = 0;
  const approved = await approveVendorBillLocal(submitted.vendor_bill.id, {
    approved_by: 'finance-local',
    postToQbo: async ({ match }) => {
      qboCalls += 1;
      assert.equal(match.approved_amount, 40);
      return { ok: true, qbo_bill_id: 'QBO-BILL-LOCAL-44', qbo_sync_token: '0' };
    },
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.vendor_bill.status, 'approved_short_pay');
  assert.equal(db.get('purchase_orders', poRef.id).line_items[0].billed_qty, 8);
  assert.equal(db.list('vendor_bill_approvals', { where: { vendor_bill_id: submitted.vendor_bill.id } }).length, 1);

  const replay = await approveVendorBillLocal(submitted.vendor_bill.id, {
    approved_by: 'finance-local',
    postToQbo: async () => { qboCalls += 1; return { ok: true, qbo_bill_id: 'SHOULD-NOT-POST' }; },
  });
  assert.equal(replay.duplicate, true);
  assert.equal(qboCalls, 1);
});

test('settlement PO AP matches eligible sell-through evidence without a receipt', () => {
  const settlement = buildSettlementDrafts({
    candidates: [{ movement_id: 'cm_ap_1', owner_org_id: 'org_dist', inventory_lot_id: 'lot_1', distributor_sku: 'DIST-A', product_sku: 'SHARED-A', qty: 3, eligible_at: '2026-07-18T12:00:00Z' }],
    agreements: [{ id: 'agr_ap_1', owner_org_id: 'org_dist', distributor_sku: 'DIST-A', mapped_unite_sku: 'SHARED-A', name: 'Device', unite_sellable: true, settlement_unit_cost: 11.5 }],
  });
  const po = settlement.purchase_orders[0];
  const match = matchVendorBill(po, {
    vendor_bill_lines: [{ sku: 'DIST-A', qty: 3, unit_cost: 11.5 }],
    settlement_movements: [{ id: 'cm_ap_1', settlement_po_id: po.id, qty: 3, settled: false }],
  });
  assert.equal(match.ok, true);
  assert.equal(match.approved_amount, 34.5);
  assert.equal(match.held_amount, 0);
  assert.equal(match.lines[0].approved_qty, 3);
  assert.deepEqual(match.evidence_ids, ['cm_ap_1']);
  assert.equal(matchVendorBill(po, {
    vendor_bill_lines: [{ sku: 'DIST-A', qty: 3, unit_cost: 11.5 }],
    settlement_movements: [],
  }).reason, 'eligible_settlement_evidence_required');
});

test('vendor bill rejects malformed or blank-SKU charges instead of dropping them', () => {
  const po = { id: 'po_invalid', line_items: [{ sku: 'SKU-A', qty: 1, accepted_qty: 1, billed_qty: 0, cost: 5 }] };
  const match = matchVendorBill(po, { vendor_bill_lines: [
    { sku: 'SKU-A', qty: 1, unit_cost: 5 },
    { sku: '', qty: 1, unit_cost: 1000 },
  ] });
  assert.equal(match.ok, false);
  assert.equal(match.reason, 'invalid_vendor_bill_line');
});

test('duplicate PO SKUs share invoice quantity once and billable projection falls after approval', () => {
  const po = {
    id: 'po_duplicate_rows',
    line_items: [
      { id: 'po_line_1', sku: 'SKU-A', qty: 2, accepted_qty: 2, billed_qty: 0, billable_qty: 2, cost: 5 },
      { id: 'po_line_2', sku: 'SKU-A', qty: 2, accepted_qty: 2, billed_qty: 0, billable_qty: 2, cost: 5 },
    ],
  };
  const match = matchVendorBill(po, { vendor_bill_lines: [{ sku: 'SKU-A', qty: 4, unit_cost: 5 }] });
  assert.equal(match.ok, true);
  assert.equal(match.approved_amount, 20);
  assert.equal(match.lines.length, 1);
  assert.equal(match.lines[0].approved_qty, 4);
  const updated = applyApprovedBillQuantities(po, match);
  assert.deepEqual(updated.line_items.map((line) => line.billed_qty), [2, 2]);
  assert.deepEqual(updated.line_items.map((line) => line.billable_qty), [0, 0]);
});

test('QBO bill posting reconciles by stable document reference before POST and after an unknown outcome', async () => {
  const args = {
    po: { id: 'po_qbo_reconcile', vendor_qbo_id: 'vendor_1', line_items: [{ sku: 'SKU-A', qty: 1, cost: 5, qbo_item_id: 'item_1' }] },
    vendor_bill: { id: 'vbill_stable_1', vendor_invoice_number: 'INV-44', invoice_date: '2026-07-18' },
    match: { approved_amount: 5, lines: [{ sku: 'SKU-A', approved_qty: 1, approved_unit_cost: 5 }] },
  };
  const service = {
    configured: () => true,
    buildUrl: (path, query) => query.q ? `https://qbo.test/query?q=${encodeURIComponent(query.q)}` : `https://qbo.test${path}`,
    headers: async () => ({ Authorization: 'test' }),
  };
  const calls = [];
  const existing = await postQboApprovedBill(args, {
    service,
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      return { ok: true, status: 200, json: async () => ({ QueryResponse: { Bill: [{ Id: 'QBO-EXISTING', SyncToken: '3', TotalAmt: 5 }] } }) };
    },
  });
  assert.equal(existing.ok, true);
  assert.equal(existing.reconciled, true);
  assert.equal(existing.qbo_bill_id, 'QBO-EXISTING');
  assert.deepEqual(calls.map((call) => call.method), ['GET']);

  let attempt = 0;
  const unknown = await postQboApprovedBill(args, {
    service,
    fetchImpl: async (_url, options) => {
      attempt += 1;
      if (options.method === 'GET') return { ok: true, status: 200, json: async () => ({ QueryResponse: {} }) };
      throw new Error('timeout after upstream commit');
    },
  });
  assert.equal(unknown.reason, 'qbo_outcome_unknown');
  const recovered = await postQboApprovedBill(args, {
    service,
    fetchImpl: async (_url, options) => ({
      ok: true, status: 200,
      json: async () => options.method === 'GET'
        ? ({ QueryResponse: { Bill: [{ Id: 'QBO-AFTER-TIMEOUT', SyncToken: '0', TotalAmt: 5 }] } })
        : ({ Bill: { Id: 'SHOULD-NOT-POST' } }),
    }),
  });
  assert.equal(recovered.reconciled, true);
  assert.equal(recovered.qbo_bill_id, 'QBO-AFTER-TIMEOUT');
  assert.ok(attempt >= 2);
});

test('purchase order close is blocked while AP or settlement payment remains unresolved', () => {
  const poId = 'po_close_guard';
  db.insert('purchase_orders', {
    id: poId, status: 'received', po_type: 'inventory',
    line_items: [{ sku: 'SKU-CLOSE', qty: 1, accepted_qty: 1, billed_qty: 0, cost: 5 }],
  });
  db.insert('vendor_bills', { id: 'vbill_close_guard', po_id: poId, status: 'matched' });
  assert.equal(purchaseOrders.close(poId).reason, 'ap_unresolved');
  db.update('vendor_bills', 'vbill_close_guard', { status: 'approved', qbo_bill_id: 'QBO-1' });
  db.update('purchase_orders', poId, {
    line_items: [{ sku: 'SKU-CLOSE', qty: 1, accepted_qty: 1, billed_qty: 1, billable_qty: 0, cost: 5 }],
  });
  assert.equal(purchaseOrders.close(poId).po.status, 'closed');

  db.insert('purchase_orders', {
    id: 'spo_close_guard', status: 'approved', po_type: 'consignment_settlement',
    total_cost: 10, paid_amount: 0, line_items: [],
  });
  assert.equal(purchaseOrders.close('spo_close_guard').reason, 'settlement_payment_evidence_required');
});
