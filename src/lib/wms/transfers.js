/**
 * UniteWMS — inter-warehouse transfers (PRD-25 Phase 4, §7).
 *
 *   draft → in_transit → received
 *
 * A transfer is a movement PAIR: on ship, a `transfer_out` movement leaves the
 * source warehouse (on_hand drops there) and the units become in_transit at
 * the destination; on receive, a `transfer_in` movement lands them (on_hand
 * rises at the destination) and clears in_transit. on_hand only ever moves via
 * the ledger; `in_transit` is a projection field this module owns.
 */

import { db } from '../db.js';
import { uid } from '../format.js';
import { ledger } from './ledger.js';

function num(v) { return Number(v) || 0; }

function inventoryRow(sku, warehouse_id) {
  return db.list('inventory', { where: { sku, warehouse_id } })[0] || null;
}

function bumpInTransit(sku, warehouse_id, delta) {
  const row = inventoryRow(sku, warehouse_id);
  if (row) {
    db.update('inventory', row.id, { in_transit: Math.max(0, num(row.in_transit) + delta) });
  } else if (delta > 0) {
    db.insert('inventory', { id: `inv_${String(warehouse_id).replace(/^wh_/, '')}_${sku}`, sku, warehouse_id, on_hand: 0, reserved: 0, in_transit: delta, reorder_at: 0, reorder_qty: 0 });
  }
}

/** Create a transfer (draft). lines = [{ sku, qty, lot_id? }]. */
export function createTransfer({ from_wh, to_wh, lines = [], created_by = 'ops' }) {
  if (!from_wh || !to_wh || from_wh === to_wh) return { ok: false, reason: 'bad_warehouses' };
  const id = uid('xfer');
  const row = db.insert('transfers', { id, from_wh, to_wh, status: 'draft', created_by, created_at: new Date().toISOString() });
  for (const l of lines) {
    db.insert('transfer_lines', { id: uid('xl'), transfer_id: id, product_sku: l.sku, sku: l.sku, qty: num(l.qty), lot_id: l.lot_id || null });
  }
  db.insert('audit_log', { id: uid('aud'), kind: 'wms.transfer_created', ref_id: id, payload: { from_wh, to_wh, lines: lines.length } });
  return { ok: true, transfer: row };
}

function transferLines(id) { return db.list('transfer_lines', { where: { transfer_id: id } }); }

/** Ship a transfer: post transfer_out movements (source on_hand drops), mark in_transit. */
export function shipTransfer(id, { actor_id = 'ops' } = {}) {
  const t = db.get('transfers', id);
  if (!t) return { ok: false, reason: 'not_found' };
  if (t.status !== 'draft') return { ok: false, reason: `cannot_ship_${t.status}` };
  for (const l of transferLines(id)) {
    ledger.post({
      sku: l.sku, warehouse_id: t.from_wh, qty_delta: -num(l.qty), reason: ledger.REASONS.TRANSFER_OUT,
      ref_type: 'transfer', ref_id: id, lot_id: l.lot_id || null, actor_id,
      idempotency_key: `xfer_out:${id}:${l.id}`, note: `Transfer ${id} out`,
    });
    bumpInTransit(l.sku, t.to_wh, num(l.qty));
  }
  const updated = db.update('transfers', id, { status: 'in_transit', shipped_at: new Date().toISOString() });
  return { ok: true, transfer: updated };
}

/** Receive a transfer: post transfer_in movements (dest on_hand rises), clear in_transit. */
export function receiveTransfer(id, { actor_id = 'ops' } = {}) {
  const t = db.get('transfers', id);
  if (!t) return { ok: false, reason: 'not_found' };
  if (t.status !== 'in_transit') return { ok: false, reason: `cannot_receive_${t.status}` };
  for (const l of transferLines(id)) {
    ledger.post({
      sku: l.sku, warehouse_id: t.to_wh, qty_delta: num(l.qty), reason: ledger.REASONS.TRANSFER_IN,
      ref_type: 'transfer', ref_id: id, lot_id: l.lot_id || null, actor_id,
      idempotency_key: `xfer_in:${id}:${l.id}`, note: `Transfer ${id} in`,
    });
    bumpInTransit(l.sku, t.to_wh, -num(l.qty));
  }
  const updated = db.update('transfers', id, { status: 'received', received_at: new Date().toISOString() });
  return { ok: true, transfer: updated };
}

export const transfers = { createTransfer, shipTransfer, receiveTransfer };
