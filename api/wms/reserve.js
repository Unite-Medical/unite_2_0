/**
 * POST /api/wms/reserve — hold stock for an order (available-to-promise).
 * Body: { order_id, sku, warehouse_id, qty }
 * Creates a `held` reservation and bumps inventory.reserved, refusing to
 * reserve beyond available (on_hand − reserved). `reserved` is a projection
 * field (not on_hand), so this route may write it directly.
 */
import crypto from 'node:crypto';
import { handleWmsRoute } from '../_lib/wms.js';

async function upsert(sql, tbl, id, data) {
  await sql`
    INSERT INTO um_rows (tbl, id, data, deleted, updated_at)
    VALUES (${tbl}, ${String(id)}, ${JSON.stringify(data)}::jsonb, false, now())
    ON CONFLICT (tbl, id) DO UPDATE SET data = EXCLUDED.data, deleted = false, updated_at = now()`;
}

export default function handler(req, res) {
  return handleWmsRoute(req, res, async (sql, body) => {
    const { order_id, sku, warehouse_id } = body;
    const qty = Number(body.qty);
    if (!order_id || !sku || !warehouse_id) return { ok: false, reason: 'missing_fields' };
    if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'invalid_qty' };

    const invRows = await sql`SELECT data FROM um_rows WHERE tbl='inventory' AND deleted=false AND data->>'sku'=${sku} AND data->>'warehouse_id'=${warehouse_id} LIMIT 1`;
    const inv = invRows[0]?.data;
    const onHand = Number(inv?.on_hand) || 0;
    const reserved = Number(inv?.reserved) || 0;
    const available = onHand - reserved;
    if (available < qty) return { ok: false, reason: 'insufficient_available', available };

    const resvId = `resv_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    await upsert(sql, 'reservations', resvId, { id: resvId, order_id, product_sku: sku, sku, warehouse_id, qty, status: 'held', created_at: new Date().toISOString() });
    const invId = inv?.id || `inv_${String(warehouse_id).replace(/^wh_/, '')}_${sku}`;
    await upsert(sql, 'inventory', invId, { ...(inv || { id: invId, sku, warehouse_id, on_hand: 0, reorder_at: 0, reorder_qty: 0 }), reserved: reserved + qty });

    return { ok: true, reservation_id: resvId, available: available - qty };
  });
}
