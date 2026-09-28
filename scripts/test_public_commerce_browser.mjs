// Browser regression harness. Runs against a production preview, with isolated API
// responses using the real quote normalizer, pricing planner and public projection.
// No database writes, emails, quote acceptance or orders are performed.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/test_public_commerce_browser.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { normalizeQuickQuoteRequest, buildQuickQuotePlan } from '../api/quotes/quick.js';
import { sanitizePublicQuoteAcceptance } from '../api/quotes/acceptance.js';
import { REAL_PRODUCTS } from '../src/data/realCatalog.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.COMMERCE_PREVIEW_URL || 'http://127.0.0.1:4187';
const output = fileURLToPath(new URL('../artifacts/public-commerce-review/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let lastPlan, failQuote = false, quoteCalls = [], sourcingCalls = 0;
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (path === '/api/quotes/quick') {
    const body = route.request().postDataJSON(); quoteCalls.push(body);
    if (failQuote) return reply({ error: 'quick_quote_failed' }, 503);
    const normalized = normalizeQuickQuoteRequest(body);
    if (!normalized.ok) return reply({ error: normalized.reason }, 400);
    lastPlan = buildQuickQuotePlan({ request: normalized, products: REAL_PRODUCTS, tokenSecret: 'browser-test-only-secret-not-for-deployment' });
    assert.equal(lastPlan.ok, true);
    return reply({ ok: true, token: lastPlan.token }, 201);
  }
  if (path === '/api/quotes/acceptance') return reply(sanitizePublicQuoteAcceptance(lastPlan));
  if (path === '/api/sourcing/request') { sourcingCalls++; return reply({ ok: true, request: { id: 'synthetic_sourcing_review' } }); }
  return reply({ ok: true, rows: [], session: null });
});
try {
  await page.goto(`${base}/catalog`);
  await page.locator('.uc-product').first().waitFor();
  const count = await page.locator('.uc-product').count(); assert(count > 40);
  await page.getByRole('button', { name: 'Syringes', exact: true }).click();
  assert((await page.locator('.uc-product').count()) < count);
  await page.getByRole('textbox', { name: 'Search products', exact: true }).fill('impossible-no-match-928371');
  await page.getByRole('heading', { name: 'No products found.' }).waitFor();
  await page.getByRole('button', { name: 'Clear all filters' }).click();
  assert.equal(await page.locator('.uc-product').count(), count);
  await page.screenshot({ path: `${output}/catalog-desktop.png` });
  await page.locator('.uc-product-action').filter({ hasText: 'Add to quote' }).first().click();
  await page.locator('.uq-lines li').waitFor();
  assert.equal(await page.locator('.uq-lines li').count(), 1);
  await page.getByRole('button', { name: /^Remove / }).click();
  assert.equal(await page.locator('.uq-lines li').count(), 0);
  assert.equal(await page.locator('.uq-product').count(), count);
  const product = page.locator('.uq-product').filter({ has: page.getByRole('spinbutton') }).first();
  const quantity = product.getByRole('spinbutton');
  await quantity.fill('3');
  await page.getByRole('combobox', { name: 'Product category' }).selectOption('Diagnostic Tests');
  assert.equal(await page.locator('.uq-lines li').count(), 1);
  await page.getByRole('combobox', { name: 'Product category' }).selectOption('');
  assert.equal(await quantity.inputValue(), '3');
  await page.getByRole('textbox', { name: 'Company name', exact: true }).fill('Synthetic browser QA');
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('QA Buyer');
  await page.getByRole('textbox', { name: 'Work email', exact: true }).fill('qa@gmail.com');
  await page.getByRole('textbox', { name: 'Company website', exact: true }).fill('gmail.com');
  await page.getByRole('textbox', { name: 'Shipping ZIP', exact: true }).fill('30303');
  const submit = page.getByRole('button', { name: 'Verify & generate quote' });
  await submit.click(); await page.getByRole('alert').filter({ hasText: 'company work email' }).waitFor();
  await page.getByRole('textbox', { name: 'Work email', exact: true }).fill('qa@unitemedical.net');
  await submit.click(); await page.getByRole('alert').filter({ hasText: 'must match' }).waitFor();
  await page.getByRole('textbox', { name: 'Company website', exact: true }).fill('unitemedical.net');
  failQuote = true;
  await submit.click(); await page.getByRole('alert').waitFor();
  assert.equal(await quantity.inputValue(), '3');
  const retryKey = quoteCalls.at(-1).idempotency_key;
  await page.screenshot({ path: `${output}/quote-desktop.png`, fullPage: true });
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `quote overflow at ${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.uq-summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/quote-mobile-form.png` });
  failQuote = false;
  await submit.click(); await page.waitForURL('**/q/**');
  assert.equal(quoteCalls.at(-1).idempotency_key, retryKey);
  await page.getByText('Finish account setup →', { exact: true }).waitFor();
  assert.equal(lastPlan.items[0].target_qty, 3);
  assert(lastPlan.quote.total > 0);
  await page.screenshot({ path: `${output}/quote-review-mobile.png`, fullPage: true });
  await page.goto(`${base}/portal/quote`);
  await page.locator('#sourcing-description').fill('Synthetic sourcing test, do not fulfill.');
  await page.getByRole('button', { name: 'Request sourcing', exact: false }).click();
  await page.getByRole('alert').filter({ hasText: 'Business details' }).waitFor();
  assert.equal(sourcingCalls, 0);
  await page.getByRole('textbox', { name: 'Company name', exact: true }).fill('Synthetic browser QA');
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('QA Buyer');
  await page.getByRole('textbox', { name: 'Work email', exact: true }).fill('qa@unitemedical.net');
  await page.getByRole('button', { name: 'Request sourcing', exact: false }).click();
  await page.getByRole('status').filter({ hasText: 'Request received' }).waitFor();
  assert.equal(sourcingCalls, 1);
  for (const width of [360, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/catalog`); await page.locator('.uc-product').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `catalog overflow at ${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/catalog-mobile.png` });
  // Public variant selection must survive the product → quote transition.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/products/VA1S50S`);
  await page.getByRole('button', { name: 'Medium', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Order quantity' }).fill('4');
  await page.screenshot({ path: `${output}/product-desktop.png` });
  await page.getByRole('link', { name: 'Request pricing', exact: false }).click();
  await page.locator('.uq-lines').getByText(/VA1M50S · Qty 4/).waitFor();
  await page.getByRole('textbox', { name: 'Search quote products' }).fill('VA1M50S');
  assert.equal(await page.locator('.uq-product').count(), 1);
  const variantSelect = page.getByRole('combobox', { name: 'Option for The Vero Ankle® Brace' });
  assert.equal(await variantSelect.inputValue(), 'VA1M50S');
  assert.equal(await page.getByRole('spinbutton').inputValue(), '4');
  await variantSelect.selectOption('VA1L50S');
  await page.getByRole('spinbutton').fill('2');
  assert.equal(await page.locator('.uq-lines li').count(), 2);
  await page.screenshot({ path: `${output}/quote-options-desktop.png`, fullPage: true });
  // SKU punctuation must not split the product route.
  await page.goto(`${base}/products/${encodeURIComponent('Binax-COV/FLU')}`);
  await page.getByRole('heading', { name: /BinaxNOW/, level: 1 }).waitFor();
  for (const width of [360, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/products/VA1S50S`);
    await page.locator('.up-product-copy').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `product overflow at ${width}`);
    await page.goto(`${base}/quote?path=source&sku=VA1M50S`);
    await page.locator('.us-request-form').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `sourcing overflow at ${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${output}/sourcing-desktop.png`, fullPage: true });
  assert.equal(await page.getByRole('textbox', { name: 'Product, brand, or SKU' }).inputValue(), 'VA1M50S');
  await page.getByRole('textbox', { name: 'Quantity needed' }).fill('4 units');
  await page.getByRole('textbox', { name: 'Organization', exact: true }).fill('Synthetic browser QA');
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('QA Buyer');
  await page.getByRole('textbox', { name: 'Work email', exact: true }).fill('qa@unitemedical.net');
  await page.getByRole('button', { name: 'Request a quote', exact: false }).click();
  await page.getByRole('heading', { name: 'You’re in good hands.' }).waitFor();
  assert.equal(sourcingCalls, 2);
  assert.deepEqual(errors, []);
  console.log(`PASS: ${count} products; filters; catalog-to-quote; quantities; removal; validation; retry; server-priced review; account gate; variants; SKU punctuation; sourcing forms; 360–1440px layouts. API persistence and external services are isolated.`);
} finally { await browser.close(); }
