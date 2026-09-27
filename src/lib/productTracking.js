/** Product-configured lot, expiration, serial, and UDI capture policy. */

import { db } from './db.js';

const LEVELS = new Set(['not_tracked', 'optional', 'required']);
const NOT_APPLICABLE = /^(?:n\/?a|not[ _-]?applicable)$/i;

export function isNotApplicable(value) {
  return NOT_APPLICABLE.test(String(value || '').trim());
}

function normalizeLevel(value, requiredFlag = false, trackedFlag = false) {
  if (requiredFlag === true) return 'required';
  if (LEVELS.has(value)) return value;
  if (value === true || trackedFlag === true) return 'optional';
  return 'not_tracked';
}

export function trackingPolicyForProduct(source = {}) {
  return {
    lot: normalizeLevel(source.lot_tracking, source.lot_required, source.track_lot),
    expiration: normalizeLevel(source.expiration_tracking, source.expiration_required, source.track_expiration),
    serial: normalizeLevel(source.serial_tracking, source.serial_required, source.track_serial),
    udi: normalizeLevel(source.udi_tracking, source.udi_required, source.track_udi),
  };
}

export function trackingPolicyForSku(sku) {
  const product = db.list('products', { where: { sku } })[0] || null;
  const variant = db.list('product_variants', { where: { sku } })[0] || null;
  return trackingPolicyForProduct(variant || product || {});
}

export function validateTrackingFields(sku, values = {}) {
  return validateTrackingCapture(sku, trackingPolicyForSku(sku), values);
}

export function validateTrackingCapture(sku, policy, values = {}) {
  const lot = String(values.lot_number || '').trim();
  const expiration = String(values.expiration_date || '').trim();
  if (!lot) {
    return { ok: false, reason: policy.lot === 'required' ? 'lot_required' : 'lot_capture_required', sku, policy };
  }
  if (!expiration) {
    return { ok: false, reason: policy.expiration === 'required' ? 'expiration_required' : 'expiration_capture_required', sku, policy };
  }
  if (policy.lot === 'required' && isNotApplicable(lot)) {
    return { ok: false, reason: 'lot_actual_value_required', sku, policy };
  }
  if (policy.expiration === 'required' && isNotApplicable(expiration)) {
    return { ok: false, reason: 'expiration_actual_value_required', sku, policy };
  }
  if (isNotApplicable(lot) || isNotApplicable(expiration)) {
    const actor = String(values.received_by || values.actor_id || '').trim();
    const method = String(values.capture_method || '').trim();
    const reason = String(values.not_applicable_reason || '').trim();
    if (!actor || !method || !reason) {
      return { ok: false, reason: 'traceability_na_attestation_required', sku, policy };
    }
  }
  if (policy.serial === 'required' && !String(values.serial_number || '').trim()) {
    return { ok: false, reason: 'serial_required', sku, policy };
  }
  if (policy.udi === 'required' && !String(values.udi || '').trim()) {
    return { ok: false, reason: 'udi_required', sku, policy };
  }
  return { ok: true, sku, policy };
}
