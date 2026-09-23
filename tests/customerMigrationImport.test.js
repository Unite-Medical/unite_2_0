import test from 'node:test';
import assert from 'node:assert/strict';
import { planCustomerMigrationBatch } from '../api/_lib/customerMigration.js';

const customer = {
  'Customer ID': '123', 'First Name': 'Ada', 'Last Name': 'Lovelace', Email: 'ada@hospital.org',
  'Accepts Email Marketing': 'yes', 'Accepts SMS Marketing': 'no', 'Accepts WhatsApp Marketing': 'no',
  'Tax Exempt': 'yes', 'Default Address Company': 'Example Hospital',
};

test('customer import plan is deterministic and creates no send or commerce records', () => {
  const input = { run_id: 'run_1', source_sha256: 'a'.repeat(64), customers: [{ source: customer, addresses: [{ address1: '1 Main', city: 'Atlanta', provinceCode: 'GA', zip: '30303', countryCode: 'US' }] }] };
  const first = planCustomerMigrationBatch(input);
  const second = planCustomerMigrationBatch(input);
  assert.deepEqual(first, second);
  assert.equal(first.rows.some((row) => ['orders', 'payments', 'shipments', 'notification_outbox', 'customerio_outbox'].includes(row.table)), false);
  assert.equal(first.summary.customers, 1);
  assert.equal(first.summary.activation_eligible, 1);
  assert.equal(first.summary.pricing_holds, 1);
});

test('customer import plan imports placeholder email record without profile or activation', () => {
  const plan = planCustomerMigrationBatch({ run_id: 'run_1', source_sha256: 'b'.repeat(64), customers: [{ source: { ...customer, 'Customer ID': '124', Email: '' }, addresses: [] }] });
  assert.equal(plan.rows.some((row) => row.table === 'profiles'), false);
  assert.equal(plan.summary.activation_holds, 1);
  assert.equal(plan.rows.some((row) => row.table === 'customer_external_identities'), true);
});

test('customer import plan rejects malformed source identity and duplicate customer IDs', () => {
  assert.throws(() => planCustomerMigrationBatch({ run_id: 'run', source_sha256: 'bad', customers: [] }), /source SHA-256/);
  assert.throws(() => planCustomerMigrationBatch({ run_id: 'run', source_sha256: 'c'.repeat(64), customers: [{ source: customer }, { source: customer }] }), /duplicate Shopify customer ID/);
});
