import test from 'node:test';
import assert from 'node:assert/strict';

// A real bridge boot must keep an empty server empty despite browser cart caches.
test('empty admin hydration and local caches never resurrect public products', async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  globalThis.window = { addEventListener() {}, dispatchEvent() {} };
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET' });
    if (String(url).endsWith('/health')) return { ok: true, json: async () => ({ services: { postgres: { configured: true } } }) };
    if (options.method === 'POST') throw new Error('Local caches must not write to raw sync');
    return { ok: true, json: async () => ({ row_count: 0, tables: {}, latest: '2026-09-23T00:00:00Z' }) };
  };
  const { db } = await import('../src/lib/db.js');
  const { startRemoteDb, stopRemoteDb, remoteDbStatus } = await import('../src/lib/remoteDb.js');
  try {
    db.clearPublic();
    assert.ok(db.list('products').length > 0);
    await startRemoteDb({ session: { role: 'admin' } });
    assert.equal(db.list('products').length, 0);
    for (const table of ['carts', 'cart_items', 'account_prices']) db.insert(table, { id: `local_${table}` });
    assert.equal(remoteDbStatus().pending, 0);
    await new Promise(resolve => setTimeout(resolve, 850));
    assert.equal(requests.some(request => request.method === 'POST'), false);
    assert.equal(remoteDbStatus().hydrated, true);
    stopRemoteDb({ purge: true });
    assert.equal(db.list('products').length, 0);
    assert.equal(db.list('inventory').length, 0);
    assert.equal(db.list('carts').length, 0);
  } finally {
    stopRemoteDb({ purge: true });
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});
