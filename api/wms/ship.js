/**
 * POST /api/wms/ship — confirm a shipped line: post a `ship` movement
 * (on_hand decrements through the ledger).
 * Body: { sku, warehouse_id, qty, lot_id?, order_id?, idempotency_key? }
 */
import { handleWmsRoute, postMovement } from '../_lib/wms.js';

export default function handler(req, res) {
  return handleWmsRoute(req, res, async (sql, body) => {
    const qty = Number(body.qty);
    if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'invalid_qty' };
    return postMovement(sql, {
      sku: body.sku,
      warehouse_id: body.warehouse_id,
      qty_delta: -qty,
      reason: 'ship',
      ref_type: 'order',
      ref_id: body.order_id || null,
      lot_id: body.lot_id || null,
      actor_id: body.actor_id || 'shipping',
      idempotency_key: body.idempotency_key || `ship:${body.order_id || 'manual'}:${body.sku}:${qty}`,
    });
  });
}
