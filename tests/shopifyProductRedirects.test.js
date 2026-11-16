import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PUBLIC_CATALOG } from '../src/data/publicCatalog.generated.js';

test('every legacy Shopify product handle permanently redirects to its SKU product page', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const bySource = new Map(config.redirects.map(rule => [rule.source, rule]));
  for (const product of PUBLIC_CATALOG.products) {
    if (!product.handle || product.handle === product.sku) continue;
    const rule = bySource.get(`/products/${product.handle}`);
    assert.equal(rule?.destination, `/products/${encodeURIComponent(product.sku)}`, product.handle);
    assert.equal(rule.permanent, true, product.handle);
  }
  const skus = new Set(PUBLIC_CATALOG.products.map(product => `/products/${encodeURIComponent(product.sku)}`));
  assert(!config.redirects.some(rule => skus.has(rule.source)), 'a redirect must never shadow a SKU page');
});
