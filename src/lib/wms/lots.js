/**
 * UniteWMS — lots & expiry (PRD-25 §3, §5.4, the recall SLA).
 *
 * Lots are created at RECEIVE (with lot number + expiration + landed cost) and
 * consumed FEFO (first-expire-first-out) at SHIP. The ship side writes
 * `lot_tracking` genealogy (lot → order → customer) so a recall query returns
 * every affected customer in < 1s.
 *
 * `receiveLot()` is the single receive primitive: it creates/extends the lot
 * AND posts the `receipt` ledger movement (with the lot_id) atomically and
 * idempotently. `pickFEFO()` decrements qty_remaining for shipping; the ship
 * ledger movement is posted by reservations.commit() with the lot id attached.
 */

import { db } from '../db.js';
import { uid } from '../format.js';
import { ledger } from './ledger.js';
import { isNotApplicable, trackingPolicyForSku, validateTrackingFields } from '../productTracking.js';

function num(v) { return Number(v) || 0; }

function findMovementByKey(key) {
  if (!key) return null;
  return db.list('stock_movements', { where: { idempotency_key: key } })[0] || null;
}

function findLot(sku, lot_number, expiration_date, warehouse_id, owner_type = 'unite', owner_org_id = null) {
  return db.list('lots', { where: { product_sku: sku, lot_number, warehouse_id } })
    .find((lot) => (lot.expiration_date || null) === (expiration_date || null)
      && (lot.owner_type || 'unite') === owner_type
      && (lot.owner_org_id || null) === (owner_org_id || null)) || null;
}

export function isLotSellable(lot, { today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!lot) return false;
  const blocked = new Set(['quarantined', 'quality_hold', 'recalled', 'expired', 'disposed', 'returned_to_vendor']);
  if (blocked.has(String(lot.status || '').toLowerCase())) return false;
  if (blocked.has(String(lot.quality_status || '').toLowerCase())) return false;
  if (blocked.has(String(lot.hold_status || '').toLowerCase())) return false;
  if (lot.recall_case_id || lot.recalled === true) return false;
  if (lot.expiration_date && lot.expiration_date < today) return false;
  return true;
}

/**
 * Receive a lot into a warehouse: create/extend the lots row and post the
 * `receipt` ledger movement. Idempotent on `idempotency_key`.
 *
 * @returns {{ok:boolean, duplicate?:boolean, lot?:object, movement?:object, reason?:string}}
 */
export function receiveLot({
  sku, lot_number, expiration_date = null, warehouse_id, qty,
  unit_cost = null, bin_id = null, received_from_shipment = null,
  received_by = null, ref_type = 'purchase_order', ref_id = null,
  owner_type = 'unite', owner_org_id = null,
  capture_method = null, not_applicable_reason = null,
  idempotency_key = null,
}) {
  const q = num(qty);
  if (!sku) return { ok: false, reason: 'missing_sku' };
  if (!warehouse_id) return { ok: false, reason: 'missing_warehouse_id' };
  if (q <= 0) return { ok: false, reason: 'invalid_qty' };
  const tracking = validateTrackingFields(sku, {
    lot_number, expiration_date, received_by, capture_method, not_applicable_reason,
  });
  if (!tracking.ok) return tracking;

  const lotNo = String(lot_number).trim();
  const expirationNotApplicable = isNotApplicable(expiration_date);
  const normalizedExpiration = expirationNotApplicable ? null : String(expiration_date).trim();
  const attestation = (isNotApplicable(lotNo) || expirationNotApplicable) ? {
    actor_id: received_by,
    capture_method,
    reason: not_applicable_reason,
    attested_at: new Date().toISOString(),
  } : null;
  if (owner_type === 'distributor' && !owner_org_id) return { ok: false, reason: 'owner_org_id_required' };
  const key = idempotency_key || `recv:${ref_id || received_from_shipment || 'manual'}:${sku}:${owner_type}:${owner_org_id || 'unite'}:${lotNo}:${normalizedExpiration || 'NA'}:${warehouse_id}`;

  // Idempotency: a replayed receipt must not double the lot or the ledger.
  const prior = findMovementByKey(key);
  if (prior) {
    return { ok: true, duplicate: true, lot: findLot(sku, lotNo, normalizedExpiration, warehouse_id, owner_type, owner_org_id), movement: prior };
  }

  // Create or extend the lot.
  let lot = findLot(sku, lotNo, normalizedExpiration, warehouse_id, owner_type, owner_org_id);
  if (lot) {
    lot = db.update('lots', lot.id, {
      qty_received: num(lot.qty_received) + q,
      qty_remaining: num(lot.qty_remaining) + q,
      unit_cost: unit_cost ?? lot.unit_cost,
      expiration_date: normalizedExpiration,
      expiration_not_applicable: expirationNotApplicable || Boolean(lot.expiration_not_applicable),
      traceability_attestation: attestation || lot.traceability_attestation || null,
    });
  } else {
    lot = db.insert('lots', {
      id: uid('lot'), product_sku: sku, lot_number: lotNo, expiration_date: normalizedExpiration,
      expiration_not_applicable: expirationNotApplicable,
      traceability_attestation: attestation,
      warehouse_id, bin_id, owner_type, owner_org_id, qty_received: q, qty_remaining: q, unit_cost,
      received_at: new Date().toISOString(), received_from_shipment, received_by,
    });
  }

  // Post the receipt movement (the ledger updates on_hand).
  const res = ledger.post({
    sku, warehouse_id, qty_delta: q, reason: ledger.REASONS.RECEIPT,
    ref_type, ref_id: ref_id || received_from_shipment, bin_id, lot_id: lot.id,
    unit_cost, actor_id: received_by, idempotency_key: key,
    note: `Receive lot ${lotNo}`,
  });

  return { ok: true, lot, movement: res.movement };
}

/**
 * FEFO pick: allocate `qty` of a sku from the earliest-expiring lots first,
 * decrementing qty_remaining. Returns the lot allocations (which the ship
 * commit attaches to its ledger movements) and any shortfall.
 *
 * @returns {{allocations:Array<{lot_id, lot_number, qty, expiration_date}>, shortfall:number}}
 */
export function pickFEFO(sku, warehouse_id, qty, { owner_type = 'unite', owner_org_id = null } = {}) {
  let need = num(qty);
  const policy = trackingPolicyForSku(sku);
  const lots = db.list('lots', { where: { product_sku: sku, warehouse_id } })
    .filter((l) => num(l.qty_remaining) > 0)
    .filter((l) => (l.owner_type || 'unite') === owner_type && (l.owner_org_id || null) === (owner_org_id || null))
    .filter((l) => isLotSellable(l))
    .filter((l) => policy.lot !== 'required' || Boolean(String(l.lot_number || '').trim()))
    .filter((l) => policy.expiration !== 'required' || Boolean(String(l.expiration_date || '').trim()))
    .sort((a, b) => {
      const ax = a.expiration_date || '9999-12-31';
      const bx = b.expiration_date || '9999-12-31';
      if (ax !== bx) return ax < bx ? -1 : 1;
      return (a.received_at || '') < (b.received_at || '') ? -1 : 1;
    });

  const allocations = [];
  for (const lot of lots) {
    if (need <= 0) break;
    const take = Math.min(num(lot.qty_remaining), need);
    if (take <= 0) continue;
    db.update('lots', lot.id, { qty_remaining: num(lot.qty_remaining) - take });
    allocations.push({ lot_id: lot.id, lot_number: lot.lot_number, qty: take, expiration_date: lot.expiration_date, owner_type: lot.owner_type || 'unite', owner_org_id: lot.owner_org_id || null });
    need -= take;
  }
  return { allocations, shortfall: Math.max(0, need) };
}

/**
 * Ship-side genealogy row (PRD §5.4 note): which lot went to which
 * order/customer. Powers the recall query.
 */
export function recordShipGenealogy({ lot_id = null, lot_number, product_sku, order_id, customer_id, recipient_org_id = null, owner_type = 'unite', owner_org_id = null, qty, expiration_date = null, shipped_by = 'system' }) {
  return db.insert('lot_tracking', {
    id: uid('lt'), lot_id, lot_number, product_sku, order_id, customer_id,
    recipient_org_id: recipient_org_id || customer_id || null,
    owner_type, owner_org_id,
    qty: num(qty), expiration_date,
    shipped_at: new Date().toISOString(), shipped_by,
  });
}

/**
 * Recall query (the < 1s SLA): every customer who received units of a lot.
 * @returns {Array<{order_id, customer_id, qty, shipped_at}>}
 */
export function genealogyMatches(row, criteria = {}) {
  if (criteria.lot_id) {
    if (row.lot_id !== criteria.lot_id) return false;
    if (criteria.owner_org_id && row.owner_org_id !== criteria.owner_org_id) return false;
    return true;
  }
  if (criteria.product_sku && row.product_sku !== criteria.product_sku && row.ordered_sku !== criteria.product_sku) return false;
  if (criteria.lot_number && row.lot_number !== criteria.lot_number) return false;
  if (criteria.expiration_date && row.expiration_date !== criteria.expiration_date) return false;
  if (criteria.owner_org_id && row.owner_org_id !== criteria.owner_org_id) return false;
  return true;
}

export function genealogy(identity) {
  const criteria = typeof identity === 'string' ? { lot_number: identity } : (identity || {});
  return db.list('lot_tracking')
    .filter((row) => genealogyMatches(row, criteria))
    .map((r) => ({
      lot_id: r.lot_id || null, lot_number: r.lot_number,
      order_id: r.order_id, customer_id: r.customer_id,
      recipient_org_id: r.recipient_org_id || r.customer_id || null,
      owner_type: r.owner_type || 'unite', owner_org_id: r.owner_org_id || null,
      qty: num(r.qty), shipped_at: r.shipped_at,
      product_sku: r.product_sku, ordered_sku: r.ordered_sku || r.product_sku,
      expiration_date: r.expiration_date || null,
    }));
}

/** Lots expiring within `days` that still hold stock (FEFO alert feed). */
export function expiringSoon(days = 90) {
  const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  return db.list('lots')
    .filter((l) => num(l.qty_remaining) > 0 && l.expiration_date && l.expiration_date <= cutoff)
    .sort((a, b) => (a.expiration_date < b.expiration_date ? -1 : 1));
}

export const lots = { receiveLot, pickFEFO, recordShipGenealogy, genealogy, expiringSoon, isLotSellable };
