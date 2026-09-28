import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAccountPricing } from '../src/lib/accountPricing.js';

test('account pricing fetches all catalog variants and quantity breaks within the API limit', async () => {
  const lines = Array.from({ length: 1484 }, (_, i) => ({ sku: `SKU-${i}`, qty: 1 }));
  const batches = [];
  const result = await fetchAccountPricing(lines, { fetchImpl: async (_, options) => {
    const batch = JSON.parse(options.body).lines;
    batches.push(batch.length);
    return { ok: true, json: async () => ({ prices: batch.map(line => ({ ...line, unit_price: 12 })) }) };
  } });
  assert.deepEqual(batches, [500, 500, 484]);
  assert.equal(result.prices.length, lines.length);
  assert.equal(result.prices.at(-1).sku, 'SKU-1483');
});

test('a failed pricing batch does not publish a partial catalog of account prices', async () => {
  let calls = 0;
  const result = await fetchAccountPricing(Array.from({ length: 600 }, () => ({ sku: 'TEST', qty: 1 })), { fetchImpl: async () => {
    calls++;
    return calls === 1 ? { ok: true, json: async () => ({ prices: [{ sku: 'TEST', unit_price: 12 }] }) }
      : { ok: false, status: 503, json: async () => ({ error: 'pricing_failed' }) };
  } });
  assert.equal(result.ok, false);
  assert.equal(result.prices, undefined);
});
