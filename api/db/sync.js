/**
 * Durable persistence — PRD-13 (interim row-store).
 *
 *   GET  /api/db/sync                     → full snapshot { tables: { orders: [rows] } }
 *   GET  /api/db/sync?since=<iso>         → rows changed after <iso> (incremental pull)
 *   POST /api/db/sync { mutations: [...] }→ write-through from the SPA
 *
 * Backed by Neon Postgres over HTTP (`@neondatabase/serverless` — no
 * TCP pooling problems in serverless). The storage model is a single
 * JSONB row-store mirroring the app's table/row shape exactly:
 *
 *   um_rows (tbl, id, data jsonb, updated_at, deleted)
 *
 * Why JSONB instead of the relational blueprints in
 * docs/schema/migrations/? Zero drift: the SPA's runtime rows persist
 * as-is, refreshes/devices share one durable state, and the relational
 * schema remains the contract for the dedicated API tier later
 * (scripts/migrate.mjs applies it when that cutover starts).
 *
 * Auth: requires DB_SYNC_TOKEN; the SPA sends it as x-sync-token
 * (VITE_DB_SYNC_TOKEN). Without both env vars this endpoint answers
 * 503 and the app keeps running on localStorage alone.
 */

import { neon } from '@neondatabase/serverless';
import { readRawBody, sendJson, safeEqual, logEvent } from '../_lib/http.js';

let schemaReady = false;

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS um_rows (
      tbl        TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted    BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (tbl, id)
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_um_rows_updated ON um_rows (updated_at DESC)`;
  schemaReady = true;
}

function authorized(req) {
  const token = process.env.DB_SYNC_TOKEN;
  if (!token) return false;
  const given = req.headers['x-sync-token'];
  return Boolean(given) && safeEqual(given, token);
}

export default async function handler(req, res) {
  const sql = client();
  if (!sql || !process.env.DB_SYNC_TOKEN) {
    return sendJson(res, 503, { error: 'not_configured', hint: 'Set DATABASE_URL + DB_SYNC_TOKEN (and VITE_DB_SYNC_TOKEN for the app) to enable durable persistence.' });
  }
  if (!authorized(req)) return sendJson(res, 401, { error: 'bad_sync_token' });

  try {
    await ensureSchema(sql);

    if (req.method === 'GET') {
      const since = req.query.since ? new Date(req.query.since) : null;
      const rows = since && !Number.isNaN(since.getTime())
        ? await sql`SELECT tbl, id, data, updated_at, deleted FROM um_rows WHERE updated_at > ${since.toISOString()}`
        : await sql`SELECT tbl, id, data, updated_at, deleted FROM um_rows WHERE deleted = false`;
      const tables = {};
      let latest = since ? since.toISOString() : null;
      for (const r of rows) {
        (tables[r.tbl] ||= []).push(since ? { ...r.data, __deleted: r.deleted } : r.data);
        const u = new Date(r.updated_at).toISOString();
        if (!latest || u > latest) latest = u;
      }
      return sendJson(res, 200, { tables, latest, row_count: rows.length });
    }

    if (req.method === 'POST') {
      const raw = await readRawBody(req);
      const { mutations = [] } = JSON.parse(raw.toString('utf8') || '{}');
      if (!Array.isArray(mutations) || mutations.length === 0) {
        return sendJson(res, 400, { error: 'no_mutations' });
      }
      if (mutations.length > 500) return sendJson(res, 413, { error: 'batch_too_large', max: 500 });

      let applied = 0;
      for (const m of mutations) {
        const { table, op, id, row } = m || {};
        if (!table || !id) continue;
        if (op === 'delete') {
          await sql`
            INSERT INTO um_rows (tbl, id, data, deleted, updated_at)
            VALUES (${table}, ${String(id)}, '{}'::jsonb, true, now())
            ON CONFLICT (tbl, id) DO UPDATE SET deleted = true, updated_at = now()`;
        } else {
          await sql`
            INSERT INTO um_rows (tbl, id, data, deleted, updated_at)
            VALUES (${table}, ${String(id)}, ${JSON.stringify(row)}::jsonb, false, now())
            ON CONFLICT (tbl, id) DO UPDATE SET data = EXCLUDED.data, deleted = false, updated_at = now()`;
        }
        applied += 1;
      }
      logEvent('db.sync', 'applied', { mutations: applied });
      return sendJson(res, 200, { ok: true, applied });
    }

    return sendJson(res, 405, { error: 'method_not_allowed' });
  } catch (err) {
    logEvent('db.sync', 'error', { error: err.message });
    return sendJson(res, 500, { error: 'db_error', detail: err.message });
  }
}
