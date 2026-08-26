import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { logEvent, readRawBody, safeEqual, sendJson } from '../_lib/http.js';

export function normalizeCustomerIoEvent(raw = {}, { receivedAt = new Date() } = {}) {
  const data = raw.data && typeof raw.data === 'object' ? raw.data : {};
  const metric = String(raw.metric || raw.event || 'unknown').toLowerCase();
  const deliveryType = String(raw.delivery_type || raw.object_type || 'email').toLowerCase();
  const kind = metric.startsWith(`${deliveryType}_`) ? metric : `${deliveryType}_${metric}`;
  const seconds = Number(raw.timestamp || raw.created_at || 0);
  const occurredAt = Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds > 100000000000 ? seconds : seconds * 1000).toISOString()
    : new Date(receivedAt).toISOString();
  const prefetched = Boolean(raw.prefetched);
  const proxied = Boolean(raw.proxied);
  const machine = Boolean(raw.machine);
  const fallbackId = crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex').slice(0, 28);
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex');
  return {
    id: String(raw.event_id || raw.id || `cioevt_${fallbackId}`),
    kind,
    metric,
    delivery_type: deliveryType,
    message_id: raw.message_id || raw.delivery_id || data.message_id || data.delivery_id || null,
    outbox_id: raw.unite_outbox_id || raw.message_data?.unite_outbox_id || data.unite_outbox_id || data.message_data?.unite_outbox_id || null,
    recipient: raw.recipient || raw.email_address || raw.email || data.recipient || data.email_address || data.email || null,
    transactional_message_id: raw.transactional_message_id || data.transactional_message_id || null,
    campaign_id: raw.campaign_id || null,
    href: raw.href || null,
    link_id: raw.link_id || null,
    prefetched,
    proxied,
    machine,
    conclusive_human_open: kind === 'email_opened' && !prefetched && !proxied && !machine,
    occurred_at: occurredAt,
    received_at: new Date(receivedAt).toISOString(),
    processing_status: 'received',
    payload_hash: payloadHash,
    raw,
  };
}

export function authorizeCustomerIoWebhook(req, rawBody, { now = Date.now() } = {}) {
  const auth = String(req.headers?.authorization || '');
  const username = process.env.CUSTOMERIO_WEBHOOK_USERNAME;
  const password = process.env.CUSTOMERIO_WEBHOOK_PASSWORD;
  if (username && password && auth.startsWith('Basic ')) {
    const expected = Buffer.from(`${username}:${password}`).toString('base64');
    if (safeEqual(auth.slice(6), expected)) return { ok: true, method: 'basic' };
  }
  const secret = process.env.CUSTOMERIO_WEBHOOK_SIGNING_SECRET;
  const timestamp = String(req.headers?.['x-cio-timestamp'] || '');
  const provided = String(req.headers?.['x-cio-signature'] || '');
  const timestampMs = Number(timestamp) * 1000;
  if (secret && provided && Number.isFinite(timestampMs) && Math.abs(now - timestampMs) <= 5 * 60 * 1000) {
    const expected = crypto.createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody.toString('utf8')}`).digest('hex');
    if (safeEqual(provided, expected)) return { ok: true, method: 'hmac' };
  }
  return { ok: false, reason: 'unauthorized' };
}

export function applyCustomerIoTelemetry(row, event, { now = new Date() } = {}) {
  const priorAt = Date.parse(row.customerio_last_event_at || 0);
  const eventAt = Date.parse(event.occurred_at || 0);
  if (Number.isFinite(priorAt) && Number.isFinite(eventAt) && eventAt < priorAt) return row;
  return {
    ...row,
    customerio_last_metric: event.metric,
    customerio_last_event_at: event.occurred_at,
    customerio_prefetched: event.prefetched,
    customerio_proxied: event.proxied,
    customerio_machine: event.machine,
    updated_at: (now instanceof Date ? now : new Date(now)).toISOString(),
  };
}

export async function correlateCustomerIoEvent(sql, event) {
  const messageId = String(event.message_id || '');
  const outboxId = String(event.outbox_id || '');
  const rows = await sql`SELECT tbl,id,data FROM um_rows
    WHERE tbl IN ('customerio_outbox','gmail_outbox') AND deleted=false
      AND (
        (${messageId}<>'' AND (data->>'provider_message_id'=${messageId} OR data->>'customerio_message_id'=${messageId}))
        OR (${outboxId}<>'' AND id=${outboxId})
      )`;
  for (const row of rows) {
    const updated = applyCustomerIoTelemetry(row.data, event);
    await sql`UPDATE um_rows SET data=${JSON.stringify(updated)}::jsonb,updated_at=now()
      WHERE tbl=${row.tbl} AND id=${row.id}`;
  }
  return rows.length;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  let rawBody;
  let payload;
  try {
    rawBody = await readRawBody(req);
    if (!authorizeCustomerIoWebhook(req, rawBody).ok) return sendJson(res, 401, { error: 'unauthorized' });
    payload = JSON.parse(rawBody.toString('utf8') || '{}');
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof SyntaxError ? 'invalid_json' : 'invalid_payload' });
  }
  const rawEvents = Array.isArray(payload) ? payload : [payload];
  const sql = neon(process.env.DATABASE_URL);
  try {
    let applied = 0;
    let correlated = 0;
    for (const rawEvent of rawEvents) {
      const event = normalizeCustomerIoEvent(rawEvent);
      const inserted = await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        VALUES ('customerio_events',${event.id},${JSON.stringify(event)}::jsonb,false,now())
        ON CONFLICT (tbl,id) DO UPDATE SET updated_at=now()
        RETURNING data`;
      if (!inserted.length) continue;
      const stored = inserted[0].data;
      if (stored.payload_hash && stored.payload_hash !== event.payload_hash) {
        logEvent('hooks.customerio', 'event_id_conflict', { event_id: event.id });
        return sendJson(res, 409, { error: 'event_id_payload_conflict' });
      }
      if (inserted[0].data.processing_status === 'received') applied += 1;
      const matches = await correlateCustomerIoEvent(sql, event);
      correlated += matches;
      const processingStatus = matches ? 'correlated' : 'awaiting_correlation';
      await sql`UPDATE um_rows SET
        data=jsonb_set(jsonb_set(data,'{processing_status}',${JSON.stringify(processingStatus)}::jsonb,true),'{processed_at}',${JSON.stringify(new Date().toISOString())}::jsonb,true),
        updated_at=now()
        WHERE tbl='customerio_events' AND id=${event.id}`;
    }
    logEvent('hooks.customerio', 'processed', { received: rawEvents.length, applied, correlated });
    return sendJson(res, 200, { ok: true, received: rawEvents.length, applied, correlated });
  } catch (error) {
    logEvent('hooks.customerio', 'infrastructure_error', { error: error.message });
    return sendJson(res, 503, { error: 'webhook_persistence_failed' });
  }
}
