/**
 * UniteWMS — reason-coded manual adjustments (PRD-25 Phase 4, §7).
 *
 * Damage / loss / found deltas. Every adjustment is a ledger movement with a
 * typed reason and a note, so on_hand stays a pure projection of the ledger
 * and the adjustment is fully audited. No direct on_hand writes.
 */

import { ledger } from './ledger.js';

const ADJUST_REASONS = new Set([ledger.REASONS.ADJUST_DAMAGE, ledger.REASONS.ADJUST_LOSS, ledger.REASONS.FOUND]);

/**
 * Post a reason-coded adjustment.
 * @param {object} a
 * @param {string} a.sku
 * @param {string} a.warehouse_id
 * @param {number} a.qty_delta   signed (negative for damage/loss, positive for found)
 * @param {string} a.reason      adjust_damage | adjust_loss | found
 */
export function adjust({ sku, warehouse_id, qty_delta, reason, note = null, actor_id = 'ops', bin_id = null, idempotency_key = null }) {
  if (!ADJUST_REASONS.has(reason)) return { ok: false, reason: 'invalid_adjust_reason' };
  const delta = Number(qty_delta);
  // Damage/loss are removals, found is an addition — coerce sign to the reason.
  const signed = reason === ledger.REASONS.FOUND ? Math.abs(delta) : -Math.abs(delta);
  return ledger.post({
    sku, warehouse_id, qty_delta: signed, reason,
    ref_type: 'manual', ref_id: 'adjustment', bin_id, actor_id, note,
    idempotency_key,
  });
}

export const damage = (sku, warehouse_id, qty, note) => adjust({ sku, warehouse_id, qty_delta: qty, reason: ledger.REASONS.ADJUST_DAMAGE, note });
export const loss = (sku, warehouse_id, qty, note) => adjust({ sku, warehouse_id, qty_delta: qty, reason: ledger.REASONS.ADJUST_LOSS, note });
export const found = (sku, warehouse_id, qty, note) => adjust({ sku, warehouse_id, qty_delta: qty, reason: ledger.REASONS.FOUND, note });

export const adjustments = { adjust, damage, loss, found };
