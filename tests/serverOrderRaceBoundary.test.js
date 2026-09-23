import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('customer and distributor order creation require insert-winner ownership', async () => {
  const [customer, distributor] = await Promise.all([
    readFile(new URL('../api/orders/place.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/distributor/orders.js', import.meta.url), 'utf8'),
  ]);
  for (const source of [customer, distributor]) {
    assert.match(source, /creation_nonce/);
    assert.match(source, /ON CONFLICT \(tbl,id\) DO NOTHING RETURNING id/);
    assert.match(source, /if \(!results\[0\]\?\.length\)/);
    assert.match(source, /data->>'creation_nonce'/);
  }
});
