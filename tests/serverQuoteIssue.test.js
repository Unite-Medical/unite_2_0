import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildQuoteIssuePlan } from '../api/quotes/issue.js';

const base = {
  id: 'Q-ISSUE-1', status: 'draft', revision: 3,
  customer_id: 'org_1', customer_name: 'Buyer Org', contact_email: 'buyer@example.org',
  total: 125, needs_approval: false, duty_confirmed: true,
};

test('issuing a quote rotates revision and stores only a revision-bound token hash', () => {
  const result = buildQuoteIssuePlan({
    quote: base,
    tokenSecret: 'quote-link-secret-that-is-long-enough',
    now: new Date('2026-07-18T12:00:00.000Z'),
  });
  assert.equal(result.ok, true);
  assert.equal(result.quote.status, 'sent');
  assert.equal(result.quote.revision, 4);
  assert.equal(result.quote.acceptance_token_revision, 4);
  assert.match(result.quote.acceptance_token_hash, /^[a-f0-9]{64}$/);
  assert.equal(result.quote.acceptance_token, undefined);
  assert.ok(result.token.length > 50);
  assert.equal(result.quote.issued_to, 'buyer@example.org');
});

test('quote issue blocks unsafe states, unresolved approval, classification, and missing recipient', () => {
  const args = { tokenSecret: 'quote-link-secret-that-is-long-enough' };
  assert.equal(buildQuoteIssuePlan({ quote: { ...base, status: 'accepted' }, ...args }).reason, 'quote_locked');
  assert.equal(buildQuoteIssuePlan({ quote: { ...base, needs_approval: true }, ...args }).reason, 'manager_approval_required');
  assert.equal(buildQuoteIssuePlan({ quote: { ...base, duty_confirmed: false }, ...args }).reason, 'duty_confirmation_required');
  assert.equal(buildQuoteIssuePlan({ quote: { ...base, contact_email: '' }, ...args }).reason, 'recipient_email_required');
});
