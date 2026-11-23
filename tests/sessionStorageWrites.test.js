import test from 'node:test';
import assert from 'node:assert/strict';

test('repeated bootstraps with an unchanged session do not rewrite the shared session key', async () => {
  const original = { window: globalThis.window, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  const memory = new Map();
  const writes = [];
  globalThis.window = new EventTarget();
  globalThis.localStorage = {
    getItem: k => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => { writes.push(['set', k]); memory.set(k, String(v)); },
    removeItem: k => { writes.push(['remove', k]); memory.delete(k); },
    clear: () => memory.clear(),
  };
  const sessionWrites = () => writes.filter(([, k]) => k === 'um.session.v1').length;
  let remote;
  try {
    const { auth } = await import('../src/lib/auth.js');
    remote = await import('../src/lib/remoteDb.js');

    globalThis.fetch = async () => ({ ok: false, status: 401 });
    assert.equal(await auth.bootstrap(), null);
    assert.equal(await auth.bootstrap(), null);
    assert.equal(sessionWrites(), 0);
    assert.equal(memory.has('um.session.v1'), false);

    const session = { user_id: 'cust-test', email: 'buyer@example.com', role: 'customer' };
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ session }) });
    await auth.bootstrap();
    const afterSignIn = sessionWrites();
    assert.equal(afterSignIn, 1);
    await auth.bootstrap();
    assert.equal(sessionWrites(), afterSignIn);

    globalThis.fetch = async () => ({ ok: false, status: 401 });
    await auth.bootstrap();
    assert.equal(memory.has('um.session.v1'), false);
  } finally {
    remote?.stopRemoteDb();
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
