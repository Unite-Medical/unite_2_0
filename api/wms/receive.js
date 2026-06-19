/**
 * POST /api/wms/receive — receive stock against a PO / shipment.
 * Body: { sku, warehouse_id, qty, lot_number?, expiration_date?, unit_cost?,
 *         ref_type?, ref_id?, idempotency_key? }
 * Posts a `receipt` movement; lot_number/expiry are carried on the movement.
 */
import { handleWmsRoute, postMovement } from '../_lib/wms.js';

export default function handler(req, res) {
  return handleWmsRoute(req, res, async (sql, body) => {
    const qty = Number(body.qty);
    if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'invalid_qty' };
    return postMovement(sql, {
      sku: body.sku,
      warehouse_id: body.warehouse_id,
      qty_delta: qty,
      reason: 'receipt',
      ref_type: body.ref_type || 'purchase_order',
      ref_id: body.ref_id || null,
      unit_cost: body.unit_cost ?? null,
      actor_id: body.actor_id || 'receiver',
      note: body.lot_number ? `Receive lot ${body.lot_number}${body.expiration_date ? ` exp ${body.expiration_date}` : ''}` : 'Receipt',
      idempotency_key: body.idempotency_key || `recv:${body.ref_id || 'manual'}:${body.sku}:${body.lot_number || 'nolot'}:${qty}`,
    });
  });
}
