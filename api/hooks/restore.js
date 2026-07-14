/**
 * Restore Robotics savings-bridge receiver — PRD-28 §Robotics.
 *
 *   POST /api/hooks/restore
 *   Header: X-Restore-Signature: <hmac-sha256 of raw body, hex or base64>
 *
 * Brad's side pushes a snapshot whenever the number moves (or on a
 * schedule — either works; the endpoint is idempotent and last-write-
 * wins). Site visitors NEVER touch Restore's servers: the snapshot is
 * persisted in our Postgres and served from the CDN-cached
 * GET /api/metrics/savings.
 *
 * Expected payload (minimum):
 *   { "total_savings_usd": 912345.67, "as_of": "2026-07-14T00:00:00Z" }
 * Optional extras we'll store verbatim if present:
 *   { "instrument_count": 1234, "hospital_count": 7, "breakdown": {...} }
 *
 * Env: RESTORE_WEBHOOK_SECRET (shared with Brad out-of-band).
 */

import { neon } from '@neondatabase/serverless';
import { readRawBody, sendJson, verifyHmacSignature, logEvent } from '../_lib/http.js';

let schemaReady = false;

async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS um_metrics (
      key        TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  schemaReady = true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  const secret = process.env.RESTORE_WEBHOOK_SECRET;
  if (!secret) return sendJson(res, 503, { error: 'not_configured' });

  const raw = await readRawBody(req);
  const payload = raw.toString('utf8');
  const check = verifyHmacSignature({
    header: req.headers['x-restore-signature'] || req.headers['x-signature'],
    payload,
    secret,
  });
  if (!check.ok) {
    logEvent('hooks.restore', 'rejected', { reason: check.reason });
    return sendJson(res, 400, { error: 'signature_verification_failed', reason: check.reason });
  }

  let body;
  try {
    body = JSON.parse(payload);
  } catch {
    return sendJson(res, 400, { error: 'invalid_json' });
  }

  const total = Number(body.total_savings_usd);
  if (!Number.isFinite(total) || total < 0) {
    return sendJson(res, 422, { error: 'total_savings_usd_required' });
  }

  const url = process.env.DATABASE_URL;
  if (!url) return sendJson(res, 503, { error: 'no_database' });
  const sql = neon(url);
  await ensureSchema(sql);

  const snapshot = {
    total_savings_usd: total,
    as_of: body.as_of || new Date().toISOString(),
    ...(body.instrument_count != null ? { instrument_count: Number(body.instrument_count) } : {}),
    ...(body.hospital_count != null ? { hospital_count: Number(body.hospital_count) } : {}),
    ...(body.breakdown ? { breakdown: body.breakdown } : {}),
    received_at: new Date().toISOString(),
  };

  await sql`
    INSERT INTO um_metrics (key, data, updated_at)
    VALUES ('restore_savings', ${JSON.stringify(snapshot)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;

  logEvent('hooks.restore', 'accepted', { total, as_of: snapshot.as_of });
  sendJson(res, 200, { received: true, total_savings_usd: total });
}
