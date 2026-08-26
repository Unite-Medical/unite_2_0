import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planSettlementPayment } from '../api/_lib/settlementPayment.js';

const po = { id: 'SPO-1', po_type: 'consignment_settlement', status: 'approved', total_cost: 100, paid_amount: 0, eligible_movement_ids: ['cm_1', 'cm_2'] };
const movements = [{ id: 'cm_1', settlement_po_id: po.id, settled: false }, { id: 'cm_2', settlement_po_id: po.id, settled: false }];

test('settlement closes only after cumulative documented payment equals the supplier PO', () => {
  const partial = planSettlementPayment({
    purchaseOrder: po, movements,
    input: { provider: 'qbo', payment_reference: 'QBO-PAY-1', amount: 40 }, actorId: 'finance_user',
  });
  assert.equal(partial.ok, true);
  assert.equal(partial.purchase_order.status, 'partially_paid');
  assert.equal(partial.movements.every((row) => row.settled === false), true);

  const final = planSettlementPayment({
    purchaseOrder: partial.purchase_order, movements: partial.movements,
    input: { provider: 'off_platform', payment_reference: 'WIRE-44', amount: 60 }, actorId: 'finance_user',
  });
  assert.equal(final.purchase_order.status, 'closed');
  assert.equal(final.purchase_order.paid_amount, 100);
  assert.ok(final.purchase_order.paid_at);
  assert.equal(final.movements.every((row) => row.settled === true), true);
  assert.equal(final.movements[0].settlement_payment_reference, 'WIRE-44');
});

test('settlement payment rejects missing evidence, wrong PO type, and overpayment', () => {
  assert.equal(planSettlementPayment({ purchaseOrder: po, movements, input: { amount: 100 }, actorId: 'finance' }).reason, 'payment_evidence_required');
  assert.equal(planSettlementPayment({ purchaseOrder: { ...po, po_type: 'inventory' }, movements, input: { provider: 'qbo', payment_reference: 'X', amount: 100 }, actorId: 'finance' }).reason, 'settlement_po_required');
  assert.equal(planSettlementPayment({ purchaseOrder: po, movements, input: { provider: 'qbo', payment_reference: 'X', amount: 101 }, actorId: 'finance' }).reason, 'settlement_overpayment');
});
