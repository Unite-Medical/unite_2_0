/** Distributor-originated blind-ship pickup and custody workflow. */

import { db } from './db.js';
import { uid } from './format.js';
import { mailer } from './mailer.js';
import { shipping } from './wms/shipping.js';

const TRANSITIONS = {
  requested: ['confirmed', 'cancelled'],
  confirmed: ['arrived', 'cancelled', 'no_show'],
  arrived: ['handed_off', 'cancelled'],
  handed_off: [],
  cancelled: [],
  no_show: ['confirmed', 'cancelled'],
};

function event(pickupId, kind, actor, payload = {}) {
  return db.insert('distributor_pickup_events', {
    id: uid('dpe'), pickup_id: pickupId, kind, actor, payload,
    occurred_at: new Date().toISOString(),
  });
}

function transition(id, to, actor, extra = {}) {
  const pickup = db.get('distributor_pickups', id);
  if (!pickup) return { ok: false, reason: 'pickup_not_found' };
  if (!(TRANSITIONS[pickup.status] || []).includes(to)) {
    return { ok: false, reason: `cannot_${to}_from_${pickup.status}` };
  }
  const updated = db.update('distributor_pickups', id, { status: to, ...extra });
  event(id, to, actor, extra);
  return { ok: true, pickup: updated };
}

function validWindow(start, end) {
  const startMs = new Date(start || 0).getTime();
  const endMs = new Date(end || 0).getTime();
  return Number.isFinite(startMs) && Number.isFinite(endMs) && startMs < endMs;
}

export async function request({
  owner_org_id,
  order_id,
  carrier_name,
  third_party_account_ref = null,
  booking_reference,
  dispatch_contact = null,
  requested_start,
  requested_end,
  requested_by,
}) {
  const order = db.get('orders', order_id);
  if (!order) return { ok: false, reason: 'order_not_found' };
  const orderOwner = order.on_behalf_of_org_id || order.customer_id;
  if (orderOwner !== owner_org_id) return { ok: false, reason: 'order_not_owned_by_distributor' };
  if (!order.blind_ship) return { ok: false, reason: 'pickup_requires_distributor_blind_ship_order' };
  if (!String(carrier_name || '').trim() || !String(booking_reference || '').trim()) {
    return { ok: false, reason: 'carrier_and_booking_required' };
  }
  if (!validWindow(requested_start, requested_end)) return { ok: false, reason: 'invalid_pickup_window' };

  const pickup = db.insert('distributor_pickups', {
    id: uid('dpu'), owner_org_id, order_id, status: 'requested',
    carrier_name: String(carrier_name).trim(),
    third_party_account_ref: third_party_account_ref || null,
    booking_reference: String(booking_reference).trim(),
    dispatch_contact,
    requested_start,
    requested_end,
    requested_by,
    requested_at: new Date().toISOString(),
  });
  event(pickup.id, 'requested', requested_by, {
    carrier_name: pickup.carrier_name,
    booking_reference: pickup.booking_reference,
    requested_start,
    requested_end,
  });
  db.insert('tasks', {
    id: uid('task'), kind: 'distributor_pickup_requested',
    subject: `Pickup requested for ${order_id}`,
    owner_email: 'warehouse@unitemedical.net', status: 'open',
    ref_type: 'distributor_pickup', ref_id: pickup.id,
    payload: { owner_org_id, order_id, requested_start, requested_end },
    created_at: new Date().toISOString(),
  });
  await mailer.send({
    to: 'warehouse@unitemedical.net',
    subject: `Pickup requested for ${order_id}`,
    body: `${carrier_name} requested ${requested_start} to ${requested_end}. Booking ${booking_reference}. Review warehouse readiness before confirming.`,
    template_key: 'distributor/pickup_requested', drafted_by: requested_by,
  });
  return { ok: true, pickup };
}

export function confirm(id, { confirmed_by, confirmed_start, confirmed_end }) {
  const pickup = db.get('distributor_pickups', id);
  if (!pickup) return { ok: false, reason: 'pickup_not_found' };
  const order = db.get('orders', pickup.order_id);
  if (order?.status !== 'ready_for_pickup') return { ok: false, reason: 'order_not_ready_for_pickup' };
  if (!validWindow(confirmed_start, confirmed_end)) return { ok: false, reason: 'invalid_confirmed_window' };
  const result = transition(id, 'confirmed', confirmed_by, {
    confirmed_by,
    confirmed_start,
    confirmed_end,
    confirmed_at: new Date().toISOString(),
  });
  return result.ok ? result.pickup : result;
}

export function recordArrival(id, { recorded_by, driver_name, vehicle_id = null }) {
  if (!String(driver_name || '').trim()) return { ok: false, reason: 'driver_name_required' };
  const result = transition(id, 'arrived', recorded_by, {
    driver_name: String(driver_name).trim(), vehicle_id,
    arrived_at: new Date().toISOString(), arrived_recorded_by: recorded_by,
  });
  return result.ok ? result.pickup : result;
}

export function recordHandoff(id, { recorded_by, custody_signature }) {
  const pickup = db.get('distributor_pickups', id);
  if (!pickup) return { ok: false, reason: 'pickup_not_found' };
  if (pickup.status !== 'arrived') return { ok: false, reason: `cannot_handoff_from_${pickup.status}` };
  if (!String(custody_signature || '').trim()) return { ok: false, reason: 'custody_signature_required' };
  const held = db.list('reservations', { where: { order_id: pickup.order_id, status: 'held' } });
  if (!held.length) return { ok: false, reason: 'held_inventory_required' };
  const shipped = shipping.confirmShip(pickup.order_id, { actor_id: recorded_by });
  if (!shipped.ok) return shipped;
  const handedOffAt = new Date().toISOString();
  const transitioned = transition(id, 'handed_off', recorded_by, {
    custody_signature: String(custody_signature).trim(),
    handed_off_at: handedOffAt,
    handed_off_by: recorded_by,
    stock_movement_ids: shipped.movements.map((movement) => movement.id),
  });
  db.update('orders', pickup.order_id, {
    status: 'shipped', shipped_at: handedOffAt, shipping_mode: 'distributor_arranged_pickup',
  });
  return { ok: true, pickup: transitioned.pickup, shipment: shipped };
}

export function cancel(id, { cancelled_by, reason }) {
  return transition(id, 'cancelled', cancelled_by, {
    cancelled_by, cancellation_reason: reason || null, cancelled_at: new Date().toISOString(),
  });
}

export function markNoShow(id, { recorded_by, note = null }) {
  return transition(id, 'no_show', recorded_by, {
    no_show_at: new Date().toISOString(), no_show_note: note,
  });
}

export function listForDistributor(owner_org_id) {
  return db.list('distributor_pickups', { where: { owner_org_id } }).map((pickup) => ({
    id: pickup.id,
    order_id: pickup.order_id,
    status: pickup.status,
    carrier_name: pickup.carrier_name,
    booking_reference: pickup.booking_reference,
    requested_start: pickup.requested_start,
    requested_end: pickup.requested_end,
    confirmed_start: pickup.confirmed_start || null,
    confirmed_end: pickup.confirmed_end || null,
    driver_name: pickup.driver_name || null,
    arrived_at: pickup.arrived_at || null,
    handed_off_at: pickup.handed_off_at || null,
  }));
}

export const distributorPickups = {
  request,
  confirm,
  recordArrival,
  recordHandoff,
  cancel,
  markNoShow,
  listForDistributor,
};
