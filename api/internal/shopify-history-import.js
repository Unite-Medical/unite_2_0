import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { readRawBody, sendJson } from '../_lib/http.js';
import { isAuthorizedSnapshotRequest } from './shopify-snapshot.js';

const TOKEN_KEY = ['SHOPIFY', 'SNAPSHOT', 'EXPORT', 'TOKEN'].join('_');

function sha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function protectedDeploymentHost(req) {
  return String(req.headers?.host || '').split(':')[0].toLowerCase().endsWith('.vercel.app');
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!protectedDeploymentHost(req) || !isAuthorizedSnapshotRequest(req.headers, process.env[TOKEN_KEY])) return sendJson(res, 404, { error: 'not_found' });
  const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
  if (!sql) return sendJson(res, 503, { error: 'database_not_configured' });
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT data->>'entity' AS entity, COUNT(*)::int AS count FROM um_rows WHERE tbl='shopify_history_rows' AND deleted=false GROUP BY data->>'entity' ORDER BY entity`;
      return sendJson(res, 200, { ok: true, counts: Object.fromEntries(rows.map((row) => [row.entity, Number(row.count)])), total: rows.reduce((sum, row) => sum + Number(row.count), 0) });
    }
    const { run_id, records = [], reset_entity = null } = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    if (reset_entity) {
      if (!run_id || !['inventory_snapshot'].includes(reset_entity)) return sendJson(res, 400, { error: 'invalid_reset' });
      return sendJson(res,409,{error:'retained_snapshot_use_new_run_id'});
    }
    if (!run_id || !Array.isArray(records) || records.length < 1 || records.length > 250) return sendJson(res, 400, { error: 'invalid_import_batch' });
    await sql`CREATE TABLE IF NOT EXISTS um_rows (tbl TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted BOOLEAN NOT NULL DEFAULT false, PRIMARY KEY (tbl, id))`;
    let applied = 0;
    for (const record of records) {
      if (!record?.entity || !record?.source_id || !record?.payload) continue;
      const id = `shopify:${run_id}:${record.entity}:${record.source_id}`;
      const row = { id, run_id, entity: record.entity, source_id: String(record.source_id), imported_at: new Date().toISOString(), payload_sha256: sha(record.payload), payload: record.payload };
      await sql`INSERT INTO um_rows (tbl, id, data, deleted, updated_at) VALUES ('shopify_history_rows', ${id}, ${JSON.stringify(row)}::jsonb, false, now()) ON CONFLICT (tbl, id) DO UPDATE SET data=EXCLUDED.data, deleted=false, updated_at=now()`;
      applied += 1;
    }
    return sendJson(res, 200, { ok: true, run_id, applied });
  } catch (error) {
    return sendJson(res, 500, { error: 'shopify_history_import_failed', detail: error.message });
  }
}
