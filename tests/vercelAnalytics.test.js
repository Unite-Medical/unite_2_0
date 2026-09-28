import test from 'node:test';
import assert from 'node:assert/strict';
import { beforeVercelSend } from '../src/lib/analytics/vercel.js';

test('Vercel analytics removes queries and tokens from public pages', () => {
  for (const path of ['/catalog', '/welllink', '/case-studies/tjs']) {
    const event = beforeVercelSend({ type: 'pageview', url: `https://staging.unitemedical.net${path}?email=private#token` });
    assert.equal(event.url, `https://staging.unitemedical.net${path}`);
  }
});

test('Vercel analytics rejects private routes and malformed events', () => {
  for (const path of ['/login', '/reset-password', '/staff/welllink', '/admin', '/account/orders', '/q/secret', '/quotes/123']) {
    assert.equal(beforeVercelSend({ type: 'pageview', url: `https://staging.unitemedical.net${path}` }), null);
  }
  assert.equal(beforeVercelSend({ url: 'invalid' }), null);
});
