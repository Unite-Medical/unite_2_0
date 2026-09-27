import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDamonCatalogDecision, applyDamonDecisionsToCatalog, summarizeDamonCatalogDecisions } from '../src/lib/catalogLaunchPolicy.js';
import launchCatalog from '../src/data/shopifyLaunchCatalog.generated.json' with { type: 'json' };

test('Damon catalog policy archives test-product and prevents ordering', () => {
  const product = { handle: 'test-product', sku: 'test-product', available: true, published: true };
  const result = applyDamonCatalogDecision(product, { decision: 'Archive', visibility: 'Do Not Publish' });
  assert.equal(result.status, 'archived');
  assert.equal(result.available, false);
  assert.equal(result.published, false);
});

test('Damon catalog policy applies confirmed SynGuard case weight', () => {
  const product = { handle: 'synguard', sku: 'NGPF7000', variants: [{ sku: 'NGPF7000' }] };
  const result = applyDamonCatalogDecision(product, { decision: 'Launch', shipping_weight_lb_by_sku: { NGPF7000: 8 } });
  assert.equal(result.variants[0].shipping_weight_lb, 8);
});

test('Damon decision summary rejects incomplete product decision sets', () => {
  assert.throws(() => summarizeDamonCatalogDecisions([{ decision: 'Launch' }], 175), /expected 175/);
});

test('Damon catalog projection requires every product to have a decision', () => {
  const products = [{ handle: 'one', variants: [] }, { handle: 'two', variants: [] }];
  const rules = [{ handle: 'one', decision: 'Launch', visibility: 'Public Storefront' }];
  assert.throws(() => applyDamonDecisionsToCatalog(products, rules), /missing Damon decision.*two/);
});

test('Damon catalog projection can preserve Unite-native products outside Shopify', () => {
  const products = [{ handle: 'regenicool-pro', source: 'unite_native', available: true }];
  assert.deepEqual(applyDamonDecisionsToCatalog(products, [], { allowUnmanaged: true }), products);
});

test('generated launch catalog contains every Shopify product and confirmed SynGuard weight', () => {
  assert.equal(launchCatalog.products.length, 175);
  assert.equal(launchCatalog.products.filter((product) => product.launch_decision === 'Launch').length, 140);
  const synguard = launchCatalog.products.find((product) => product.variants.some((variant) => variant.sku === 'NGPF7000'));
  assert.equal(synguard.variants.find((variant) => variant.sku === 'NGPF7000').shipping_weight_lb, 8);
});
