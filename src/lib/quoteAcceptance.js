/**
 * Quote acceptance — PRD-16 / PRD-19.
 *
 * Turns a sent quote into a confirmed order from a single tokenized link
 * (`/q/:token`) — no login required, the way a customer actually accepts.
 * On acceptance we create the order + line items, mark the quote
 * accepted, and (optionally) kick the fulfillment orchestrator so the
 * downstream chain (payment → invoice → shipping → notify) runs itself.
 */

import { db } from './db.js';
import { uid } from './format.js';

export function findQuoteByToken(token) {
  if (!token) return null;
  return db.list('quotes', { where: { acceptance_token: token } })[0] || null;
}

export function quoteIsExpired(quote) {
  if (!quote?.valid_until) return false;
  return new Date(quote.valid_until).getTime() < Date.now();
}

/**
 * Accept a quote by its token. Idempotent: a second call returns the
 * already-created order. Returns { ok, reason?, order, quote }.
 */
export async function acceptQuote(token, { runPipeline = false, acceptedBy = 'customer' } = {}) {
  const quote = findQuoteByToken(token);
  if (!quote) return { ok: false, reason: 'not_found' };
  if (quote.status === 'accepted' && quote.order_id) {
    return { ok: true, order: db.get('orders', quote.order_id), quote, alreadyAccepted: true };
  }
  if (quoteIsExpired(quote)) return { ok: false, reason: 'expired', quote };

  const items = db.list('quote_items', { where: { quote_id: quote.id } });
  if (!items.length) return { ok: false, reason: 'no_items', quote };

  const orderId = `UM-${new Date().getFullYear()}-${String(4900 + db.count('orders')).padStart(5, '0')}`;
  const subtotal = items.reduce((a, it) => a + (Number(it.ext_sell) || 0), 0);

  db.insert('orders', {
    id: orderId,
    customer_id: quote.customer_id || null,
    customer_name: quote.customer_name,
    contact_email: quote.contact_email || null,
    placed_at: new Date().toISOString(),
    subtotal: +subtotal.toFixed(2),
    freight: 0,
    tax: 0,
    total: +(quote.total || subtotal).toFixed(2),
    payment_terms: quote.payment_terms || 'net30',
    payment_method: quote.payment_method || 'ach',
    payment_status: 'invoiced',
    status: 'processing',
    segment: quote.segment || 'asc',
    source: 'quote_acceptance',
    quote_id: quote.id,
  });

  for (const it of items) {
    const qty = it.target_qty || it.moq || 1;
    db.insert('order_items', {
      id: uid('oi'),
      order_id: orderId,
      sku: it.sku || it.gtin || `Q-${quote.id}-${it.id}`,
      name: it.name,
      qty,
      unit_price: +(Number(it.sell_per_unit) || 0).toFixed(2),
      ext_price: +((Number(it.sell_per_unit) || 0) * qty).toFixed(2),
    });
  }

  db.update('quotes', quote.id, { status: 'accepted', accepted_at: new Date().toISOString(), accepted_by: acceptedBy, order_id: orderId });
  db.insert('audit_log', { id: uid('aud'), kind: 'quote.accepted', ref_id: quote.id, payload: { order_id: orderId, total: quote.total } });

  if (runPipeline) {
    try {
      const { runFulfillment } = await import('./fulfillment.js');
      await runFulfillment(orderId);
    } catch { /* orchestrator failures don't block acceptance */ }
  }

  return { ok: true, order: db.get('orders', orderId), quote: db.get('quotes', quote.id) };
}
