import test from 'node:test';
import assert from 'node:assert/strict';
import { customerMigrationRequestAllowed } from '../api/internal/customer-migration.js';

test('customer migration endpoint is staging-only and requires a dedicated token', () => {
  assert.equal(customerMigrationRequestAllowed({ environment: 'staging', expected: 'secret-value', provided: 'secret-value' }), true);
  assert.equal(customerMigrationRequestAllowed({ environment: 'production', expected: 'secret-value', provided: 'secret-value' }), false);
  assert.equal(customerMigrationRequestAllowed({ environment: 'staging', expected: 'secret-value', provided: 'wrong' }), false);
  assert.equal(customerMigrationRequestAllowed({ environment: 'staging', expected: '', provided: '' }), false);
});
