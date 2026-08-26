import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMigratedCustomer } from '../src/lib/customerMigrationPolicy.js';

const customer = {
  'Customer ID': '123', 'First Name': 'Ada', 'Last Name': 'Lovelace', Email: 'ada@hospital.org',
  'Accepts Email Marketing': 'yes', 'Accepts SMS Marketing': 'no', 'Accepts WhatsApp Marketing': 'yes',
  'Tax Exempt': 'yes', Tags: 'hospital, tier-a', 'Default Address Company': 'Example Hospital',
};

test('customer migration requires activation and preserves consent and tax status', () => {
  const row = buildMigratedCustomer(customer, { certificate_status: 'missing' });
  assert.equal(row.profile.status, 'pending_activation');
  assert.equal('password' in row.profile, false);
  assert.deepEqual(row.marketing_consent, { email: true, sms: false, whatsapp: true });
  assert.equal(row.tax_exempt, true);
  assert.equal(row.tax_certificate.checkout_blocked, false);
});

test('customer migration never auto-joins by email domain and flags missing pricing source', () => {
  const row = buildMigratedCustomer(customer, { certificate_status: 'missing' });
  assert.equal(row.organization.auto_joined_by_domain, false);
  assert.equal(row.organization.commerce_hold_reason, 'customer_pricing_source_missing');
  assert.equal(row.pricing.status, 'source_missing');
  assert.equal(row.pricing.launch_blocker, true);
});

test('blank and placeholder email customers are imported without activatable profiles', () => {
  for (const email of ['', 'noreply@example.org', 'noemail@noemail.com']) {
    const row = buildMigratedCustomer({ ...customer, Email: email });
    assert.equal(row.profile, null);
    assert.equal(row.activation.status, 'reconciliation_hold');
    assert.equal(row.organization.approval_status, 'manual_review');
  }
});

test('saved addresses receive stable customer-scoped identities', () => {
  const row = buildMigratedCustomer(customer, { addresses: [
    { address1: '1 Main St', city: 'Atlanta', provinceCode: 'GA', zip: '30303', countryCode: 'US' },
    { address1: '2 Main St', city: 'Atlanta', provinceCode: 'GA', zip: '30303', countryCode: 'US' },
  ] });
  assert.equal(row.addresses.length, 2);
  assert.notEqual(row.addresses[0].id, row.addresses[1].id);
  assert.equal(row.addresses.every((address) => address.org_id === row.organization.id), true);
});
