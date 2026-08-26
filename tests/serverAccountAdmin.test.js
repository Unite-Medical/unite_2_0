import test from 'node:test';
import assert from 'node:assert/strict';
import { planOrganizationUpdate } from '../api/admin/organizations.js';
import { planPaymentMethodAction } from '../api/admin/payment-methods.js';
import { planContractPriceAction } from '../api/admin/contract-prices.js';
import { planNotificationRecipientAction } from '../api/admin/notification-recipients.js';
import { planRepGrantAction } from '../api/admin/rep-grants.js';

const organization = {
  id: 'org_review', name: 'Review Account', approval_status: 'manual_review', status: 'active',
  tier: 'A', terms: 'net60', credit_limit: 50000, revision: 2,
};

test('first account approval resets to retail ACH with no automatic credit and revokes stale sessions', () => {
  const result = planOrganizationUpdate(organization, { approval_status: 'approved' }, {
    actorId: 'usr_admin', now: new Date('2026-07-19T12:00:00.000Z'),
  });
  assert.equal(result.ok, true);
  assert.equal(result.organization.tier, 'C');
  assert.equal(result.organization.terms, 'ach');
  assert.equal(result.organization.credit_limit, 0);
  assert.equal(result.organization.approved_by, 'usr_admin');
  assert.equal(result.ensure_ach, true);
  assert.equal(result.revoke_sessions, true);
  assert.equal(result.expected_revision, 2);
  assert.equal(result.organization.revision, 3);
});

test('organization policy endpoint rejects derived spend and invalid commercial values', () => {
  assert.equal(planOrganizationUpdate(organization, { total_spend: 1 }, { actorId: 'usr_admin' }).reason, 'invalid_organization_patch');
  assert.equal(planOrganizationUpdate(organization, { credit_limit: -1 }, { actorId: 'usr_admin' }).reason, 'invalid_credit_limit');
  assert.equal(planOrganizationUpdate(organization, { tier: 'VIP' }, { actorId: 'usr_admin' }).reason, 'invalid_tier');
});

test('approved account commercial changes are revisioned without granting approval again', () => {
  const approved = { ...organization, approval_status: 'approved', tier: 'C', terms: 'ach', credit_limit: 0 };
  const result = planOrganizationUpdate(approved, { tier: 'B', terms: 'net30', credit_limit: 10000 }, { actorId: 'usr_admin' });
  assert.equal(result.ok, true);
  assert.equal(result.organization.tier, 'B');
  assert.equal(result.organization.terms, 'net30');
  assert.equal(result.organization.credit_limit, 10000);
  assert.equal(result.ensure_ach, false);
  assert.equal(result.revoke_sessions, false);
});

test('payment rails fail closed until the account is approved and retain explicit credit limits', () => {
  assert.equal(planPaymentMethodAction({
    organization, method: 'net30', action: 'enable', credit_limit: 1000, actorId: 'usr_admin',
  }).reason, 'account_not_approved');
  const approved = { ...organization, approval_status: 'approved' };
  const enabled = planPaymentMethodAction({
    organization: approved, method: 'net30', action: 'enable', credit_limit: 1000,
    actorId: 'usr_admin', now: new Date('2026-07-19T12:00:00.000Z'),
  });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.row.status, 'active');
  assert.equal(enabled.row.credit_limit, 1000);
  assert.equal(enabled.row.approved_by, 'usr_admin');
  assert.equal(planPaymentMethodAction({
    organization: approved, method: 'ach', action: 'set_limit', credit_limit: 1000, actorId: 'usr_admin',
  }).reason, 'payment_method_not_found');
});

test('contract prices require an authoritative cost and preserve the 30 percent floor', () => {
  const approved = { ...organization, approval_status: 'approved' };
  const product = { sku: 'SKU-COSTED', landed_cost: 70, price: 120 };
  const tooLow = planContractPriceAction({
    organization: approved, product, action: 'set', unit_price: 99, min_qty: 1, actorId: 'usr_admin',
  });
  assert.equal(tooLow.reason, 'margin_floor_violation');
  assert.equal(tooLow.minimum_price, 100);
  const valid = planContractPriceAction({
    organization: approved, product, action: 'set', unit_price: 100, min_qty: 1,
    actorId: 'usr_admin', now: new Date('2026-07-19T12:00:00.000Z'),
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.row.status, 'active');
  const suspended = planContractPriceAction({
    organization: approved, product, existing: valid.row, action: 'suspend', min_qty: 1, actorId: 'usr_admin',
  });
  assert.equal(suspended.ok, true);
  assert.equal(suspended.row.status, 'suspended');
  assert.equal(planContractPriceAction({
    organization: approved, product: { sku: 'NO-COST' }, action: 'set', unit_price: 10, actorId: 'usr_admin',
  }).reason, 'cost_basis_required');
});

test('notification recipients normalize emails and allow only known event types', () => {
  const active = { ...organization, status: 'active' };
  const added = planNotificationRecipientAction({
    organization: active, action: 'upsert', email: '  AP@Customer.Test ', events: ['invoice', 'shipped', 'invoice'],
    actorId: 'usr_admin', now: new Date('2026-07-19T12:00:00.000Z'),
  });
  assert.equal(added.ok, true);
  assert.equal(added.row.email, 'ap@customer.test');
  assert.deepEqual(added.row.events, ['invoice', 'shipped']);
  assert.equal(planNotificationRecipientAction({
    organization: active, action: 'upsert', email: 'ap@customer.test', events: ['password_reset'], actorId: 'usr_admin',
  }).reason, 'invalid_notification_events');
  const removed = planNotificationRecipientAction({
    organization: active, existing: added.row, action: 'remove', email: added.row.email, actorId: 'usr_admin',
  });
  assert.equal(removed.ok, true);
  assert.equal(removed.remove, true);
});

test('rep authority accepts only eligible active reps, known grants, and bounded discount caps', () => {
  const profile = { id: 'usr_rep', role: 'rep', status: 'active' };
  const granted = planRepGrantAction({
    profile, grant: 'discount', action: 'grant', max_discount_pct: 12,
    actorId: 'usr_admin', now: new Date('2026-07-19T12:00:00.000Z'),
  });
  assert.equal(granted.ok, true);
  assert.equal(granted.row.max_discount_pct, 12);
  assert.equal(planRepGrantAction({ profile, grant: 'discount', action: 'grant', max_discount_pct: 101, actorId: 'usr_admin' }).reason, 'invalid_discount_cap');
  assert.equal(planRepGrantAction({ profile, grant: 'root_access', action: 'grant', actorId: 'usr_admin' }).reason, 'invalid_rep_grant');
  const revoked = planRepGrantAction({ profile, existing: granted.row, grant: 'discount', action: 'revoke', actorId: 'usr_admin' });
  assert.equal(revoked.ok, true);
  assert.equal(revoked.remove, true);
});
