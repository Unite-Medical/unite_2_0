import test from 'node:test';
import assert from 'node:assert/strict';
import { planActivationIssue, planActivationRedemption, hashActivationToken } from '../api/_lib/customerActivation.js';

const profile = { id:'usr_1', email:'buyer@hospital.org', org_id:'org_1', role:'customer', status:'pending_activation', approval_status:'migration_pending', activation_required:true, session_revision:0 };

test('activation issue stores only token hash and binds profile revision', () => {
  const plan = planActivationIssue(profile, { token:'secret-token', now:new Date('2026-08-26T00:00:00Z') });
  assert.equal(plan.ok, true);
  assert.equal(plan.record.token_hash, hashActivationToken('secret-token'));
  assert.equal(JSON.stringify(plan.record).includes('secret-token'), false);
  assert.equal(plan.record.profile_revision, 0);
});

test('activation redemption rejects expiry, replay, wrong token, and profile drift', () => {
  const issue = planActivationIssue(profile, { token:'secret-token', now:new Date('2026-08-26T00:00:00Z') }).record;
  assert.equal(planActivationRedemption({ profile, tokenRecord:issue, token:'wrong', password:'long-enough-password', now:new Date('2026-08-26T01:00:00Z') }).ok, false);
  assert.equal(planActivationRedemption({ profile, tokenRecord:{...issue,consumed_at:'x'}, token:'secret-token', password:'long-enough-password', now:new Date('2026-08-26T01:00:00Z') }).reason, 'activation_token_used');
  assert.equal(planActivationRedemption({ profile:{...profile,session_revision:1}, tokenRecord:issue, token:'secret-token', password:'long-enough-password', now:new Date('2026-08-26T01:00:00Z') }).reason, 'profile_changed');
  assert.equal(planActivationRedemption({ profile, tokenRecord:issue, token:'secret-token', password:'long-enough-password', now:new Date('2026-09-30T01:00:00Z') }).reason, 'activation_token_expired');
});

test('activation redemption activates profile but does not approve commerce', () => {
  const issue = planActivationIssue(profile, { token:'secret-token', now:new Date('2026-08-26T00:00:00Z') }).record;
  const plan = planActivationRedemption({ profile, tokenRecord:issue, token:'secret-token', password:'long-enough-password', now:new Date('2026-08-26T01:00:00Z') });
  assert.equal(plan.ok, true);
  assert.equal(plan.profile.status, 'active');
  assert.equal(plan.profile.activation_required, false);
  assert.equal(plan.profile.approval_status, 'migration_pending');
  assert.equal('password' in plan.profile, false);
});
