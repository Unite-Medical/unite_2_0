import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSitemap } from '../scripts/sitemap.mjs';
import { googleVerification } from '../scripts/google-verification.mjs';
import { STATIC_ROUTES } from '../scripts/seo-routes.mjs';
import { REAL_PRODUCTS } from '../src/data/realCatalog.js';

test('sitemap contains canonical public routes and current catalog, no filters, placeholders or private routes', () => {
  const xml = buildSitemap();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  assert.equal(urls.length, new Set(urls).size);
  for (const path of ['/', ...Object.keys(STATIC_ROUTES), ...REAL_PRODUCTS.map(p => `/products/${encodeURIComponent(p.sku)}`)]) assert.ok(urls.includes(`https://unitemedical.net${path}`), path);
  for (const url of urls) {
    assert.equal(new URL(url).hostname, 'unitemedical.net');
    assert.equal(new URL(url).search, '');
    assert.doesNotMatch(url, /real-article-slug|\/admin|\/account|\/checkout|\/cart|\/q\//);
  }
  assert.doesNotMatch(xml, /<lastmod>/);
});

test('Search Console verification is optional, rendered in the HTML head, and rejects markup', () => {
  assert.deepEqual(googleVerification('').transformIndexHtml(), []);
  assert.deepEqual(googleVerification('valid_token-123').transformIndexHtml(), [{ tag: 'meta', attrs: { name: 'google-site-verification', content: 'valid_token-123' }, injectTo: 'head' }]);
  assert.throws(() => googleVerification('<meta name="google-site-verification">'));
});
