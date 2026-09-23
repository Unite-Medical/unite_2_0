import { neon } from '@neondatabase/serverless';
import { authorizeLiveProfile, sessionFromRequest } from '../_lib/auth.js';
import { logEvent, sendJson } from '../_lib/http.js';

function pick(row, fields) {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(row || {}, field)).map((field) => [field, row[field]]));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (!['admin', 'warehouse_manager', 'warehouse_operator'].includes(session.role)) return sendJson(res, 403, { error: 'wms_capability_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const profileRows = await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${String(session.user_id)} AND deleted=false LIMIT 1`;
    const profile = profileRows[0]?.data;
    const live = authorizeLiveProfile(session, profile, { roles: ['admin', 'warehouse_manager', 'warehouse_operator'] });
    if (!live.ok) return sendJson(res, 403, { error: live.reason });
    const [poRows, productRows, movementRows] = await Promise.all([
      sql`SELECT data FROM um_rows WHERE tbl='purchase_orders' AND deleted=false`,
      sql`SELECT data FROM um_rows WHERE tbl='products' AND deleted=false`,
      sql`SELECT data FROM um_rows WHERE tbl='stock_movements' AND deleted=false AND data->>'reason'='receipt'`,
    ]);
    const purchaseOrders = poRows.map((row) => row.data)
      .filter((po) => ['sent', 'partial'].includes(po.status) && po.po_type !== 'consignment_settlement')
      .map((po) => ({
        ...pick(po, ['id', 'vendor_name', 'status', 'warehouse_id', 'receiving_revision', 'last_receipt_id', 'last_received_at', 'created_at', 'updated_at']),
        line_items: (po.line_items || []).map((line) => pick(line, ['sku', 'name', 'qty', 'received_qty', 'accepted_qty', 'vendor_backorder_qty', 'last_received_at'])),
      }));
    const poIds = new Set(purchaseOrders.map((po) => po.id));
    const products = productRows.map((row) => pick(row.data, [
      'id', 'sku', 'name', 'upc', 'gtin', 'lot_tracking', 'lot_required', 'expiration_tracking',
      'expiration_required', 'serial_tracking', 'serial_required', 'udi_tracking', 'udi_required',
    ]));
    const movements = movementRows.map((row) => row.data)
      .filter((movement) => movement.ref_type === 'purchase_order' && poIds.has(movement.ref_id))
      .map((movement) => pick(movement, ['id', 'occurred_at', 'product_sku', 'sku', 'warehouse_id', 'lot_id', 'qty_delta', 'reason', 'ref_type', 'ref_id', 'actor_id']));
    logEvent('wms.workstation', 'served', { user_id: session.user_id, purchase_orders: purchaseOrders.length });
    return sendJson(res, 200, { purchase_orders: purchaseOrders, products, stock_movements: movements });
  } catch (error) {
    logEvent('wms.workstation', 'error', { user_id: session.user_id, error: error.message });
    return sendJson(res, 500, { error: 'workstation_bootstrap_failed' });
  }
}
