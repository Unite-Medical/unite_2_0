/**
 * In-memory webhook event buffer — PRD-01 interim.
 *
 * Verified webhook events are pushed here and exposed via
 * GET /api/hooks/events so the SPA can poll and apply them to its
 * local DB through the existing client-side dispatchers
 * (stripe.handleWebhookEvent, flexport.handleWebhookEvent, ...).
 *
 * This is a warm-instance ring buffer — events survive between
 * invocations on the same instance but not across cold starts.
 * Postgres (PRD-13) replaces this with a durable `webhook_events`
 * table; the consumer contract stays identical.
 */

const MAX_EVENTS = 500;
const buffer = [];
let seq = 0;

export function pushEvent({ source, type, payload, verified }) {
  seq += 1;
  const evt = {
    seq,
    id: `evt_${Date.now().toString(36)}_${seq}`,
    source,
    type,
    verified,
    payload,
    received_at: new Date().toISOString(),
  };
  buffer.push(evt);
  if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
  return evt;
}

export function eventsSince(sinceSeq = 0, { source } = {}) {
  return buffer.filter((e) => e.seq > sinceSeq && (!source || e.source === source));
}
