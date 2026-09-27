import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAnalytics, createGoogleTransport } from '../src/lib/analytics/ga4-core.js';

const config = { measurementId: 'G-UNITETEST', enabled: 'true', production: true };
const location = { hostname: 'unitemedical.net', origin: 'https://unitemedical.net', pathname: '/catalog', search: '' };
function fixture(overrides = {}, initial = location) {
  let current = { ...initial };
  const init = [], events = [], disabled = [];
  const analytics = createGoogleAnalytics({ initialize: (...args) => init.push(args), event: (...args) => events.push(args), disable: value => disabled.push(value) }, { ...config, ...overrides }, () => current, () => 'https://example.com/page?email=private#secret');
  return { analytics, init, events, disabled, navigate(path, search = '') { current = { ...current, pathname: path, search }; } };
}

test('Google tracking is off without a real ID, explicit enablement, production and an approved Unite host', () => {
  for (const overrides of [{ measurementId: '' }, { measurementId: 'GTM-123' }, { enabled: 'false' }, { production: false }]) {
    const f = fixture(overrides); f.analytics.page(); assert.equal(f.init.length, 0);
  }
  for (const hostname of ['tjs.unitemedical.net', 'localhost', 'staging.unitemedical.net', 'unite-preview.vercel.app']) {
    const f = fixture({}, { ...location, hostname }); f.analytics.page(); assert.equal(f.init.length, 0);
  }
});

test('SPA pageviews deduplicate, strip queries, suspend private pages and resume public navigation', () => {
  const f = fixture();
  f.analytics.page(); f.analytics.page();
  f.navigate('/catalog', '?email=private'); f.analytics.page();
  assert.equal(f.events.length, 1);
  f.navigate('/checkout'); f.analytics.page(); f.analytics.page();
  assert.deepEqual(f.events.map(e => e[0]), ['page_view', 'page_view', 'begin_checkout']);
  assert.equal(f.events[1][1].page_referrer, 'https://unitemedical.net/catalog');
  for (const path of ['/account/orders', '/admin', '/q/private-token', '/orders/123/confirmed']) {
    f.navigate(path); f.analytics.page(); f.analytics.capture('contact_submitted');
    assert.equal(f.disabled.at(-1), true);
  }
  assert.equal(f.events.length, 3);
  f.navigate('/checkout'); f.analytics.page();
  assert.equal(f.events.length, 5);
  assert.equal(f.init.length, 1);
  assert.equal(f.init[0][1].send_page_view, false);
  assert.equal(f.init[0][1].allow_google_signals, false);
  assert.equal(f.init[0][1].cookie_domain, 'unitemedical.net');
  assert.equal(f.init[0][1].cookie_prefix, 'unite_medical');
  assert.equal(JSON.stringify([f.init, f.events]).includes('private'), false);
});

test('a hard navigation from a private quote URL does not send its token as referrer', () => {
  const events = [];
  const analytics = createGoogleAnalytics({ disable() {}, initialize() {}, event: (...args) => events.push(args) }, config, () => location, () => 'https://unitemedical.net/q/private-token');
  analytics.page();
  assert.equal(events[0][1].page_referrer, '');
});

test('commerce converts cents to dollars and successful forms emit lead types without customer data', () => {
  const f = fixture();
  f.analytics.capture('add_to_cart', { product_id: 'SKU-123', quantity: 2, value_cents: 3998, email: 'private', notes: 'private' });
  assert.deepEqual(f.events[0][1].items, [{ item_id: 'SKU-123', quantity: 2, price: 19.99 }]);
  assert.equal(f.events[0][1].value, 39.98);
  assert.equal(f.events[0][1].currency, 'USD');
  f.analytics.capture('contact_submitted', { email: 'private' });
  f.analytics.capture('quote_requested');
  assert.deepEqual(f.events.slice(1).map(([event, props]) => [event, props.form_type]), [['generate_lead', 'contact'], ['generate_lead', 'quote']]);
  f.analytics.capture('purchase'); f.analytics.capture('unknown');
  assert.equal(f.events.length, 3);
  assert.equal(JSON.stringify(f.events).includes('private'), false);
});

test('initialization failures are isolated and a later pageview can retry', () => {
  let attempts = 0;
  const events = [];
  const analytics = createGoogleAnalytics({ disable() {}, initialize() { if (++attempts === 1) throw new Error('blocked'); }, event: event => events.push(event) }, config, () => location);
  assert.doesNotThrow(() => analytics.page());
  analytics.page();
  assert.deepEqual(events, ['page_view']);
});

test('browser transport loads one Google tag and private navigation disables the destination', () => {
  const scripts = [];
  const browser = { document: { createElement: () => ({}), head: { appendChild: script => scripts.push(script) } } };
  let current = { ...location };
  const analytics = createGoogleAnalytics(createGoogleTransport(browser, config.measurementId), config, () => current);
  analytics.page(); analytics.page(); analytics.capture('product_view', { product_id: 123 });
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-UNITETEST');
  assert.equal(scripts[0].async, true);
  assert.equal(browser.dataLayer.filter(args => args[0] === 'config').length, 1);
  current = { ...current, pathname: '/admin' }; analytics.page();
  assert.equal(browser['ga-disable-G-UNITETEST'], true);
});
