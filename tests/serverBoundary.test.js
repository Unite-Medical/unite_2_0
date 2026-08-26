import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile, readdir } from 'node:fs/promises';

import {
  createSessionToken,
  verifySessionToken,
  verifyStoredPassword,
  hashStoredPassword,
  passwordNeedsUpgrade,
  authorizeLiveProfile,
} from '../api/_lib/auth.js';
import {
  canUseRawSync,
  canUseServiceProxy,
  projectRowForSession,
  projectQuoteBundleForSession,
} from '../api/_lib/rowStore.js';
import { rawSyncMutationAllowed, validateAdminProductMutation } from '../api/db/sync.js';
import { loginThrottleDescriptors } from '../api/auth/session.js';

const secret = 'test-session-secret-that-is-long-enough';

test('server session rejects a browser-tampered role', () => {
  const token = createSessionToken({ user_id: 'usr_sales', role: 'sales', org_id: 'org_unite', approval_status: 'approved', tier: 'C' }, { secret, now: 1_784_304_000_000 });
  const [body, signature] = token.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  const forgedBody = Buffer.from(JSON.stringify({ ...payload, role: 'admin' })).toString('base64url');

  assert.equal(verifySessionToken(`${forgedBody}.${signature}`, { secret, now: 1_784_304_001_000 }), null);
  const verified = verifySessionToken(token, { secret, now: 1_784_304_001_000 });
  assert.equal(verified.role, 'sales');
  assert.equal(verified.approval_status, 'approved');
  assert.equal(verified.tier, 'C');
});

test('server validates salted profile hashes and rejects legacy plaintext by default', () => {
  const salt = '00112233445566778899aabbccddeeff';
  const passwordHash = '540054d24e9aa88938f13b36e652b24d28a4caae1f4a04f4a0a85ade72cd7a2c';
  assert.equal(verifyStoredPassword({ password_salt: salt, password_hash: passwordHash }, 'correct horse'), true);
  assert.equal(verifyStoredPassword({ password: 'admin' }, 'admin'), false);
  assert.equal(verifyStoredPassword({ password: 'admin' }, 'admin', { allowLegacy: true }), true);
});

test('server creates salted password records that verify without plaintext storage', () => {
  const stored = hashStoredPassword('correct horse battery staple', { salt: '00112233445566778899aabbccddeeff' });
  assert.equal(stored.password_salt, '00112233445566778899aabbccddeeff');
  assert.equal('password' in stored, false);
  assert.equal(verifyStoredPassword(stored, 'correct horse battery staple'), true);
  assert.equal(verifyStoredPassword(stored, 'wrong'), false);
});

test('new password records use a versioned memory-hard hash and legacy hashes request upgrade', () => {
  const stored = hashStoredPassword('correct horse battery staple', { salt: '00112233445566778899aabbccddeeff' });
  assert.equal(stored.password_algorithm, 'scrypt-v1');
  assert.equal(passwordNeedsUpgrade(stored), false);
  assert.equal(passwordNeedsUpgrade({ password_salt: 'salt', password_hash: 'legacy' }), true);
  assert.equal(passwordNeedsUpgrade({ password: 'legacy plaintext' }), true);
});

test('live profile authorization revokes disabled, demoted, moved, and revision-stale sessions', () => {
  const session = { user_id: 'usr_admin', role: 'admin', org_id: 'org_unite', session_revision: 4 };
  const profile = { id: 'usr_admin', role: 'admin', org_id: 'org_unite', status: 'active', session_revision: 4 };
  assert.equal(authorizeLiveProfile(session, profile, { roles: ['admin'] }).ok, true);
  assert.equal(authorizeLiveProfile(session, { ...profile, status: 'disabled' }, { roles: ['admin'] }).reason, 'profile_inactive');
  assert.equal(authorizeLiveProfile(session, { ...profile, role: 'sales' }, { roles: ['admin'] }).reason, 'session_role_stale');
  assert.equal(authorizeLiveProfile(session, { ...profile, org_id: 'org_other' }, { roles: ['admin'] }).reason, 'session_organization_stale');
  assert.equal(authorizeLiveProfile(session, { ...profile, session_revision: 5 }, { roles: ['admin'] }).reason, 'session_revoked');
});

test('raw row-store sync is privileged and never available to sales, customer, or distributor sessions', () => {
  assert.equal(canUseRawSync({ role: 'admin' }), true);
  assert.equal(canUseRawSync({ role: 'finance' }), false);
  assert.equal(canUseRawSync({ role: 'warehouse_manager' }), false);
  assert.equal(canUseRawSync({ role: 'sales' }), false);
  assert.equal(canUseRawSync({ role: 'customer' }), false);
  assert.equal(canUseRawSync({ role: 'distributor' }), false);
  assert.equal(canUseRawSync(null), false);
});

test('ordinary sales quote projection is an allowlist and recursively excludes internal economics', () => {
  const row = {
    id: 'quote_1', customer_id: 'org_customer', assigned_owner_email: 'rep@unitemedical.net',
    status: 'draft', total: 100, shipping_cost: 8, customer_po: 'PO-77',
    total_landed: 55, freight_total: 9, margin: 0.45, duty_pct: 0.1,
    nested_offer: { tooling_setup_cost_usd: 500, provider_quote_id: 'secret-provider-id' },
  };
  const projected = projectRowForSession('quotes', row, { role: 'sales', email: 'rep@unitemedical.net' });
  assert.deepEqual(projected, {
    id: 'quote_1', customer_id: 'org_customer', assigned_owner_email: 'rep@unitemedical.net',
    status: 'draft', total: 100, shipping_cost: 8, customer_po: 'PO-77',
  });
  assert.doesNotMatch(JSON.stringify(projected), /landed|freight_total|margin|duty|tooling|provider_quote/i);
});

test('sales quote bundle strips every header and line-item cost seam and enforces assignment', () => {
  const quote = {
    id: 'quote_bundle', customer_id: 'org_customer', assigned_owner_email: 'rep@unitemedical.net',
    status: 'sent', total: 150, shipping_cost: 10, total_landed: 80, freight_options: [{ provider_quote_id: 'secret' }],
  };
  const items = [{
    id: 'qi_1', quote_id: 'quote_bundle', sku: 'SKU-1', name: 'Device', qty: 2,
    sell_per_unit: 70, ext_sell: 140, landed_per_unit: 30, duty_pct: 0.1,
    nested_offer: { vendor_name: 'Secret Vendor', tooling_setup_cost_usd: 500 },
  }];
  const bundle = projectQuoteBundleForSession({ quote, items }, { role: 'sales', email: 'rep@unitemedical.net' }, 'sales');
  assert.equal(bundle.items[0].sell_per_unit, 70);
  assert.doesNotMatch(JSON.stringify(bundle), /landed|duty|vendor|tooling|provider_quote/i);
  assert.equal(projectQuoteBundleForSession({ quote, items }, { role: 'sales', email: 'other@unitemedical.net' }, 'sales'), null);
  assert.equal(projectQuoteBundleForSession({ quote, items }, { role: 'customer', org_id: 'other_org' }, 'customer'), null);
});

test('generic credential proxy fails closed by service, role, path, and method', () => {
  assert.equal(canUseServiceProxy({ role: 'admin' }, 'qbo', '/v3/company/1/query', 'GET'), true);
  assert.equal(canUseServiceProxy({ role: 'finance' }, 'qbo', '/v3/company/1/companyinfo/1', 'GET'), true);
  for (const path of ['/v3/company/1/bill', '/v3/company/1/refundreceipt', '/v3/company/1/vendorcredit', '/v3/company/1/billpayment']) {
    assert.equal(canUseServiceProxy({ role: 'admin' }, 'qbo', path, 'POST'), false);
    assert.equal(canUseServiceProxy({ role: 'finance' }, 'qbo', path, 'POST'), false);
  }
  assert.equal(canUseServiceProxy({ role: 'sales' }, 'qbo', '/v3/company/1/bill', 'GET'), false);
  assert.equal(canUseServiceProxy({ role: 'customer' }, 'customerio', '/v1/send/email', 'POST'), false);
  assert.equal(canUseServiceProxy({ role: 'admin' }, 'customerio', '/v1/send/email', 'POST'), false);
  assert.equal(canUseServiceProxy(null, 'resend', '/emails', 'POST'), false);
  assert.equal(canUseServiceProxy({ role: 'customer' }, 'stripe', '/v1/payment_intents', 'POST'), false);
  assert.equal(canUseServiceProxy({ role: 'customer' }, 'stripe', '/v1/refunds', 'POST'), false);
});

test('active finance UI reaches dedicated financial mutations and has no generic QBO write seam', async () => {
  const finance = await readFile(new URL('../src/pages/admin/AdminFinance.jsx', import.meta.url), 'utf8');
  const payables = await readFile(new URL('../src/components/finance/AccountsPayable.jsx', import.meta.url), 'utf8');
  const combined = `${finance}\n${payables}`;
  assert.match(combined, /\/api\/ap\/vendor-bills/);
  assert.match(combined, /\/api\/ap\/settlement-payment/);
  assert.match(combined, /\/api\/finance\/record-payment/);
  assert.doesNotMatch(combined, /\/api\/proxy\/qbo|qbo\.(createBill|recordPayment|request)/);
});

test('server endpoints use the registration profile and membership tables', async () => {
  const apiRoot = new URL('../api/', import.meta.url);
  const names = await readdir(apiRoot, { recursive: true });
  const jsFiles = names.filter((name) => name.endsWith('.js'));
  const source = (await Promise.all(jsFiles.map((name) => readFile(new URL(name, apiRoot), 'utf8')))).join('\n');
  assert.doesNotMatch(source, /user_profiles|organization_memberships/);
  assert.match(source, /tbl\s*=\s*'profiles'|['"]profiles['"]/);
  assert.match(source, /organization_users/);
});

test('raw sync permits only allowlisted low-risk admin content and blocks operational tables', () => {
  assert.equal(rawSyncMutationAllowed({ table: 'blog_posts', op: 'upsert' }), true);
  assert.equal(rawSyncMutationAllowed({ table: 'products', op: 'upsert' }), true);
  assert.equal(rawSyncMutationAllowed({ table: 'products', op: 'delete' }), false);
  for (const table of ['profiles', 'organizations', 'purchase_orders', 'inventory', 'orders', 'vendor_bills', 'customerio_outbox', 'rep_order_grants']) {
    assert.equal(rawSyncMutationAllowed({ table, op: 'upsert' }), false, table);
  }
  assert.equal(rawSyncMutationAllowed({ table: 'purchase_orders', op: 'upsert' }, { serviceAccess: true }), true);
});

test('allowlisted product sync still enforces authoritative cost and the 30 percent floor', () => {
  assert.equal(validateAdminProductMutation({}, { sku: 'SKU-1', price: 100 }).reason, 'product_cost_and_price_required');
  const tooLow = validateAdminProductMutation({ sku: 'SKU-1', cogs: 70, price: 120 }, { price: 99 });
  assert.equal(tooLow.reason, 'margin_floor_violation');
  assert.equal(tooLow.minimum_price, 100);
  assert.equal(validateAdminProductMutation({ sku: 'SKU-1', cogs: 70, price: 120 }, { price: 100 }).ok, true);
  assert.equal(validateAdminProductMutation({}, { sku: 'QUOTE-ONLY', quote_only: true }).ok, true);
});

test('every signed-session route validates current live authority', async () => {
  const apiRoot = new URL('../api/', import.meta.url);
  const names = (await readdir(apiRoot, { recursive: true })).filter((name) => name.endsWith('.js'));
  for (const name of names) {
    const source = await readFile(new URL(name, apiRoot), 'utf8');
    if (!source.includes('sessionFromRequest(req)') || name.endsWith('_lib/auth.js')) continue;
    assert.match(
      source,
      /authorizeLiveRequest|authorizeLiveProfile|loadCommerceContext|authorizeCommerceContext/,
      `${name} trusts a signed claim without checking current authority`,
    );
  }
});

test('login reserves account, IP, and pair throttle slots before password verification', async () => {
  const source = await readFile(new URL('../api/auth/session.js', import.meta.url), 'utf8');
  assert.ok(source.indexOf('const throttles = await Promise.all') < source.indexOf("SELECT data FROM um_rows\n      WHERE tbl='profiles'"));
  const reqA = { headers: { 'x-forwarded-for': '198.51.100.1' }, socket: {} };
  const reqB = { headers: { 'x-forwarded-for': '198.51.100.2' }, socket: {} };
  const first = loginThrottleDescriptors('victim@example.test', reqA);
  const newIp = loginThrottleDescriptors('victim@example.test', reqB);
  const newAccount = loginThrottleDescriptors('other@example.test', reqA);
  assert.equal(first.find((row) => row.scope === 'account').id, newIp.find((row) => row.scope === 'account').id);
  assert.notEqual(first.find((row) => row.scope === 'pair').id, newIp.find((row) => row.scope === 'pair').id);
  assert.equal(first.find((row) => row.scope === 'ip').id, newAccount.find((row) => row.scope === 'ip').id);
});

test('registration is insert-only, concurrency locked, and commits its outbox with the account', async () => {
  const source = await readFile(new URL('../api/auth/register.js', import.meta.url), 'utf8');
  assert.match(source, /registration_locks/);
  assert.match(source, /sql\.transaction/);
  assert.match(source, /SELECT 'customerio_outbox'/);
  assert.doesNotMatch(source, /ON CONFLICT \(tbl,id\) DO UPDATE SET data=EXCLUDED\.data/);
});

test('verified short legacy passwords migrate without weakening new-password policy', () => {
  assert.throws(() => hashStoredPassword('admin'), /password_too_short/);
  const migrated = hashStoredPassword('admin', { salt: 'legacy-migration-salt', allowShortLegacy: true });
  assert.equal(verifyStoredPassword(migrated, 'admin'), true);
  assert.equal(passwordNeedsUpgrade(migrated), false);
});

test('logout, sync authority loss, and OAuth initiation fail closed', async () => {
  const [clientAuth, remoteDb, serverSession, googleConnect, qboConnect] = await Promise.all([
    readFile(new URL('../src/lib/auth.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/remoteDb.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/auth/session.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/auth/google/connect.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/auth/qbo/connect.js', import.meta.url), 'utf8'),
  ]);
  assert.match(clientAuth, /LOGOUT_PENDING_KEY/);
  assert.match(clientAuth, /keepalive: true/);
  assert.match(clientAuth, /db\.clearPublic\(\)/);
  assert.match(remoteDb, /authorizationLost/);
  assert.match(remoteDb, /stopRemoteDb\(\{ purge: true \}\)/);
  assert.match(serverSession, /data=\(data - 'password'\)/);
  assert.match(serverSession, /data->>'role'=\$\{profile\.role\}/);
  assert.match(googleConnect, /authorizeLiveRequest/);
  assert.match(qboConnect, /authorizeLiveRequest/);
});
