import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { publicQboCompanyInfo } from '../api/qbo/company-info.js';

test('QBO company-info projection is read-only and allowlisted', () => {
  const projected = publicQboCompanyInfo({
    CompanyName: 'Unite Medical', LegalName: 'Unite Medical Supply LLC', Country: 'US',
    Email: { Address: 'accounting@example.test' }, Id: 'realm-secret', SyncToken: '7', sparse: false,
  });
  assert.deepEqual(projected, {
    company_name: 'Unite Medical', legal_name: 'Unite Medical Supply LLC', country: 'US', email: 'accounting@example.test',
  });
  assert.equal('Id' in projected, false);
  assert.equal('SyncToken' in projected, false);
});

test('QBO OAuth callback never renders tokens and generic QBO proxy remains read-only', async () => {
  const [callback, rowStore, services] = await Promise.all([
    readFile(new URL('../api/auth/qbo/callback.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/_lib/rowStore.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/_lib/services.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(callback, /QBO_REFRESH_TOKEN=|tokens\.refresh_token\}\s*<\/pre>/);
  assert.match(callback, /saveQboCredential/);
  assert.match(rowStore, /service === 'qbo'.*!\['GET', 'HEAD'\]/s);
  assert.doesNotMatch(services, /env\('QBO_REFRESH_TOKEN'\)/);
});
