import { validateWarehousePickupWindow } from './distributorProjection.js';

const EVIDENCE_TYPES = new Set(['provider_scan', 'signed_bol', 'custody_signature', 'pro', 'label', 'booking']);

export function planDistributorPickupAction({ pickup, action, actorId, input = {}, now = new Date() } = {}) {
  if (!pickup) return { ok: false, reason: 'pickup_not_found' };
  const actor = String(actorId || '').trim();
  if (!actor) return { ok: false, reason: 'actor_required' };
  const occurredAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const normalizedAction = String(action || '').trim();

  if (normalizedAction === 'confirm') {
    if (pickup.status === 'confirmed') return { ok: true, idempotent: true, pickup, inventory_effect: 'none' };
    if (pickup.status !== 'requested') return { ok: false, reason: 'pickup_not_requested' };
    const window = validateWarehousePickupWindow(input.confirmed_start, input.confirmed_end);
    if (!window.ok) return window;
    return {
      ok: true,
      pickup: {
        ...pickup, status: 'confirmed', confirmed_start: window.start, confirmed_end: window.end,
        warehouse_time_zone: window.warehouse_time_zone,
        confirmed_by: actor, confirmed_at: occurredAt, updated_at: occurredAt,
      },
      event: { kind: 'confirmed', actor_id: actor, occurred_at: occurredAt },
      inventory_effect: 'none',
    };
  }

  if (normalizedAction === 'arrival') {
    if (pickup.status === 'arrived') return { ok: true, idempotent: true, pickup, inventory_effect: 'none' };
    if (pickup.status !== 'confirmed') return { ok: false, reason: 'pickup_not_confirmed' };
    const evidenceType = String(input.evidence_type || '').trim().toLowerCase();
    const evidenceReference = String(input.evidence_reference || '').trim();
    if (!EVIDENCE_TYPES.has(evidenceType) || !evidenceReference) return { ok: false, reason: 'carrier_evidence_required' };
    return {
      ok: true,
      pickup: {
        ...pickup, status: 'arrived', arrival_evidence_type: evidenceType,
        arrival_evidence_reference: evidenceReference, arrived_by: actor,
        arrived_at: occurredAt, updated_at: occurredAt,
      },
      event: { kind: 'arrived', actor_id: actor, evidence_type: evidenceType, evidence_reference: evidenceReference, occurred_at: occurredAt },
      inventory_effect: 'none',
    };
  }

  if (normalizedAction === 'handoff') {
    const evidenceType = String(input.evidence_type || '').trim().toLowerCase();
    const evidenceReference = String(input.evidence_reference || '').trim();
    if (pickup.status === 'handed_off') {
      if (pickup.handoff_reference === evidenceReference) return { ok: true, idempotent: true, pickup, handoff_reference: evidenceReference, inventory_effect: 'none' };
      return { ok: false, reason: 'handoff_already_recorded' };
    }
    if (pickup.status !== 'arrived') return { ok: false, reason: 'pickup_not_arrived' };
    if (!EVIDENCE_TYPES.has(evidenceType) || !evidenceReference) return { ok: false, reason: 'custody_evidence_required' };
    return {
      ok: true,
      pickup: {
        ...pickup, status: 'handed_off', handoff_evidence_type: evidenceType,
        handoff_reference: evidenceReference, handed_off_by: actor,
        handed_off_at: occurredAt, updated_at: occurredAt,
      },
      event: { kind: 'handed_off', actor_id: actor, evidence_type: evidenceType, evidence_reference: evidenceReference, occurred_at: occurredAt },
      handoff_reference: evidenceReference,
      inventory_effect: 'commit_held_reservations',
    };
  }

  if (normalizedAction === 'cancel') {
    if (!['requested', 'confirmed'].includes(pickup.status)) return { ok: false, reason: 'pickup_not_cancellable' };
    const reason = String(input.reason || '').trim();
    if (!reason) return { ok: false, reason: 'cancellation_reason_required' };
    return {
      ok: true,
      pickup: { ...pickup, status: 'cancelled', cancellation_reason: reason, cancelled_by: actor, cancelled_at: occurredAt, updated_at: occurredAt },
      event: { kind: 'cancelled', actor_id: actor, reason, occurred_at: occurredAt },
      inventory_effect: 'none',
    };
  }

  if (normalizedAction === 'no_show') {
    if (pickup.status !== 'confirmed') return { ok: false, reason: 'pickup_not_confirmed' };
    return {
      ok: true,
      pickup: { ...pickup, status: 'no_show', no_show_by: actor, no_show_at: occurredAt, updated_at: occurredAt },
      event: { kind: 'no_show', actor_id: actor, occurred_at: occurredAt },
      inventory_effect: 'none',
    };
  }

  return { ok: false, reason: 'pickup_action_invalid' };
}
