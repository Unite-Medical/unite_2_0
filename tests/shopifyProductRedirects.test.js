import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PUBLIC_CATALOG } from '../src/data/publicCatalog.generated.js';

// Vercel parses ( ) * etc. in destinations as path-to-regexp syntax, so they must be percent-encoded.
const encodeSku = sku => encodeURIComponent(sku).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

test('every legacy Shopify product handle permanently redirects to its SKU product page', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const bySource = new Map(config.redirects.map(rule => [rule.source, rule]));
  for (const product of PUBLIC_CATALOG.products) {
    if (!product.handle || product.handle === product.sku) continue;
    const rule = bySource.get(`/products/${encodeURI(product.handle)}`);
    assert.equal(rule?.destination, `/products/${encodeSku(product.sku)}`, product.handle);
    assert.equal(rule.permanent, true, product.handle);
  }
  assert(!config.redirects.some(rule => /[^\u0020-\u007e]/.test(rule.source)), 'redirect sources must be percent-encoded as browsers send them');
  const skus = new Set(PUBLIC_CATALOG.products.map(product => `/products/${encodeSku(product.sku)}`));
  assert(!config.redirects.some(rule => skus.has(rule.source)), 'a redirect must never shadow a SKU page');
});
