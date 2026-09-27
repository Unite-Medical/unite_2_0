import test from 'node:test';
import assert from 'node:assert/strict';
import { messengerAllowed, createMessenger } from '../src/lib/intercomMessenger.js';

const at = (path = '/', host = 'staging.unitemedical.net') => new URL(`https://${host}${path}`);

test('visitor chat stays on approved staging public pages', () => {
  for (const path of ['/', '/catalog', '/product/example', '/support', '/regenicool']) assert.equal(messengerAllowed(at(path)), true);
  for (const path of ['/admin', '/work', '/account/orders/1', '/checkout', '/login', '/activate?token=secret', '/support?email=private', '/#token']) assert.equal(messengerAllowed(at(path)), false);
  for (const host of ['unitemedical.net', 'tjs.unitemedical.net', 'localhost']) assert.equal(messengerAllowed(at('/', host)), false);
});

test('queues anonymous boot once, updates routes, shuts down on private pages and reboots on return', () => {
  const win = {};
  const scripts = [];
  const doc = { getElementById: () => scripts[0], createElement: () => ({}), head: { appendChild: script => scripts.push(script) } };
  const messenger = createMessenger(win, doc, 'test-app');
  messenger.sync(at('/'));
  messenger.sync(at('/'));
  assert.equal(scripts.length, 1);
  assert.deepEqual(win.Intercom.q, [['boot', { app_id: 'test-app', api_base: 'https://api-iam.intercom.io' }]]);
  messenger.sync(at('/support'));
  messenger.sync(at('/account'));
  messenger.sync(at('/account/orders'));
  messenger.sync(at('/catalog'));
  assert.deepEqual(win.Intercom.q.map(call => call[0]), ['boot', 'update', 'shutdown', 'boot']);
});

test('account changes reset Messenger history before a fresh boot', () => {
  const calls=[]; const win={Intercom:(...args)=>calls.push(args)};
  const doc={getElementById:()=>true};
  const messenger=createMessenger(win,doc,'test-app');
  messenger.sync(at('/')); messenger.reset(); messenger.sync(at('/'));
  assert.deepEqual(calls.map(call=>call[0]),['boot','shutdown','boot']);
});
