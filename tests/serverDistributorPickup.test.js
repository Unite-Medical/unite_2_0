import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planDistributorPickupAction } from '../api/_lib/distributorPickups.js';

const pickup = {
  id: 'pickup_1', owner_org_id: 'org_dist', order_id: 'DIST-1', status: 'requested',
  requested_start: '2026-07-20T09:00', requested_end: '2026-07-20T16:00',
};

test('pickup lifecycle requires manager confirmation and carrier evidence before custody handoff', () => {
  const confirmed = planDistributorPickupAction({
    pickup, action: 'confirm', actorId: 'warehouse_manager',
    input: { confirmed_start: '2026-07-20T09:00', confirmed_end: '2026-07-20T16:00' },
  });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.pickup.status, 'confirmed');
  assert.equal(confirmed.inventory_effect, 'none');

  const arrived = planDistributorPickupAction({
    pickup: confirmed.pickup, action: 'arrival', actorId: 'dock_user',
    input: { evidence_type: 'provider_scan', evidence_reference: 'GATE-44' },
  });
  assert.equal(arrived.pickup.status, 'arrived');
  assert.equal(arrived.inventory_effect, 'none');

  const handed = planDistributorPickupAction({
    pickup: arrived.pickup, action: 'handoff', actorId: 'dock_user',
    input: { evidence_type: 'signed_bol', evidence_reference: 'BOL-991' },
  });
  assert.equal(handed.ok, true);
  assert.equal(handed.pickup.status, 'handed_off');
  assert.equal(handed.handoff_reference, 'BOL-991');
  assert.equal(handed.inventory_effect, 'commit_held_reservations');
});

test('pickup lifecycle rejects skipped states, missing evidence, and replay conflicts', () => {
  assert.equal(planDistributorPickupAction({ pickup, action: 'handoff', actorId: 'dock', input: {} }).reason, 'pickup_not_arrived');
  const confirmed = planDistributorPickupAction({
    pickup, action: 'confirm', actorId: 'manager',
    input: { confirmed_start: '2026-07-20T08:59', confirmed_end: '2026-07-20T10:00' },
  });
  assert.equal(confirmed.reason, 'pickup_outside_warehouse_hours');
  assert.equal(planDistributorPickupAction({
    pickup: { ...pickup, status: 'confirmed' }, action: 'arrival', actorId: 'dock', input: {},
  }).reason, 'carrier_evidence_required');
  const replay = planDistributorPickupAction({
    pickup: { ...pickup, status: 'handed_off', handoff_reference: 'BOL-1' },
    action: 'handoff', actorId: 'dock', input: { evidence_type: 'signed_bol', evidence_reference: 'BOL-1' },
  });
  assert.equal(replay.idempotent, true);
  assert.equal(planDistributorPickupAction({
    pickup: { ...pickup, status: 'handed_off', handoff_reference: 'BOL-1' },
    action: 'handoff', actorId: 'dock', input: { evidence_type: 'signed_bol', evidence_reference: 'BOL-2' },
  }).reason, 'handoff_already_recorded');
});
