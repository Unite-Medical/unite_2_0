import test from 'node:test';
import assert from 'node:assert/strict';
import { createUniteAnalytics, isPublicPath, enabledFor, cleanProperties } from '../src/lib/analytics/posthog-core.js';

const config = { token: 'phc_unite_test', enabled: 'true', production: true };
const location = { hostname: 'unite-2-0.vercel.app', origin: 'https://unite-2-0.vercel.app', pathname: '/catalog', search: '' };

test('Unite analytics rejects TJS, previews, staging, localhost and disabled environments', () => {
  assert.equal(enabledFor(config, location), true);
  for (const hostname of ['tjs.unitemedical.net', 'staging.unitemedical.net', 'localhost', '127.0.0.1', 'unite-2-0-git-preview.vercel.app']) assert.equal(enabledFor(config, { ...location, hostname }), false);
  assert.equal(enabledFor({ ...config, production: false }, location), false);
  assert.equal(enabledFor({ ...config, enabled: 'false' }, location), false);
  assert.equal(enabledFor({ ...config, token: undefined }, location), false);
});

test('private account, admin, order and quote-token routes are excluded', () => {
  for (const path of ['/admin', '/admin/customers', '/account/orders', '/orders/123/confirmed', '/q/private-token', '/quotes/123/print', '/login', '/register', '/rep-portal', '/distributor-portal']) assert.equal(isPublicPath(path), false, path);
  for (const path of ['/', '/catalog', '/products/P123', '/contact', '/quote', '/checkout', '/case-studies/tjs']) assert.equal(isPublicPath(path), true, path);
});

test('URL queries, named profiles and customer fields are excluded', () => {
  const result = cleanProperties({ $current_url: 'https://unitemedical.net/?email=private', $referrer: 'https://example.com/path?private', $set: { email: 'private' }, $set_once: { name: 'private' }, $initial_person_info: { private: true }, email: 'private', customer_name: 'private', site_id: 'tjs', $browser_name: 'Chrome' }, location);
  assert.equal(result.$current_url, location.origin + location.pathname);
  assert.equal(result.$referrer, 'https://example.com/path');
  assert.equal(result.site_id, 'unite_medical');
  assert.equal(result.$process_person_profile, false);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

function fixture() {
  const init = [], events = [];
  let current = { ...location };
  const analytics = createUniteAnalytics({ init: (...args) => init.push(args), capture: (...args) => events.push(args) }, config, () => current);
  return { analytics, init, events, navigate: path => { current = { ...current, pathname: path }; } };
}

test('navigation deduplicates Strict Mode, captures checkout once and excludes admin', () => {
  const f = fixture();
  f.analytics.page(); f.analytics.page();
  assert.equal(f.events.length, 1);
  f.navigate('/checkout'); f.analytics.page(); f.analytics.page();
  assert.deepEqual(f.events.map(e => e[0]), ['$pageview', '$pageview', 'begin_checkout']);
  f.navigate('/admin'); f.analytics.page();
  assert.equal(f.events.length, 3);
  assert.equal(f.init.length, 1);
  assert.equal(f.init[0][1].disable_session_recording, true);
  assert.equal(f.init[0][1].cross_subdomain_cookie, false);
  assert.equal(f.init[0][1].before_send({ properties: {} }), null);
});

test('first commerce event initializes tracking and only allowlisted metadata survives', () => {
  const f = fixture();
  f.analytics.capture('add_to_cart', { product_id: 'P123', quantity: 2, email: 'private', site_id: 'tjs', notes: 'private' });
  assert.equal(f.init.length, 1);
  assert.deepEqual(f.events[0], ['add_to_cart', { site_id: 'unite_medical', brand: 'Unite Medical', product_id: 'P123', quantity: 2 }]);
  f.analytics.capture('purchase');
  assert.equal(f.events.length, 1);
});

test('an SDK error does not interrupt a form or cart action', () => {
  const analytics = createUniteAnalytics({ init() { throw new Error('offline'); } }, config, () => location);
  assert.doesNotThrow(() => analytics.capture('contact_submitted'));
});
