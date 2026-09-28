import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuickQuoteCatalog } from '../api/_lib/quickQuoteCatalog.js';
import { buildQuickQuotePlan, normalizeQuickQuoteRequest } from '../api/quotes/quick.js';
const legacy = [{ sku: 'OLD', price: 1 }];
const published = [{ sku: 'GLOVE-S', name: 'Gloves', variants: [{ sku: 'GLOVE-L' }] }, { sku: 'REQUEST', quote_only: true }];
const migrated = [{ id: 'current-small', sku: 'GLOVE-S', name: 'Gloves small', retail: 42, status: 'active' }, { id: 'current-large', sku: 'GLOVE-L', retail: 45, status: 'active' }];
test('quick quote reads migrated retail catalog after the legacy products table is retired', () => {
  const products = buildQuickQuoteCatalog([], migrated, published);
  const request = normalizeQuickQuoteRequest({ idempotency_key: 'migration-test-123456', company_name: 'Test', contact_name: 'Buyer', email: 'buyer@company.org', website: 'company.org', shipping_zip: '30303', lines: [{ sku: 'GLOVE-L', qty: 2 }] });
  const result = buildQuickQuotePlan({ request, products, tokenSecret: 'test-secret-with-at-least-24-characters' });
  assert.equal(result.ok, true);
  assert.equal(result.quote.total, 90);
  assert.equal(result.items[0].sku, 'GLOVE-L');
});
test('migrated catalog wins over legacy prices and excludes unpublished products', () => {
  const products = buildQuickQuoteCatalog(legacy, [...migrated, { sku: 'PRIVATE', status: 'active', retail: 9 }], published);
  assert.deepEqual(products.map(p => p.sku), ['GLOVE-S', 'GLOVE-L']);
  assert.equal(products[0].price, 42);
  assert.deepEqual(buildQuickQuoteCatalog(legacy, [], published), legacy);
});
test('inactive, unpriced and quote-only migrated items cannot become instant quotes', () => {
  for (const product of [{ sku: 'GLOVE-S', status: 'archived', retail: 10 }, { sku: 'GLOVE-S', status: 'active', retail: null }, { sku: 'REQUEST', status: 'active', retail: 10 }]) {
    const [result] = buildQuickQuoteCatalog(legacy, [product], published);
    assert.equal(result.quote_only, true);
    assert.equal(result.price, null);
  }
});
