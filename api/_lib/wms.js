/**
 * Server-authoritative WMS ledger ops (PRD-25 §4.3).
 *
 * The browser POSTs intents to api/wms/*; the server validates and ledgers
 * them so stock can never be tampered client-side. Writes go to the same
 * durable JSONB row-store (`um_rows`) the SPA mirrors through /api/db/sync, so
 * server-posted movements propagate back to every client on the next pull.
 *
 * The append-only ledger contract is preserved here too: a movement insert and
 * the inventory projection update happen together, and `on_hand` is only ever
 * written by postMovement().
 */

import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { sendJson, safeEqual, readRawBody, logEvent } from './http.js';

const VALID_REASONS = new Set([
  'receipt', 'ship', 'adjust_damage', 'adjust_loss', 'found', 'transfer_out',
  'transfer_in', 'count_variance', 'reservation_commit', 'return_restock', 'opening_count',
]);

export function wmsClient() {
  const url = process.env.DATABASE_URL;
  return url ? neon(url) : null;
}

export function wmsAuthorized(req) {
  const token = process.env.DB_SYNC_TOKEN;
  if (!token) return false;
  const given = req.headers['x-sync-token'];
  return Boolean(given) && safeEqual(given, token);
}

function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`; }

async function upsertRow(sql, tbl, id, data) {
  await sql`
    INSERT INTO um_rows (tbl, id, data, deleted, updated_at)
    VALUES (${tbl}, ${String(id)}, ${JSON.stringify(data)}::jsonb, false, now())
    ON CONFLICT (tbl, id) DO UPDATE SET data = EXCLUDED.data, deleted = false, updated_at = now()`;
}

async function findOne(sql, tbl, key, value) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl = ${tbl} AND deleted = false AND data->>${key} = ${String(value)} LIMIT 1`;
  return rows[0]?.data || null;
}

/**
 * Post a movement server-side: idempotency check → append movement → update
 * inventory projection → audit, all against um_rows.
 */
export async function postMovement(sql, m = {}) {
  const { sku, warehouse_id, reason, ref_type = null, ref_id = null, lot_id = null, unit_cost = null, actor_id = null, idempotency_key = null, note = null } = m;
  const qty_delta = Number(m.qty_delta);

  if (!sku) return { ok: false, reason: 'missing_sku' };
  if (!warehouse_id) return { ok: false, reason: 'missing_warehouse_id' };
  if (!Number.isInteger(qty_delta) || qty_delta === 0) return { ok: false, reason: 'invalid_qty_delta' };
  if (!reason || !VALID_REASONS.has(reason)) return { ok: false, reason: 'invalid_reason' };

  if (idempotency_key) {
    const prior = await sql`SELECT data FROM um_rows WHERE tbl = 'stock_movements' AND deleted = false AND data->>'idempotency_key' = ${idempotency_key} LIMIT 1`;
    if (prior[0]) return { ok: true, duplicate: true, movement: prior[0].data };
  }

  const movId = rid('mov');
  const movement = {
    id: movId, occurred_at: new Date().toISOString(), product_sku: sku, sku, warehouse_id,
    bin_id: m.bin_id || null, lot_id, qty_delta, reason, ref_type, ref_id, unit_cost, actor_id, idempotency_key, note,
  };
  await upsertRow(sql, 'stock_movements', movId, movement);

  const existing = await findOne(sql, 'inventory', 'sku', sku);
  // narrow to warehouse
  let invRow = null;
  if (existing && existing.warehouse_id === warehouse_id) invRow = existing;
  if (!invRow) {
    const rows = await sql`SELECT data FROM um_rows WHERE tbl='inventory' AND deleted=false AND data->>'sku'=${sku} AND data->>'warehouse_id'=${warehouse_id} LIMIT 1`;
    invRow = rows[0]?.data || null;
  }
  let on_hand;
  if (invRow) {
    on_hand = (Number(invRow.on_hand) || 0) + qty_delta;
    await upsertRow(sql, 'inventory', invRow.id, { ...invRow, on_hand, updated_at: new Date().toISOString() });
  } else {
    on_hand = qty_delta;
    const invId = `inv_${String(warehouse_id).replace(/^wh_/, '')}_${sku}`;
    await upsertRow(sql, 'inventory', invId, { id: invId, sku, warehouse_id, on_hand, reserved: 0, reorder_at: 0, reorder_qty: 0 });
  }

  const audId = rid('aud');
  await upsertRow(sql, 'audit_log', audId, { id: audId, kind: `wms.${reason}`, ref_id: ref_id || movId, payload: { movement_id: movId, sku, warehouse_id, qty_delta, on_hand } });

  return { ok: true, movement, on_hand };
}

/**
 * Standard guarded entrypoint for the api/wms/* POST routes.
 * Handles method + auth + config + body parsing, then calls `run(sql, body)`.
 */
export async function handleWmsRoute(req, res, run) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const sql = wmsClient();
  if (!sql || !process.env.DB_SYNC_TOKEN) {
    return sendJson(res, 503, { error: 'not_configured', hint: 'Set DATABASE_URL + DB_SYNC_TOKEN to enable server-authoritative WMS writes.' });
  }
  if (!wmsAuthorized(req)) return sendJson(res, 401, { error: 'bad_sync_token' });
  try {
    const raw = await readRawBody(req);
    const body = JSON.parse(raw.toString('utf8') || '{}');
    await sql`CREATE TABLE IF NOT EXISTS um_rows (tbl TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted BOOLEAN NOT NULL DEFAULT false, PRIMARY KEY (tbl, id))`;
    const result = await run(sql, body);
    return sendJson(res, result?.ok === false ? 400 : 200, result);
  } catch (err) {
    logEvent('wms', 'error', { route: req.url, error: err.message });
    return sendJson(res, 500, { error: 'wms_error', detail: err.message });
  }
}
