/**
 * UniteWMS — cycle counts & stock takes (PRD-25 Phase 4, §7).
 *
 *   open → (record counts) → post (variances → ledger) → closed
 *
 * A count session snapshots system on_hand per sku, captures the physical
 * counted qty, and posts the variance as a `count_variance` ledger movement so
 * on_hand reconciles to reality through the ledger (never a direct write).
 */

import { db } from '../db.js';
import { uid } from '../format.js';
import { ledger } from './ledger.js';

function num(v) { return Number(v) || 0; }

/**
 * Open a count session for a warehouse. Snapshots system_qty per sku from the
 * current inventory projection. `skus` optionally narrows the scope.
 */
export function openCount({ warehouse_id, skus = null, started_by = 'counter' }) {
  if (!warehouse_id) return { ok: false, reason: 'missing_warehouse' };
  const id = uid('cnt');
  db.insert('count_sessions', { id, warehouse_id, status: 'open', started_by, started_at: new Date().toISOString() });
  const rows = db.list('inventory', { where: { warehouse_id } })
    .filter((r) => !skus || skus.includes(r.sku));
  for (const r of rows) {
    db.insert('count_lines', { id: uid('cl'), session_id: id, product_sku: r.sku, sku: r.sku, bin_id: r.bin_id || null, system_qty: num(r.on_hand), counted_qty: null, variance: null });
  }
  return { ok: true, session_id: id, lines: rows.length };
}

/** Record a physical count for one sku in a session. */
export function recordCount(sessionId, sku, counted_qty) {
  const line = db.list('count_lines', { where: { session_id: sessionId, sku } })[0];
  if (!line) return { ok: false, reason: 'line_not_found' };
  const counted = num(counted_qty);
  const updated = db.update('count_lines', line.id, { counted_qty: counted, variance: counted - num(line.system_qty) });
  return { ok: true, line: updated };
}

/**
 * Post a count session: every counted line with a non-zero variance posts a
 * `count_variance` movement (idempotent per line), then the session closes.
 *
 * @returns {{ok:boolean, posted:number, net_variance:number}}
 */
export function postCount(sessionId, { actor_id = 'counter' } = {}) {
  const session = db.get('count_sessions', sessionId);
  if (!session) return { ok: false, reason: 'session_not_found' };
  if (session.status === 'closed') return { ok: true, posted: 0, net_variance: 0, noop: true };

  let posted = 0;
  let net = 0;
  for (const line of db.list('count_lines', { where: { session_id: sessionId } })) {
    if (line.counted_qty == null) continue;
    const variance = num(line.counted_qty) - num(line.system_qty);
    if (variance === 0) continue;
    ledger.post({
      sku: line.sku, warehouse_id: session.warehouse_id, qty_delta: variance, reason: ledger.REASONS.COUNT_VARIANCE,
      ref_type: 'count', ref_id: sessionId, bin_id: line.bin_id || null, actor_id,
      idempotency_key: `count:${sessionId}:${line.id}`, note: `Cycle count variance (${variance > 0 ? '+' : ''}${variance})`,
    });
    posted += 1;
    net += variance;
  }
  db.update('count_sessions', sessionId, { status: 'closed', closed_at: new Date().toISOString() });
  db.insert('audit_log', { id: uid('aud'), kind: 'wms.count_posted', ref_id: sessionId, payload: { posted, net_variance: net } });
  return { ok: true, posted, net_variance: net };
}

export const counts = { openCount, recordCount, postCount };
