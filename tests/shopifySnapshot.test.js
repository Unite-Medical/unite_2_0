import test from 'node:test';
import assert from 'node:assert/strict';
import { exportShopifySnapshot } from '../api/_lib/shopifySnapshot.js';

test('exportShopifySnapshot paginates collections without sending mutations', async () => {
  const calls = [];
  const responses = [
    { data: { collections: { nodes: [{ id: 'gid://shopify/Collection/1', handle: 'first' }], pageInfo: { hasNextPage: true, endCursor: 'next' } } } },
    { data: { collections: { nodes: [{ id: 'gid://shopify/Collection/2', handle: 'second' }], pageInfo: { hasNextPage: false, endCursor: null } } } },
  ];
  const out = await exportShopifySnapshot({
    endpoint: 'https://example.myshopify.com/admin/api/2026-04/graphql.json',
    token: 'test',
    fetchImpl: async (_url, request) => {
      calls.push(JSON.parse(request.body));
      return { ok: true, json: async () => responses.shift() };
    },
    datasets: ['collections'],
  });
  assert.deepEqual(out.collections.map((row) => row.handle), ['first', 'second']);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => /^\s*query\b/.test(call.query)));
  assert.ok(calls.every((call) => !/mutation\b/i.test(call.query)));
});
