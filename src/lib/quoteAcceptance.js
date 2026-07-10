/**
 * Quote acceptance — PRD-16 / PRD-19.
 *
 * Turns a sent quote into a confirmed order from a single tokenized link
 * (`/q/:token`) — no login required, the way a customer actually accepts.
 * On acceptance we create the order + line items, mark the quote
 * accepted, and (optionally) kick the fulfillment orchestrator so the
 * downstream chain (payment → invoice → shipping → notify) runs itself.
 *
 * PRD-16 Phase 7 adds the other three verbs a customer has:
 *   counterQuote    — per-line counter prices → desk review queue
 *   declineQuote    — decline with reason capture
 *   requestRefresh  — expired quote → rep re-runs freight + validity
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

  // GUDID spec §6 — UDI is a post-quote / pre-production gate, opened on
  // order commit for import/private-label lines. Never blocks acceptance.
  try {
    const { openUdiGateForOrder } = await import('./gudid.js');
    openUdiGateForOrder({
      order_id: orderId,
      quote_id: quote.id,
      customer_name: quote.customer_name,
      lines: items.map((it) => ({
        id: it.id,
        sku: it.sku || null,
        gtin: it.gtin || null,
        name: it.name,
        brand: it.brand || null,
        private_label: Boolean(it.offer_variant === 'import-custom' || it.private_label),
        import_line: Boolean(it.hts_code || it.origin_country),
      })),
    });
  } catch { /* gate failures never block acceptance */ }

  if (runPipeline) {
    try {
      const { runFulfillment } = await import('./fulfillment.js');
      await runFulfillment(orderId);
    } catch { /* orchestrator failures don't block acceptance */ }
  }

  return { ok: true, order: db.get('orders', orderId), quote: db.get('quotes', quote.id) };
}

/**
 * Customer counters one or more lines. `counters`: [{ item_id, price }].
 * Stores the ask on each line, flips the quote to 'countered', and drops
 * a task in the desk queue so a human responds.
 */
export function counterQuote(token, { counters = [], note = '', counteredBy = 'customer' } = {}) {
  const quote = findQuoteByToken(token);
  if (!quote) return { ok: false, reason: 'not_found' };
  if (quote.status === 'accepted') return { ok: false, reason: 'already_accepted', quote };
  if (quoteIsExpired(quote)) return { ok: false, reason: 'expired', quote };

  const valid = (counters || []).filter((c) => c.item_id && Number(c.price) > 0);
  if (!valid.length) return { ok: false, reason: 'no_counters', quote };

  for (const c of valid) {
    const item = db.get('quote_items', c.item_id);
    if (!item || item.quote_id !== quote.id) continue;
    db.update('quote_items', c.item_id, { counter_price: +Number(c.price).toFixed(2), counter_applied: false });
  }

  db.update('quotes', quote.id, { status: 'countered', counter_note: note || null, countered_at: new Date().toISOString() });
  db.insert('tasks', {
    id: uid('task'),
    kind: 'quote_counter',
    ref_id: quote.id,
    title: `Counter-offer on ${quote.id} — ${quote.customer_name}`,
    detail: note || `${valid.length} line(s) countered.`,
    status: 'open',
  });
  db.insert('audit_log', { id: uid('aud'), kind: 'quote.countered', ref_id: quote.id, payload: { by: counteredBy, lines: valid.length, note: (note || '').slice(0, 300) } });
  return { ok: true, quote: db.get('quotes', quote.id) };
}

/** Customer declines the quote, with reason capture (PRD-16 Phase 7). */
export function declineQuote(token, { reason = '', declinedBy = 'customer' } = {}) {
  const quote = findQuoteByToken(token);
  if (!quote) return { ok: false, reason: 'not_found' };
  if (quote.status === 'accepted') return { ok: false, reason: 'already_accepted', quote };

  db.update('quotes', quote.id, { status: 'declined', decline_reason: reason || null, declined_at: new Date().toISOString() });
  db.insert('audit_log', { id: uid('aud'), kind: 'quote.declined', ref_id: quote.id, payload: { by: declinedBy, reason: (reason || '').slice(0, 300) } });
  return { ok: true, quote: db.get('quotes', quote.id) };
}

/**
 * Customer asks for refreshed pricing on an expired quote. Queues the
 * refresh for the desk — the rep runs `refreshQuote` (new freight, new
 * validity window) and the same acceptance link comes back to life.
 */
export function requestRefresh(token, { requestedBy = 'customer' } = {}) {
  const quote = findQuoteByToken(token);
  if (!quote) return { ok: false, reason: 'not_found' };
  if (quote.status === 'accepted') return { ok: false, reason: 'already_accepted', quote };
  if (quote.refresh_requested_at) return { ok: true, quote, alreadyRequested: true };

  db.update('quotes', quote.id, { refresh_requested_at: new Date().toISOString() });
  db.insert('tasks', {
    id: uid('task'),
    kind: 'quote_refresh',
    ref_id: quote.id,
    title: `Refresh requested on ${quote.id} — ${quote.customer_name}`,
    detail: 'Customer requested updated pricing on an expired quote.',
    status: 'open',
  });
  db.insert('audit_log', { id: uid('aud'), kind: 'quote.refresh_requested', ref_id: quote.id, payload: { by: requestedBy } });
  return { ok: true, quote: db.get('quotes', quote.id) };
}
