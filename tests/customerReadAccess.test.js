import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadUniteCustomerBook } from '../api/_lib/customerReadAccess.js';
import { buildCustomerWorkspace } from '../api/_lib/customerWorkspace.js';
import { canSetNewPrice } from '../api/_lib/launchPolicy.js';
const env = { VERCEL_PROJECT_ID: 'prj_PL5BOZooLBtLiPQlrn34SyC0MRKS', PUBLIC_APP_ORIGIN: 'https://staging.unitemedical.net' };
const host = 'staging.unitemedical.net';
const actor = { user_id: "usr_shopify_'7337833922726", email: 'jacobe@unitemedical.net', role: 'sales' };
const data = { organizations: [
  { id: 'assigned', account_owner_email: actor.email },
  { id: 'other', account_owner_email: 'other@unitemedical.net' },
  { id: 'unassigned' },
  { id: 'internal', workspace_internal: true },
  { id: 'merged', status: 'merged' },
], quotes: [{ id: 'q', customer_id: 'other', acceptance_token: 'private' }], orders: [], backorders: [] };
const view = (session, environment = env, hostname = host) => buildCustomerWorkspace(data, session, { readAllCustomers: canReadUniteCustomerBook(session, environment, hostname) });
test('approved existing Jacobe account reads all current customers and their safe quote details', () => {
  const result = view(actor);
  assert.equal(result.scope, 'all');
  assert.deepEqual(result.accounts.map(a => a.id), ['assigned', 'other', 'unassigned']);
  assert.equal(result.accounts.find(a => a.id === 'other').quotes[0].id, 'q');
  assert.equal(JSON.stringify(result).includes('private'), false);
});
test('another staff identity retains assignment boundaries including same email with different ID', () => {
  for (const session of [{ ...actor, user_id: 'different' }, { ...actor, email: 'other@unitemedical.net' }, { ...actor, role: 'customer_service' }]) {
    const result = view(session);
    assert.equal(result.scope, 'assigned');
    assert.equal(result.accounts.length, 1);
  }
});
test('exception fails closed outside approved project, origin and host', () => {
  for (const [environment, hostname] of [[{}, host], [{ ...env, VERCEL_PROJECT_ID: 'other' }, host], [{ ...env, PUBLIC_APP_ORIGIN: 'https://unitemedical.net' }, host], [env, 'other.example']]) {
    assert.equal(view(actor, environment, hostname).scope, 'assigned');
    assert.equal(view(actor, environment, hostname).accounts.length, 1);
  }
});
test('unauthorized roles are still blocked for the exact approved email and user ID', () => {
  for (const role of ['customer', 'distributor', 'finance', 'warehouse_operator', undefined]) {
    assert.equal(view({ ...actor, role }).ok, false);
  }
});
test('customer read grant does not change Jacobe pricing authority', () => {
  assert.equal(canSetNewPrice(actor, 100, 80).reason, 'damon_approval_required');
  assert.equal(canSetNewPrice(actor, 100, 60).ok, true);
  assert.equal(canSetNewPrice({ ...actor, email: 'other@unitemedical.net' }, 100, 60).reason, 'pricing_authority_required');
});
