import test from 'node:test';
import assert from 'node:assert/strict';
import { commercePaymentStatus, commercePaymentEvidence } from '../src/lib/commercePaymentStatus.js';
import { summarize } from '../api/_lib/commerceWorkspace.js';

test('Shopify history never presents a workflow override as settlement evidence', () => {
  for (const financial_status of ['paid', 'partially_paid', 'refunded', 'unpaid', null]) {
    const order = { historical: true, financial_status, total_outstanding: 0, fulfillment_status: 'fulfilled' };
    const before = structuredClone(order);
    assert.equal(commercePaymentStatus(order), 'payment_review_needed');
    assert.deepEqual(order, before);
  }
});

test('new operational payment states remain separate from historical source evidence', () => {
  assert.equal(commercePaymentStatus({ historical: false, financial_status: 'unpaid' }), 'unpaid');
  assert.equal(commercePaymentStatus({ historical: false, financial_status: 'paid' }), 'paid');
  assert.equal(commercePaymentStatus({ historical: false, financial_status: 'partially_paid' }), 'partially_paid');
  assert.equal(commercePaymentStatus({}), 'payment_review_needed');
});

test('API presentation, exports and tables share the same status without mutating stored import evidence', () => {
  const stored = { id: 'historic', historical: true, financial_status: 'paid', total_outstanding: 0, fulfillment_status: 'fulfilled', lines: [], source: { financial_status: 'paid' } };
  const before = structuredClone(stored);
  const presented = commercePaymentEvidence(stored);
  assert.equal(presented.financial_status, 'payment_review_needed');
  assert.equal(presented.total_outstanding, null);
  assert.equal(presented.source_financial_status, 'paid');
  assert.equal(presented.source_total_outstanding, 0);
  assert.equal(presented.fulfillment_status, 'fulfilled');
  assert.equal(summarize('orders', stored).financial_status, presented.financial_status);
  assert.equal(summarize('orders', stored).total_outstanding, null);
  assert.deepEqual(stored, before);
  assert.deepEqual(commercePaymentEvidence(presented), presented);
  const live = { historical: false, financial_status: 'unpaid', total_outstanding: 75 };
  assert.equal(commercePaymentEvidence(live), live);
});

test('verified linked QBO invoice establishes current balances consistently; malformed evidence stays unverified', () => {
  const order={id:'history',historical:true,total:120,currency:'USD',financial_status:'paid',payment_reconciliation_status:'matched_quickbooks',accounting_reconciliation:{source:'quickbooks_online',status:'verified',invoice_id:'123',customer_id:'C1',total:120,balance:120,currency:'USD',source_sha256:'a'.repeat(64),realm_fingerprint:'realm',retrieved_at:'2026-10-22T22:00:00Z'}};
  assert.equal(commercePaymentStatus(order),'unpaid');assert.equal(commercePaymentEvidence(order).total_outstanding,120);
  for(const [balance,status] of [[0,'paid'],[40,'partially_paid']])assert.equal(commercePaymentStatus({...order,accounting_reconciliation:{...order.accounting_reconciliation,balance}}),status);
  for(const bad of [{total:121},{currency:'CAD'},{balance:-1},{source_sha256:''},{invoice_id:''}])assert.equal(commercePaymentStatus({...order,accounting_reconciliation:{...order.accounting_reconciliation,...bad}}),'payment_review_needed');
});
