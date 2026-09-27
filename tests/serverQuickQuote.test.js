import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQuickQuotePlan,
  normalizeQuickQuoteRequest,
  verifyQuickQuoteNetwork,
} from '../api/quotes/quick.js';

const request = {
  idempotency_key: 'quick-quote-12345678',
  company_name: 'Verified Surgical LLC',
  contact_name: 'Alex Buyer',
  email: 'alex@verified-surgical.org',
  website: 'https://verified-surgical.org',
  shipping_zip: '30303',
  lines: [{ sku: 'SKU-1', qty: 7 }],
};

const products = [{ id: 'SKU-1', sku: 'SKU-1', name: 'Sterile Device', price: 12, quote_only: false }];

test('quick quote request requires complete company identity, matching work domain, idempotency, and positive lines', () => {
  assert.equal(normalizeQuickQuoteRequest(request).ok, true);
  assert.equal(normalizeQuickQuoteRequest({ ...request, email: 'alex@gmail.com' }).reason, 'work_email_required');
  assert.equal(normalizeQuickQuoteRequest({ ...request, email: 'alex@other.org' }).reason, 'email_website_mismatch');
  assert.equal(normalizeQuickQuoteRequest({ ...request, shipping_zip: 'bad' }).reason, 'business_identity_required');
  assert.equal(normalizeQuickQuoteRequest({ ...request, idempotency_key: '' }).reason, 'idempotency_key_required');
  assert.equal(normalizeQuickQuoteRequest({ ...request, lines: [{ sku: 'SKU-1', qty: 0 }] }).reason, 'no_valid_lines');
  assert.equal(normalizeQuickQuoteRequest({ ...request, email: 'alex@127.0.0.1', website: 'http://127.0.0.1' }).reason, 'business_website_invalid');
  assert.equal(normalizeQuickQuoteRequest({ ...request, email: 'alex@company.local', website: 'http://company.local' }).reason, 'business_website_invalid');
});

test('network verification requires a resolvable work domain and reachable company site', async () => {
  const identity = normalizeQuickQuoteRequest(request).identity;
  assert.equal((await verifyQuickQuoteNetwork(identity, {
    resolveBusinessDomain: async () => true,
    resolveWebsiteAddresses: async () => ['203.0.113.10'],
    fetchWebsite: async () => ({ ok: true, status: 200 }),
  })).ok, true);
  assert.equal((await verifyQuickQuoteNetwork(identity, {
    resolveBusinessDomain: async () => false,
    resolveWebsiteAddresses: async () => ['203.0.113.10'],
    fetchWebsite: async () => ({ ok: true, status: 200 }),
  })).reason, 'business_domain_unverified');
  assert.equal((await verifyQuickQuoteNetwork(identity, {
    resolveBusinessDomain: async () => true,
    resolveWebsiteAddresses: async () => ['203.0.113.10'],
    fetchWebsite: async () => ({ ok: false, status: 503 }),
  })).reason, 'business_website_unreachable');
  assert.equal((await verifyQuickQuoteNetwork(identity, {
    resolveBusinessDomain: async () => true,
    resolveWebsiteAddresses: async () => ['127.0.0.1'],
    fetchWebsite: async () => ({ ok: true, status: 200 }),
  })).reason, 'business_website_invalid');
});

test('quick quote plan is idempotent, server-priced, provisional, and persists only token hash', () => {
  const normalized = normalizeQuickQuoteRequest(request);
  const first = buildQuickQuotePlan({
    request: normalized,
    products,
    tokenSecret: 'quote-link-secret-that-is-long-enough',
    now: new Date('2026-07-18T12:00:00.000Z'),
  });
  const replay = buildQuickQuotePlan({
    request: normalized,
    products,
    tokenSecret: 'quote-link-secret-that-is-long-enough',
    now: new Date('2026-07-18T12:01:00.000Z'),
  });

  assert.equal(first.ok, true);
  assert.equal(first.organization.approval_status, 'quote_verified');
  assert.equal(first.organization.status, 'active');
  assert.equal(first.quote.status, 'sent');
  assert.equal(first.quote.source, 'quick_quote');
  assert.equal(first.quote.acceptance_token, undefined);
  assert.match(first.quote.acceptance_token_hash, /^[a-f0-9]{64}$/);
  assert.ok(first.token.length > 50);
  assert.equal(first.items[0].target_qty, 7);
  assert.equal(first.items[0].sell_per_unit, 12);
  assert.equal(first.items[0].ext_sell, 84);
  assert.equal(first.quote.total, 84);
  assert.equal(replay.quote.id, first.quote.id);
  assert.equal(replay.token, first.token);
});
