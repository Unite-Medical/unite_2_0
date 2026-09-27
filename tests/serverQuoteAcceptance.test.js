import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSignerChallenge,
  verifySignerChallenge,
  buildAcceptanceEvidence,
  sanitizePublicQuoteAcceptance,
  hashQuoteAcceptanceToken,
  normalizeAcceptedQuoteItems,
  planQuoteResponse,
  quoteAcceptanceEligibility,
} from '../api/quotes/acceptance.js';
import { createQuoteAcceptanceToken, parseQuoteAcceptanceToken } from '../src/lib/quoteTokens.js';

const secret = 'server-side-otp-secret-long-enough';
const now = new Date('2026-07-18T16:00:00.000Z');

function quote(overrides = {}) {
  return {
    id: 'quote_server_accept', acceptance_token: 'public-token', revision: 3,
    customer_id: 'org_buyer', status: 'sent', total: 125,
    shipping_cost: 15, payment_terms: 'prepaid', terms_version: '2026-07-18',
    ...overrides,
  };
}

test('server-generated signer challenge stores only a revision-bound OTP hash', () => {
  const challenge = createSignerChallenge({
    quote: quote(), email: 'Signer@Buyer.test', ip: '198.51.100.9', now, secret,
  });

  assert.match(challenge.code, /^\d{6}$/);
  assert.equal(challenge.record.email, 'signer@buyer.test');
  assert.equal(challenge.record.quote_revision, 3);
  assert.equal(challenge.record.code, undefined);
  assert.ok(challenge.record.code_hash);
  assert.equal(challenge.record.verified_at, null);
  assert.equal(challenge.record.consumed_at, null);
});

test('signer challenge fails on wrong code, expiry, revision drift, or reuse', () => {
  const challenge = createSignerChallenge({ quote: quote(), email: 'signer@buyer.test', ip: '198.51.100.9', now, secret });
  const base = { challenge: challenge.record, code: challenge.code, quote: quote(), email: 'signer@buyer.test', secret };

  assert.equal(verifySignerChallenge({ ...base, code: '000000', now }).reason, 'invalid_code');
  assert.equal(verifySignerChallenge({ ...base, now: new Date('2026-07-18T16:11:00.000Z') }).reason, 'challenge_expired');
  assert.equal(verifySignerChallenge({ ...base, quote: quote({ revision: 4 }), now }).reason, 'quote_revision_changed');
  assert.equal(verifySignerChallenge({ ...base, challenge: { ...challenge.record, consumed_at: now.toISOString() }, now }).reason, 'challenge_consumed');
  assert.equal(verifySignerChallenge({ ...base, now }).ok, true);
});

test('public quote acceptance projection excludes all internal economics and vendor data', () => {
  const view = sanitizePublicQuoteAcceptance({
    quote: quote({ customer_name: 'Buyer', contact_email: 'signer@buyer.test', total_landed: 70, margin: 0.44, vendor_offer_id: 'secret-offer' }),
    items: [{
      id: 'item_1', sku: 'SKU-1', name: 'Device', target_qty: 2,
      sell_per_unit: 55, ext_sell: 110, landed_per_unit: 30, vendor_name: 'Secret Vendor', tooling_setup_cost_usd: 500,
    }],
  });
  assert.equal(view.quote.total, 125);
  assert.equal(view.items[0].unit_price, 55);
  assert.doesNotMatch(JSON.stringify(view), /landed|margin|vendor|tooling|secret-offer/i);
});

test('verified Quick Quote projection is viewable but requires account completion before acceptance', () => {
  const view = sanitizePublicQuoteAcceptance({
    quote: quote({ source: 'quick_quote' }),
    organization: { id: 'org_buyer', status: 'active', approval_status: 'quote_verified' },
    items: [{ id: 'item_1', sku: 'SKU-1', target_qty: 2, sell_per_unit: 55, ext_sell: 110 }],
  });
  assert.equal(view.quote.acceptance_available, false);
  assert.equal(view.quote.account_completion_required, true);
});

test('acceptance evidence hashes lines, totals, revision, terms, signer, PO, IP, and user agent', () => {
  const input = {
    quote: quote(),
    items: [{ sku: 'SKU-1', name: 'Device', qty: 2, unit_price: 55, ext_price: 110 }],
    signer: { name: 'Authorized Buyer', title: 'COO', email: 'signer@buyer.test' },
    po_number: 'BUYER-PO-77', binding_acknowledged: true,
    ip: '198.51.100.9', user_agent: 'Browser/1.0', accepted_at: now,
  };
  const evidence = buildAcceptanceEvidence(input);
  assert.equal(evidence.quote_revision, 3);
  assert.equal(evidence.terms_version, '2026-07-18');
  assert.match(evidence.document_hash, /^[a-f0-9]{64}$/);
  assert.equal(evidence.canonical_document.customer_po, 'BUYER-PO-77');
  assert.equal(evidence.canonical_document.total, 125);

  const changed = buildAcceptanceEvidence({ ...input, quote: quote({ total: 126 }) });
  assert.notEqual(changed.document_hash, evidence.document_hash);
});

test('quote bearer token is 256-bit, revision-bound, and server hash compatible', async () => {
  const created = await createQuoteAcceptanceToken('quote_server_accept', 3);
  const parsed = parseQuoteAcceptanceToken(created.token);
  assert.deepEqual({ quote_id: parsed.quote_id, revision: parsed.revision }, { quote_id: 'quote_server_accept', revision: 3 });
  assert.ok(parsed.secret.length >= 40);
  assert.equal(hashQuoteAcceptanceToken(created.token, 'quote_server_accept', 3), created.token_hash);
  assert.notEqual(hashQuoteAcceptanceToken(created.token, 'quote_server_accept', 4), created.token_hash);
});

test('real quote engine line fields normalize exactly into evidence and order rows', () => {
  const normalized = normalizeAcceptedQuoteItems([{ id: 'line-real', sku: 'REAL-SKU', name: 'Real line', target_qty: 7, sell_per_unit: 12.5, ext_sell: 87.5 }]);
  assert.deepEqual(normalized, [{
    id: 'line-real', sku: 'REAL-SKU', name: 'Real line', qty: 7,
    unit_price: 12.5, ext_price: 87.5, source_quote_item_id: 'line-real',
  }]);
});

test('acceptance requires sent, unexpired quote and an approved current organization', () => {
  const organization = { id: 'org_buyer', approval_status: 'approved', status: 'active' };
  assert.equal(quoteAcceptanceEligibility({ quote: quote({ valid_until: '2026-07-19T00:00:00.000Z' }), organization, now }).ok, true);
  assert.equal(quoteAcceptanceEligibility({ quote: quote({ status: 'draft' }), organization, now }).reason, 'quote_not_sent');
  assert.equal(quoteAcceptanceEligibility({ quote: quote({ valid_until: '2026-07-18T15:00:00.000Z' }), organization, now }).reason, 'quote_expired');
  assert.equal(quoteAcceptanceEligibility({ quote: quote(), organization: { ...organization, approval_status: 'manual_review' }, now }).reason, 'account_not_approved');
});

test('token-authorized quote responses plan counter, decline, and expired refresh without client authority', () => {
  const items = [{ id: 'line_1', quote_id: 'quote_server_accept', sell_per_unit: 50 }];
  const counter = planQuoteResponse({
    quote: quote({ valid_until: '2026-07-19T00:00:00.000Z' }), items,
    action: 'counter', input: { counters: [{ item_id: 'line_1', price: 45 }], note: 'Volume target' }, now,
  });
  assert.equal(counter.ok, true);
  assert.equal(counter.quote.status, 'countered');
  assert.equal(counter.items[0].counter_price, 45);
  assert.equal(counter.task.kind, 'quote_counter');

  const decline = planQuoteResponse({ quote: quote(), items, action: 'decline', input: { reason: 'Timeline too long' }, now });
  assert.equal(decline.quote.status, 'declined');
  assert.equal(decline.quote.decline_reason, 'Timeline too long');

  const refresh = planQuoteResponse({
    quote: quote({ valid_until: '2026-07-18T15:00:00.000Z' }), items,
    action: 'refresh', input: {}, now,
  });
  assert.equal(refresh.ok, true);
  assert.equal(refresh.quote.refresh_requested_at, now.toISOString());
  assert.equal(planQuoteResponse({ quote: refresh.quote, items, action: 'refresh', input: {}, now }).idempotent, true);
  assert.equal(planQuoteResponse({ quote: quote({ status: 'accepted' }), items, action: 'decline', input: {}, now }).reason, 'quote_already_accepted');
  assert.equal(planQuoteResponse({ quote: quote(), items, action: 'counter', input: { counters: [{ item_id: 'other', price: 1 }] }, now }).reason, 'no_valid_counters');
});
