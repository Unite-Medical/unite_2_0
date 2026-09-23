import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
function stableId(source, type, payload) {
  const upstream = payload?.id || payload?.event_id || payload?.webhook_id
    || payload?.data?.id || payload?.data?.recording_id || payload?.notice?.resource_url || null;
  const basis = upstream ? `${source}:${upstream}` : `${source}:${type}:${JSON.stringify(canonical(payload))}`;
  return `whe_${crypto.createHash('sha256').update(basis).digest('hex').slice(0, 28)}`;
}

export function buildWebhookEvent({ source, type, payload, verified, now = new Date() } = {}) {
  if (!source || !type || verified !== true) throw new Error('verified_webhook_event_required');
  const receivedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  return {
    id: stableId(source, type, payload), source, type, verified: true, payload,
    status: 'pending', attempts: 0, received_at: receivedAt, updated_at: receivedAt,
    claimed_at: null, processed_at: null, last_error: null,
  };
}

export async function pushEvent(input, { sql: suppliedSql } = {}) {
  if (!suppliedSql && !process.env.DATABASE_URL) throw new Error('webhook_storage_not_configured');
  const sql = suppliedSql || neon(process.env.DATABASE_URL);
  const event = buildWebhookEvent(input);
  const inserted = await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
    VALUES ('webhook_events',${event.id},${JSON.stringify(event)}::jsonb,false,now())
    ON CONFLICT (tbl,id) DO NOTHING RETURNING data`;
  if (inserted.length) return { ...event, duplicate: false };
  const existing = await sql`SELECT data FROM um_rows WHERE tbl='webhook_events' AND id=${event.id} AND deleted=false LIMIT 1`;
  if (!existing[0]?.data) throw new Error('webhook_event_persistence_failed');
  return { ...existing[0].data, duplicate: true };
}

export async function eventsSince(sql, since = null, { source } = {}) {
  const cursor = since && !Number.isNaN(new Date(since).getTime()) ? new Date(since).toISOString() : new Date(0).toISOString();
  const rows = source
    ? await sql`SELECT data,updated_at FROM um_rows WHERE tbl='webhook_events' AND deleted=false
        AND updated_at>${cursor}::timestamptz AND data->>'source'=${source} ORDER BY updated_at ASC LIMIT 200`
    : await sql`SELECT data,updated_at FROM um_rows WHERE tbl='webhook_events' AND deleted=false
        AND updated_at>${cursor}::timestamptz ORDER BY updated_at ASC LIMIT 200`;
  return rows.map((row) => ({
    id: row.data.id, source: row.data.source, type: row.data.type,
    status: row.data.status, attempts: Number(row.data.attempts || 0),
    received_at: row.data.received_at, processed_at: row.data.processed_at || null,
    last_error: row.data.last_error || null, cursor: new Date(row.updated_at).toISOString(),
  }));
}
