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
import { mailer } from './mailer.js';

const LOCAL_ACCEPTANCE_ALLOWED = typeof window === 'undefined'
  || Boolean(import.meta.env?.DEV)
  || import.meta.env?.VITE_ALLOW_LOCAL_AUTH === 'true';

async function serverAcceptance(body) {
  if (typeof window === 'undefined') return null;
  try {
    const response = await fetch('/api/quotes/acceptance', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return { handled: true, ...payload };
    if (!LOCAL_ACCEPTANCE_ALLOWED || ![404, 503].includes(response.status)) {
      return { handled: true, ok: false, reason: payload.error || 'acceptance_failed' };
    }
  } catch {
    if (!LOCAL_ACCEPTANCE_ALLOWED) return { handled: true, ok: false, reason: 'acceptance_unavailable' };
  }
  return null;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomCode() {
  const values = crypto.getRandomValues(new Uint32Array(1));
  return String(values[0] % 1000000).padStart(6, '0');
}

export function findQuoteByToken(token) {
  if (!token) return null;
  return db.list('quotes', { where: { acceptance_token: token } })[0] || null;
}

export function quoteIsExpired(quote) {
  if (!quote?.valid_until) return false;
  return new Date(quote.valid_until).getTime() < Date.now();
}

export async function requestSignerVerification(token, email, { code = null, now = new Date() } = {}) {
  const server = await serverAcceptance({ action: 'request_verification', token, email });
  if (server?.handled) return server;
  const quote = findQuoteByToken(token);
  if (!quote) return { ok: false, reason: 'not_found' };
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const allowed = new Set([
    String(quote.contact_email || '').trim().toLowerCase(),
    ...(quote.authorized_signer_emails || []).map((value) => String(value).trim().toLowerCase()),
  ].filter(Boolean));
  if (!allowed.has(normalizedEmail)) return { ok: false, reason: 'unauthorized_signer_email' };

  const plainCode = typeof window === 'undefined' && code ? code : randomCode();
  const challenge = db.insert('quote_signer_challenges', {
    id: uid('qsc'), quote_id: quote.id, quote_revision: Number(quote.revision || 1), signer_email: normalizedEmail,
    code_hash: await sha256(plainCode), attempts: 0, verified_at: null,
    consumed_at: null,
    expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    created_at: now.toISOString(),
  });
  await mailer.send({
    to: normalizedEmail,
    subject: `Verification code for quote ${quote.id}`,
    body: `Your Unite Medical quote acceptance code is ${plainCode}. It expires in 10 minutes.`,
    template_key: 'quote/signer_verification', drafted_by: 'quote-system',
  });
  return { ok: true, challenge_id: challenge.id, expires_at: challenge.expires_at };
}

export async function verifySignerCode(challengeId, code, { now = new Date(), token = null, email = null } = {}) {
  if (token && email) {
    const server = await serverAcceptance({ action: 'confirm_verification', token, challenge_id: challengeId, code, email });
    if (server?.handled) return server;
  }
  const challenge = db.get('quote_signer_challenges', challengeId);
  if (!challenge) return { ok: false, reason: 'challenge_not_found' };
  if (challenge.verified_at) return { ok: true, challenge };
  if (new Date(challenge.expires_at).getTime() <= now.getTime()) return { ok: false, reason: 'challenge_expired' };
  if (Number(challenge.attempts || 0) >= 5) return { ok: false, reason: 'challenge_locked' };
  const matches = (await sha256(code)) === challenge.code_hash;
  if (!matches) {
    db.update('quote_signer_challenges', challenge.id, { attempts: Number(challenge.attempts || 0) + 1 });
    return { ok: false, reason: 'invalid_code' };
  }
  const verified = db.update('quote_signer_challenges', challenge.id, { verified_at: now.toISOString() });
  return { ok: true, challenge: verified };
}

/**
 * Accept a quote by its token. Idempotent: a second call returns the
 * already-created order. Returns { ok, reason?, order, quote }.
 */
export async function acceptQuote(token, {
  runPipeline = false,
  acceptedBy = 'customer',
  challengeId = null,
  bindingAcknowledged = false,
  signerName = '',
  signerTitle = '',
  signerEmail = '',
  poNumber = '',
  ipAddress = null,
  userAgent = null,
  now = new Date(),
} = {}) {
  const server = await serverAcceptance({
    action: 'accept', token, challenge_id: challengeId, binding_acknowledged: bindingAcknowledged,
    signer_name: signerName, signer_title: signerTitle, signer_email: signerEmail, po_number: poNumber,
  });
  if (server?.handled) return server;
  const quote = findQuoteByToken(token);
  if (!quote) return { ok: false, reason: 'not_found' };
  if (quote.status === 'accepted' && quote.order_id) {
    return { ok: true, order: db.get('orders', quote.order_id), quote, alreadyAccepted: true };
  }
  if (quoteIsExpired(quote)) return { ok: false, reason: 'expired', quote };

  const items = db.list('quote_items', { where: { quote_id: quote.id } });
  if (!items.length) return { ok: false, reason: 'no_items', quote };

  const challenge = challengeId ? db.get('quote_signer_challenges', challengeId) : null;
  if (!challenge || challenge.quote_id !== quote.id || !challenge.verified_at || challenge.consumed_at
      || Number(challenge.quote_revision || 1) !== Number(quote.revision || 1)
      || new Date(challenge.expires_at).getTime() <= now.getTime()
      || challenge.signer_email !== String(signerEmail || '').trim().toLowerCase()) {
    return { ok: false, reason: 'signer_verification_required', quote };
  }
  if (!bindingAcknowledged) return { ok: false, reason: 'binding_acknowledgment_required', quote };
  if (!String(signerName).trim() || !String(signerTitle).trim()) return { ok: false, reason: 'signer_identity_required', quote };
  if (!String(poNumber).trim()) return { ok: false, reason: 'po_required', quote };

  const acceptedLines = items.map((item) => ({
    id: item.id,
    sku: item.sku || item.gtin || null,
    name: item.name,
    qty: item.target_qty || item.moq || 1,
    unit_price: +(Number(item.sell_per_unit) || 0).toFixed(2),
  }));
  const evidence = {
    signer_name: String(signerName).trim(),
    signer_title: String(signerTitle).trim(),
    signer_email: String(signerEmail).trim().toLowerCase(),
    verification_challenge_id: challenge.id,
    verified_at: challenge.verified_at,
    accepted_at: now.toISOString(),
    quote_revision: quote.revision || 1,
    binding_acknowledged: true,
    disclaimer_version: 'binding-sourced-lines-v1',
    ip_address: ipAddress,
    user_agent: userAgent,
    accepted_lines_hash: await sha256(JSON.stringify(acceptedLines)),
  };

  const orderId = `UM-${now.getFullYear()}-${String(4900 + db.count('orders')).padStart(5, '0')}`;
  const subtotal = items.reduce((a, it) => a + (Number(it.ext_sell) || 0), 0);

  db.insert('orders', {
    id: orderId,
    customer_id: quote.customer_id || null,
    customer_name: quote.customer_name,
    contact_email: quote.contact_email || null,
    placed_at: now.toISOString(),
    subtotal: +subtotal.toFixed(2),
    freight: 0,
    tax: 0,
    total: +(quote.total || subtotal).toFixed(2),
    payment_terms: quote.payment_terms || 'net30',
    payment_method: quote.payment_method || 'ach',
    payment_status: 'pending',
    status: 'payment_pending',
    po_number: String(poNumber).trim(),
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

  db.update('quotes', quote.id, { status: 'accepted', accepted_at: evidence.accepted_at, accepted_by: acceptedBy, acceptance_evidence: evidence, order_id: orderId });
  db.update('quote_signer_challenges', challenge.id, { consumed_at: evidence.accepted_at });
  db.insert('audit_log', { id: uid('aud'), kind: 'quote.accepted', ref_id: quote.id, payload: { order_id: orderId, total: quote.total, evidence } });

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
export async function counterQuote(token, { counters = [], note = '', counteredBy = 'customer' } = {}) {
  const server = await serverAcceptance({ action: 'counter', token, counters, note });
  if (server?.handled) return server;
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
export async function declineQuote(token, { reason = '', declinedBy = 'customer' } = {}) {
  const server = await serverAcceptance({ action: 'decline', token, reason });
  if (server?.handled) return server;
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
export async function requestRefresh(token, { requestedBy = 'customer' } = {}) {
  const server = await serverAcceptance({ action: 'refresh', token });
  if (server?.handled) return server;
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
