import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planInvoicePayment } from '../api/_lib/arPayment.js';

const invoice = { id: 'INV-1', order_id: 'ORDER-1', customer_id: 'ORG-1', amount: 100, balance: 100, status: 'open', payment_evidence: [] };
const order = { id: 'ORDER-1', payment_status: 'pending', paid_amount: 0, total: 100 };

test('AR payment evidence updates invoice and order only to the amount documented', () => {
  const partial = planInvoicePayment({
    invoice, order,
    input: { provider: 'off_platform', payment_reference: 'WIRE-1', amount: 40, method: 'ach' },
    actorId: 'finance_user',
  });
  assert.equal(partial.ok, true);
  assert.equal(partial.invoice.status, 'partial');
  assert.equal(partial.invoice.balance, 60);
  assert.equal(partial.order.payment_status, 'partial');
  const final = planInvoicePayment({
    invoice: partial.invoice, order: partial.order,
    input: { provider: 'qbo', payment_reference: 'QBO-PAY-2', amount: 60, method: 'ach' },
    actorId: 'finance_user',
  });
  assert.equal(final.invoice.status, 'paid');
  assert.equal(final.invoice.balance, 0);
  assert.equal(final.order.payment_status, 'paid');
});

test('AR payment evidence rejects missing references, overpayment, and conflicting replay', () => {
  assert.equal(planInvoicePayment({ invoice, order, input: { amount: 100 }, actorId: 'finance' }).reason, 'payment_evidence_required');
  assert.equal(planInvoicePayment({ invoice, order, input: { provider: 'qbo', payment_reference: 'X', amount: 101, method: 'ach' }, actorId: 'finance' }).reason, 'invoice_overpayment');
  const paid = planInvoicePayment({ invoice, order, input: { provider: 'qbo', payment_reference: 'X', amount: 100, method: 'ach' }, actorId: 'finance' });
  assert.equal(planInvoicePayment({ invoice: paid.invoice, order: paid.order, input: { provider: 'qbo', payment_reference: 'X', amount: 100, method: 'ach' }, actorId: 'finance' }).idempotent, true);
});
