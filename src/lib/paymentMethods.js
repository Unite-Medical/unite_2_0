/**
 * Pre-approved payment methods — PRD-26 §6.
 *
 * Unite controls, per account, which payment rails a customer may use.
 * Checkout renders only `active` methods; selecting an off-list method is a
 * server-side reject (defense in depth). Net-terms require an active grant and
 * route over-limit orders to a hold queue instead of auto-placing.
 */

import { db } from './db.js';

export const PAYMENT_METHODS = ['card', 'ach', 'wire', 'net15', 'net30', 'net60'];
export const TERMS_METHODS = new Set(['net15', 'net30', 'net60']);

export const METHOD_LABEL = {
  card: 'Credit card', ach: 'ACH', wire: 'Wire transfer',
  net15: 'Net 15', net30: 'Net 30', net60: 'Net 60',
};

/** Active, explicit payment allowlist for an organization. Missing grants fail closed. */
export function approvedMethodsFor(org) {
  if (!org?.id) return [];
  return db.list('account_payment_methods', { where: { org_id: org.id } }).filter((row) => row.status === 'active');
}

export function isMethodAllowed(org, method) {
  return approvedMethodsFor(org).some((m) => m.method === method);
}

/**
 * Enforce the allowlist + credit limit at order time. Throws on violation
 * (caller may catch and route to a hold queue). Returns the matched row.
 *   err.code ∈ { 'method_not_allowed', 'over_credit_limit' }
 */
export function assertMethodAllowed(org, method, orderTotal = 0, { repOverride = false } = {}) {
  const allowed = approvedMethodsFor(org);
  const row = allowed.find((m) => m.method === method);
  if (!row && !repOverride) {
    const err = new Error(`Payment method "${METHOD_LABEL[method] || method}" is not approved for ${org?.name || org?.id}.`);
    err.code = 'method_not_allowed';
    throw err;
  }
  if (TERMS_METHODS.has(method) && row?.credit_limit != null && orderTotal > row.credit_limit) {
    const err = new Error(`Order $${orderTotal.toLocaleString()} exceeds the ${method} credit limit ($${Number(row.credit_limit).toLocaleString()}).`);
    err.code = 'over_credit_limit';
    err.creditHold = true;
    throw err;
  }
  return row || { method, derived: true, override: true };
}

/** Admin authoring of the per-account allowlist. */
export const paymentMethods = {
  forOrg(orgId) { return db.list('account_payment_methods', { where: { org_id: orgId } }); },
  enable({ org_id, method, credit_limit = null, stripe_pm_id = null, approved_by = null }) {
    const existing = db.list('account_payment_methods', { where: { org_id, method } })[0];
    const patch = { org_id, method, status: 'active', credit_limit, stripe_pm_id, approved_by, approved_at: new Date().toISOString() };
    return existing ? db.update('account_payment_methods', existing.id, patch)
      : db.insert('account_payment_methods', { id: `apm_${org_id}_${method}`, ...patch });
  },
  suspend(id) { return db.update('account_payment_methods', id, { status: 'suspended' }); },
  remove(id) { db.remove('account_payment_methods', id); },
  setCreditLimit(id, credit_limit) { return db.update('account_payment_methods', id, { credit_limit }); },
};
