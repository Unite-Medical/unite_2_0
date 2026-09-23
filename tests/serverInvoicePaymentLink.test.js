import { test } from 'node:test';
import assert from 'node:assert/strict';

import { paymentLinkForInvoice } from '../api/finance/payment-link.js';

test('customer payment link is organization-scoped and never marks an invoice paid', () => {
  const invoice = { id: 'INV-1', customer_id: 'org_1', status: 'open', payment_url: 'https://invoice.stripe.test/one' };
  const result = paymentLinkForInvoice({ invoice, session: { role: 'customer', org_id: 'org_1' } });
  assert.deepEqual(result, { ok: true, invoice_id: 'INV-1', payment_url: invoice.payment_url });
  assert.equal(invoice.status, 'open');
  assert.equal(paymentLinkForInvoice({ invoice, session: { role: 'customer', org_id: 'org_2' } }).reason, 'invoice_owner_mismatch');
  assert.equal(paymentLinkForInvoice({ invoice: { ...invoice, status: 'paid' }, session: { role: 'customer', org_id: 'org_1' } }).reason, 'invoice_not_open');
  assert.equal(paymentLinkForInvoice({ invoice: { ...invoice, payment_url: null }, session: { role: 'customer', org_id: 'org_1' } }).reason, 'payment_link_not_ready');
});
