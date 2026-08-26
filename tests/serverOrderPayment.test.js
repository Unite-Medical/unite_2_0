import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createHostedOrderPayment } from '../api/_lib/stripeOrders.js';

const order = {
  id: 'UM-PAY-1', customer_id: 'org_pay', customer_name: 'Paying ASC',
  contact_email: 'ap@paying-asc.org', total: 42, payment_method: 'ach', payment_terms: 'ach',
};
const items = [{ sku: 'SKU-A', name: 'Device A', qty: 2, unit_price: 20, ext_price: 40 }];

test('hosted order payment creates an idempotent Stripe invoice linked to the order', async () => {
  const calls = [];
  const responses = [
    { id: 'cus_1' },
    { id: 'ii_1' },
    { id: 'ii_ship' },
    { id: 'in_1', status: 'draft' },
    { id: 'in_1', status: 'open', hosted_invoice_url: 'https://invoice.stripe.test/in_1' },
    { id: 'in_1', status: 'open', hosted_invoice_url: 'https://invoice.stripe.test/in_1' },
  ];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, form: Object.fromEntries(new URLSearchParams(options.body)) });
    const payload = responses.shift();
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  };
  const result = await createHostedOrderPayment({
    order, items, stripeKey: 'sk_test_not_real', fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider_invoice_id, 'in_1');
  assert.equal(result.payment_url, 'https://invoice.stripe.test/in_1');
  assert.equal(calls.length, 6);
  assert.equal(calls[0].url.endsWith('/v1/customers'), true);
  assert.equal(calls[0].form['metadata[organization_id]'], 'org_pay');
  assert.equal(calls[1].form['metadata[order_id]'], order.id);
  assert.equal(calls[3].form['metadata[order_id]'], order.id);
  assert.equal(calls[3].form['payment_settings[payment_method_types][0]'], 'us_bank_account');
  assert.equal(calls[3].options.headers['Idempotency-Key'], `order:${order.id}:invoice`);
});

test('hosted order payment fails closed without configuration or customer identity', async () => {
  assert.equal((await createHostedOrderPayment({ order, items, stripeKey: '' })).reason, 'stripe_not_configured');
  assert.equal((await createHostedOrderPayment({ order: { ...order, contact_email: '' }, items, stripeKey: 'sk_x' })).reason, 'customer_email_required');
});
