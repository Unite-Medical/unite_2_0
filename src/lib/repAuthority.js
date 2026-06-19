/**
 * Rep order-entry authority — PRD-26 §9 (RBAC, extends PRD-14 team roles).
 *
 * A rep can place an order for an assigned customer, but what they may change
 * is gated by admin-granted permissions. Every override writes an audit_log
 * entry; attempts beyond a rep's grant are rejected (403) and logged.
 *
 * Default new-rep profile: `place_order` only.
 */

import { db } from './db.js';
import { uid } from './format.js';

export const GRANTS = [
  'place_order', 'price_override', 'discount', 'shipping_override',
  'add_payment_method', 'place_on_terms', 'override_credit_hold', 'override_payment_gate',
];

export const GRANT_LABEL = {
  place_order: 'Create an order for an assigned customer',
  price_override: 'Override unit price (within optional floor)',
  discount: 'Apply a discount up to a cap',
  shipping_override: 'Change ship method / adjust freight',
  add_payment_method: 'Add a payment method to the order',
  place_on_terms: 'Place on net-terms / bill later',
  override_credit_hold: 'Place even when over credit limit',
  override_payment_gate: 'Use a method not on the account allowlist',
};

export function grantsFor(repId) {
  return db.list('rep_order_grants', { where: { rep_id: repId } });
}
export function hasGrant(repId, grant) {
  return grantsFor(repId).some((g) => g.grant === grant);
}

/**
 * Enforce a rep's authority for a set of requested overrides. Throws (403)
 * + logs the denied attempt on any violation; logs the granted overrides
 * otherwise.
 *
 * overrides: {
 *   price_override?: bool, discount_pct?: number, shipping_override?: bool,
 *   add_payment_method?: bool, place_on_terms?: bool,
 *   over_credit_limit?: bool, off_allowlist?: bool
 * }
 */
export function assertRepAuthority(repId, overrides = {}) {
  const grants = grantsFor(repId);
  const has = (g) => grants.some((x) => x.grant === g);
  const violations = [];

  if (!has('place_order')) violations.push('place_order');
  if (overrides.price_override && !has('price_override')) violations.push('price_override');
  if (overrides.discount_pct != null && overrides.discount_pct > 0) {
    const g = grants.find((x) => x.grant === 'discount');
    if (!g) violations.push('discount');
    else if (g.max_discount_pct != null && overrides.discount_pct > g.max_discount_pct) violations.push(`discount>${g.max_discount_pct}%`);
  }
  if (overrides.shipping_override && !has('shipping_override')) violations.push('shipping_override');
  if (overrides.add_payment_method && !has('add_payment_method')) violations.push('add_payment_method');
  if (overrides.place_on_terms && !has('place_on_terms')) violations.push('place_on_terms');
  if (overrides.over_credit_limit && !has('override_credit_hold')) violations.push('override_credit_hold');
  if (overrides.off_allowlist && !has('override_payment_gate')) violations.push('override_payment_gate');

  const requested = Object.entries(overrides).filter(([, v]) => v != null && v !== false);
  if (violations.length) {
    db.insert('audit_log', { id: uid('aud'), kind: 'rep.authority_denied', ref_id: repId, payload: { overrides, violations } });
    const err = new Error(`Rep lacks authority: ${violations.join(', ')}`);
    err.code = 'rep_authority';
    err.violations = violations;
    throw err;
  }
  if (requested.length) {
    db.insert('audit_log', { id: uid('aud'), kind: 'rep.override', ref_id: repId, payload: { overrides: Object.fromEntries(requested) } });
  }
  return true;
}

/** Admin authoring of the per-rep grant matrix at /admin/team. */
export const repAuthority = {
  grantsFor,
  hasGrant,
  grant({ rep_id, grant, max_discount_pct = null, price_floor_pct = null, granted_by = null }) {
    if (!GRANTS.includes(grant)) throw new Error(`Unknown grant ${grant}`);
    const existing = db.list('rep_order_grants', { where: { rep_id, grant } })[0];
    const patch = { rep_id, grant, max_discount_pct, price_floor_pct, granted_by, granted_at: new Date().toISOString() };
    return existing ? db.update('rep_order_grants', existing.id, patch)
      : db.insert('rep_order_grants', { id: `rog_${rep_id}_${grant}`, ...patch });
  },
  revoke(rep_id, grant) {
    const existing = db.list('rep_order_grants', { where: { rep_id, grant } })[0];
    if (existing) db.remove('rep_order_grants', existing.id);
  },
};
