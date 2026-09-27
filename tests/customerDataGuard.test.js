import test from 'node:test';
import assert from 'node:assert/strict';
import { isForbiddenCustomerArtifact, assertStagingTarget } from '../scripts/customer_data_guard.mjs';

test('customer data guard rejects raw migration exports and certificates', () => {
  assert.equal(isForbiddenCustomerArtifact('customers_export.csv'), true);
  assert.equal(isForbiddenCustomerArtifact('orders_export_1.csv'), true);
  assert.equal(isForbiddenCustomerArtifact('customer-certificate.pdf'), true);
  assert.equal(isForbiddenCustomerArtifact('migration/customer-addresses.jsonl'), true);
});

test('customer data guard allows synthetic fixtures and source code', () => {
  assert.equal(isForbiddenCustomerArtifact('tests/fixtures/synthetic-customer.csv'), false);
  assert.equal(isForbiddenCustomerArtifact('src/lib/customerMigrationPolicy.js'), false);
});

test('customer migration target must be explicitly staging', () => {
  assert.doesNotThrow(() => assertStagingTarget('staging'));
  assert.throws(() => assertStagingTarget('production'), /staging-only/);
  assert.throws(() => assertStagingTarget(''), /staging-only/);
});
