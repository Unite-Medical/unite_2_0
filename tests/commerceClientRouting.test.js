import test from 'node:test';
import assert from 'node:assert/strict';
import { commerceRequest } from '../src/lib/commerceClient.js';

test('action-based reads use the commerce workspace; record reads use the scoped order workspace', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => { calls.push([url, init.method || 'GET']); return { ok: true, json: async () => ({}) }; };
  try {
    await commerceRequest({ action: 'search', q: 'AM150', category: 'all' });
    await commerceRequest({ action: 'resolve_price', customer_id: 'c1', product_id: 'p1' });
    await commerceRequest({ kind: 'orders', q: '' });
    await commerceRequest({}, { action: 'save', kind: 'orders', id: 'o1' });
  } finally {
    globalThis.fetch = original;
  }
  assert.match(calls[0][0], /^\/api\/admin\/commerce-workspace\?action=search&/);
  assert.match(calls[1][0], /^\/api\/admin\/commerce-workspace\?action=resolve_price&/);
  assert.match(calls[2][0], /^\/api\/staff\/order-workspace\?kind=orders/);
  assert.deepEqual([calls[3][0].split('?')[0], calls[3][1]], ['/api/admin/commerce-workspace', 'POST']);
});
