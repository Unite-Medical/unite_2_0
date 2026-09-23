import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decryptQboSecret,
  encryptQboSecret,
  planQboCredential,
  planQboRefreshResult,
  qboAccessTokenUsable,
  qboRefreshClaimable,
} from '../api/_lib/qboTokens.js';

const key = 'unit-test-qbo-encryption-key-with-enough-entropy';
const now = new Date('2026-08-06T16:00:00.000Z');

test('QBO credentials are encrypted and preserve rotated token material', () => {
  const sealed = encryptQboSecret('refresh-secret', key);
  assert.doesNotMatch(sealed, /refresh-secret/);
  assert.equal(decryptQboSecret(sealed, key), 'refresh-secret');
  const credential = planQboCredential({
    realmId: 'realm-live', environment: 'production',
    tokens: { access_token: 'access-one', refresh_token: 'refresh-one', expires_in: 3600, x_refresh_token_expires_in: 8640000 },
    encryptionKey: key, actorId: 'admin_1', now,
  });
  assert.equal(credential.status, 'active');
  assert.equal(credential.realm_id, 'realm-live');
  assert.equal(credential.revision, 1);
  assert.equal(decryptQboSecret(credential.refresh_token_ciphertext, key), 'refresh-one');
  assert.equal(qboAccessTokenUsable(credential, new Date('2026-08-06T16:30:00.000Z')), true);
  assert.equal(qboAccessTokenUsable(credential, new Date('2026-08-06T16:59:30.000Z')), false);

  const refreshed = planQboRefreshResult({ ...credential, status: 'refreshing', refresh_claim_token: 'claim_1' }, {
    access_token: 'access-two', refresh_token: 'refresh-two', expires_in: 3600, x_refresh_token_expires_in: 8640000,
  }, { encryptionKey: key, claimToken: 'claim_1', now: new Date('2026-08-06T17:00:00.000Z') });
  assert.equal(refreshed.revision, 2);
  assert.equal(decryptQboSecret(refreshed.access_token_ciphertext, key), 'access-two');
  assert.equal(decryptQboSecret(refreshed.refresh_token_ciphertext, key), 'refresh-two');
  assert.equal(refreshed.refresh_claim_token, null);
});

test('stale QBO refresh claims become provider-unknown instead of retryable', () => {
  const active = { status: 'active', refresh_claim_token: null, refresh_token_ciphertext: 'sealed' };
  assert.equal(qboRefreshClaimable(active, now), true);
  assert.equal(qboRefreshClaimable({ ...active, refresh_claim_token: 'live', refresh_claimed_at: '2026-08-06T15:59:30.000Z' }, now), false);
  assert.equal(qboRefreshClaimable({ ...active, refresh_claim_token: 'stale', refresh_claimed_at: '2026-08-06T15:50:00.000Z' }, now), false);
  assert.equal(qboRefreshClaimable({ ...active, status: 'provider_unknown' }, now), false);
});
