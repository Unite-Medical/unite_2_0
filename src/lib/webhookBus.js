/**
 * Webhook event bus — PRD-20.
 *
 * Hardens the interim webhook bridge into a real event pipeline:
 *   - idempotency: every event is keyed by (source, event_id); a
 *     duplicate is recorded once and never re-applied
 *   - durable log: all events land in the `webhook_events` table with
 *     status (received → processing → processed | failed | dead)
 *   - retry with exponential backoff: failed events are re-attempted on
 *     a schedule until they succeed or exhaust attempts
 *   - dead-letter queue: exhausted events are parked as `dead` for an
 *     operator to inspect + replay from /admin/webhooks
 *
 * Dispatch reuses the same client-side handlers the bridge always used,
 * so behavior is identical — just observable, deduplicated, and durable.
 */

import { db } from './db.js';
import { uid } from './format.js';
import { warn } from './external/_http.js';
import { stripe } from './external/stripe.js';
import { flexport } from './external/flexport.js';
import { shipstation } from './external/shipstation.js';
import { shopify } from './external/shopify.js';
import { fathom } from './external/fathom.js';
import { calendly } from './external/calendly.js';
import { markDelivered } from './fulfillment.js';

// Backoff schedule in ms (attempt 1 immediate, then escalating).
const BACKOFF_MS = [0, 30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length;

function eventKey(evt) {
  return evt.event_id
    || evt.id
    || (evt.payload && (evt.payload.id || evt.payload.event_id))
    || `${evt.source}:${evt.type}:${evt.seq ?? ''}`;
}

async function dispatch(evt) {
  const { source, payload, type } = evt;
  if (source === 'stripe') return stripe.handleWebhookEvent(payload);
  if (source === 'flexport') return flexport.handleWebhookEvent(payload);
  if (source === 'shipstation') {
    const res = await shipstation.handleWebhookEvent(payload?.notice || payload);
    // Carrier "delivered" closes the fulfillment pipeline's final step.
    const isDelivered = /deliver/i.test(type || '') || /deliver/i.test(payload?.notice?.resource_type || '');
    const orderId = payload?.order_id || payload?.notice?.order_id || res?.order_id;
    if (isDelivered && orderId) { try { markDelivered(orderId); } catch { /* non-fatal */ } }
    return res;
  }
  if (source === 'shopify') return shopify.handleWebhookEvent(payload);
  if (source === 'fathom') return fathom.handleCallCompleted(payload);
  if (source === 'calendly') return calendly.handleWebhookEvent(payload);
  throw new Error(`unknown_source_${source}`);
}

/**
 * Record an event (idempotent). Returns { row, duplicate }. Does NOT
 * process — call processEvent / processDue for that.
 */
export function recordEvent(evt) {
  const key = eventKey(evt);
  const existing = db.list('webhook_events', { where: { source: evt.source, event_id: key } })[0];
  if (existing) return { row: existing, duplicate: true };
  const row = db.insert('webhook_events', {
    id: uid('wh'),
    source: evt.source,
    event_id: key,
    type: evt.type || 'unknown',
    seq: evt.seq ?? null,
    payload: evt.payload ?? evt,
    status: 'received',
    attempts: 0,
    last_error: null,
    next_retry_at: new Date().toISOString(),
    received_at: new Date().toISOString(),
  });
  return { row, duplicate: false };
}

/** Process a single recorded event row through dispatch + retry bookkeeping. */
export async function processEvent(rowId) {
  const row = db.get('webhook_events', rowId);
  if (!row || row.status === 'processed' || row.status === 'dead') return row;

  db.update('webhook_events', rowId, { status: 'processing' });
  try {
    const result = await dispatch(row);
    return db.update('webhook_events', rowId, {
      status: 'processed', processed_at: new Date().toISOString(),
      attempts: row.attempts + 1, last_error: null, result: summarize(result),
    });
  } catch (err) {
    const attempts = row.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
    warn('webhookBus', `${row.source}/${row.type} attempt ${attempts} failed: ${err.message}`);
    return db.update('webhook_events', rowId, {
      status: exhausted ? 'dead' : 'failed',
      attempts,
      last_error: err.message,
      next_retry_at: exhausted ? null : new Date(Date.now() + delay).toISOString(),
      dead_at: exhausted ? new Date().toISOString() : null,
    });
  }
}

function summarize(result) {
  if (result == null) return null;
  if (typeof result === 'object') {
    try { return JSON.parse(JSON.stringify(result)); } catch { return { ok: true }; }
  }
  return { value: String(result) };
}

/** Ingest (record + immediately process) a freshly-received event. */
export async function ingestEvent(evt) {
  const { row, duplicate } = recordEvent(evt);
  if (duplicate) return { ...row, duplicate: true };
  await processEvent(row.id);
  return db.get('webhook_events', row.id);
}

/** Process every event that's due for (re)attempt. Returns count processed. */
export async function processDue() {
  const now = Date.now();
  const due = db.list('webhook_events')
    .filter((e) => (e.status === 'received' || e.status === 'failed')
      && e.next_retry_at && new Date(e.next_retry_at).getTime() <= now);
  let processed = 0;
  for (const e of due) { await processEvent(e.id); processed += 1; }
  return processed;
}

/** Operator action: replay a dead/failed event from /admin/webhooks. */
export async function replayEvent(rowId) {
  const row = db.get('webhook_events', rowId);
  if (!row) return null;
  db.update('webhook_events', rowId, { status: 'received', attempts: 0, last_error: null, dead_at: null, next_retry_at: new Date().toISOString() });
  return processEvent(rowId);
}

export function deadLetters() {
  return db.list('webhook_events', { where: { status: 'dead' }, orderBy: 'received_at', dir: 'desc' });
}

export function busStats() {
  const all = db.list('webhook_events');
  const by = (s) => all.filter((e) => e.status === s).length;
  return {
    total: all.length,
    received: by('received'),
    processed: by('processed'),
    failed: by('failed'),
    dead: by('dead'),
  };
}
