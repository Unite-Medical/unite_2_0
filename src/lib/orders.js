/**
 * Order entry — the front half of the pipeline (PRD-26).
 *
 *   placeOrder() →
 *     1. resolve the org + totals
 *     2. rep authority gate (RBAC) when a rep places for a customer
 *     3. payment gate — allowlist + credit limit (over-limit → hold queue)
 *     4. create order + line items with provenance (source, rep, reorder)
 *     5. hand to the PRD-24 orchestrator runFulfillment() — reserve →
 *        payment → QBO invoice → label → packing slip → multi-recipient
 *        notify, resilient + idempotent (no inline copy to drift)
 *
 * Returns the created order so the UI can navigate to confirmation.
 */

import { db } from './db.js';
import { uid } from './format.js';
import { assertMethodAllowed, TERMS_METHODS } from './paymentMethods.js';
import { assertRepAuthority } from './repAuthority.js';
import { runFulfillment } from './fulfillment.js';

const TERMS_DAYS = { net15: 15, net30: 30, net60: 60, ach: 7, card: 0, wire: 7, mspv: 30 };
export function dueDateFor(terms) {
  return new Date(Date.now() + (TERMS_DAYS[terms] ?? 30) * 86400000).toISOString().slice(0, 10);
}

export async function placeOrder({
  customer, address, items,
  payment_terms = 'net30', payment_method = 'ach',
  po_number = null, ship_method = 'fedex_ground', notes = '',
  order_source = 'catalog', rep_id = null, overrides = {},
  blind_ship = false, ship_identity_id = null, shipping_bill_to = null, carrier_account_id = null, on_behalf_of_org_id = null,
}) {
  if (!items?.length) throw new Error('No items to order.');

  const subtotal = items.reduce((a, b) => a + b.qty * b.unit_price, 0);
  const freight = subtotal > 500 ? 0 : 42;
  const total = +(subtotal + freight).toFixed(2);
  const org = db.get('organizations', customer.org_id)
    || { id: customer.org_id, name: customer.org_name, terms: payment_terms, segment: customer.segment };

  // STEP 2 — rep authority (only when a rep acts for the customer). PRD-26 §9.
  if (rep_id) {
    assertRepAuthority(rep_id, {
      ...overrides,
      place_on_terms: TERMS_METHODS.has(payment_method) ? true : undefined,
    });
  }

  // STEP 3 — payment gate. Off-allowlist is a hard reject (unless a rep with
  // override_payment_gate). Over-limit net-terms routes to a hold/approval
  // queue instead of auto-placing (unless a rep with override_credit_hold).
  let onHold = false;
  let holdReason = null;
  try {
    assertMethodAllowed(org, payment_method, total, {
      repOverride: Boolean(rep_id && overrides.off_allowlist),
    });
  } catch (err) {
    if (err.code === 'over_credit_limit') {
      if (!(rep_id && overrides.over_credit_limit)) { onHold = true; holdReason = 'over_credit_limit'; }
    } else {
      throw err; // method_not_allowed — never place an off-allowlist order
    }
  }

  const id = `UM-${new Date().getFullYear()}-${String(4900 + db.count('orders')).padStart(5, '0')}`;
  db.insert('orders', {
    id,
    customer_id: customer.org_id,
    customer_name: customer.org_name,
    placed_by: customer.user_id,
    placed_at: new Date().toISOString(),
    subtotal: +subtotal.toFixed(2),
    freight,
    tax: 0,
    total,
    payment_terms,
    payment_method,
    payment_status: payment_method === 'card' ? 'pending' : 'invoiced',
    po_number,
    notes,
    status: onHold ? 'credit_hold' : 'processing',
    ship_to_address_id: address?.id || null,
    ship_method,
    segment: customer.segment || org.segment || 'asc',
    contact_email: customer.email || null,
    // PRD-26 provenance
    order_source,
    placed_by_rep_id: rep_id || null,
    reordered_from: overrides.reordered_from || null,
    // PRD-27 blind-ship / ownership routing
    blind_ship: Boolean(blind_ship),
    ship_identity_id: ship_identity_id || null,
    shipping_bill_to: shipping_bill_to || null,
    carrier_account_id: carrier_account_id || null,
    on_behalf_of_org_id: on_behalf_of_org_id || null,
  });

  for (const it of items) {
    db.insert('order_items', {
      id: uid('oi'), order_id: id, sku: it.sku, name: it.name, qty: it.qty,
      unit_price: it.unit_price, ext_price: +(it.qty * it.unit_price).toFixed(2),
    });
  }

  db.insert('audit_log', { id: uid('aud'), kind: 'order.placed', ref_id: id, payload: { total, items: items.length, payment_method, order_source, rep_id, on_hold: onHold } });

  // Credit hold: don't fulfill; queue for admin approval.
  if (onHold) {
    db.insert('audit_log', { id: uid('aud'), kind: 'order.credit_hold', ref_id: id, payload: { total, reason: holdReason } });
    return { order: db.get('orders', id), held: true, reason: holdReason };
  }

  // STEP 5 — hand to the resilient orchestrator. A fulfillment hiccup never
  // un-places the order (it's already persisted); the pipeline retries.
  let result = null;
  try {
    result = await runFulfillment(id);
  } catch (err) {
    db.insert('audit_log', { id: uid('aud'), kind: 'order.fulfillment_error', ref_id: id, payload: { error: err.message } });
  }

  const invoice = db.list('invoices', { where: { order_id: id } })[0];
  return { order: db.get('orders', id), invoice_id: invoice?.id || null, fulfillment: result };
}

/** Approve a credit-hold order: clears the hold and runs fulfillment. */
export async function approveHeldOrder(orderId) {
  const order = db.get('orders', orderId);
  if (!order || order.status !== 'credit_hold') return { ok: false, reason: 'not_on_hold' };
  db.update('orders', orderId, { status: 'processing' });
  db.insert('audit_log', { id: uid('aud'), kind: 'order.credit_hold_approved', ref_id: orderId, payload: {} });
  const result = await runFulfillment(orderId);
  return { ok: true, fulfillment: result };
}
