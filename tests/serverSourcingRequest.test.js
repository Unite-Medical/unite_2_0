import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planSourcingRequest } from '../api/sourcing/request.js';

const now = new Date('2026-08-06T14:00:00.000Z');

test('public sourcing plan derives ownership and durable records server-side', () => {
  const plan = planSourcingRequest({
    input: {
      idempotency_key: 'public-source-request-0001',
      path: 'source',
      organization_name: 'Buyer Medical',
      contact_name: 'A Buyer',
      contact_email: 'buyer@buyermedical.test',
      product_description: '500 glucose meters',
      quantity_text: '500',
    },
    actor: null,
    now,
  });
  assert.equal(plan.ok, true);
  assert.match(plan.request.id, /^src_/);
  assert.equal(plan.request.source_channel, 'public_quote');
  assert.equal(plan.request.account_owner_email, 'support@unitemedical.net');
  assert.equal(plan.task.ref_id, plan.request.id);
  assert.equal(plan.audit.ref_id, plan.request.id);
  assert.equal(plan.outbox.ref_id, plan.request.id);
  assert.doesNotMatch(JSON.stringify(plan), /role|admin|cost|margin/i);
});

test('authenticated sourcing plan ignores browser organization and owner claims', () => {
  const actor = { user_id: 'profile_1', email: 'buyer@hospital.test', org_id: 'org_real' };
  const plan = planSourcingRequest({
    input: {
      idempotency_key: 'account-source-request-0001',
      organization_id: 'org_forged',
      account_owner_email: 'attacker@example.test',
      product_description: 'Nitrile gloves size L',
    },
    actor,
    organization: { id: 'org_real', name: 'Real Hospital', assigned_owner_email: 'rep@unitemedical.net' },
    now,
  });
  assert.equal(plan.request.organization_id, 'org_real');
  assert.equal(plan.request.organization_name, 'Real Hospital');
  assert.equal(plan.request.contact_email, 'buyer@hospital.test');
  assert.equal(plan.request.account_owner_email, 'rep@unitemedical.net');
  assert.equal(plan.request.source_channel, 'customer_account');
});

test('sourcing plan rejects missing intent, contact, or idempotency', () => {
  assert.equal(planSourcingRequest({ input: {}, now }).reason, 'idempotency_key_required');
  assert.equal(planSourcingRequest({ input: { idempotency_key: 'long-enough-key' }, now }).reason, 'product_description_required');
  assert.equal(planSourcingRequest({ input: { idempotency_key: 'long-enough-key', product_description: 'Item' }, now }).reason, 'contact_email_required');
});
