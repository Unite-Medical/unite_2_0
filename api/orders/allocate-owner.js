import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveProfile, sessionFromRequest } from '../_lib/auth.js';
import { planDistributorOwnerAllocation } from '../_lib/distributorAllocation.js';
import { logEvent, readRawBody, sendJson } from '../_lib/http.js';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}
async function dataRows(sql, table, where = null) {
  const rows = where
    ? await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false AND data @> ${JSON.stringify(where)}::jsonb`
    : await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false`;
  return rows.map((row) => row.data);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  try {
    const sql = neon(process.env.DATABASE_URL);
    const profiles = await dataRows(sql, 'profiles', { id: session.user_id });
    const profile = profiles[0];
    const live = authorizeLiveProfile(session, profile, { roles: ['admin', 'sales', 'warehouse_manager'] });
    if (!live.ok) {
      return sendJson(res, 403, { error: live.reason });
    }
    const raw = await readRawBody(req);
    const body = JSON.parse(raw.toString('utf8') || '{}');
    const [orders, items, products, ownerLots] = await Promise.all([
      dataRows(sql, 'orders', { id: String(body.order_id || '') }),
      dataRows(sql, 'order_items', { id: String(body.order_item_id || '') }),
      dataRows(sql, 'distributor_products', { owner_org_id: String(body.owner_org_id || '') }),
      dataRows(sql, 'inventory_lots', { owner_org_id: String(body.owner_org_id || '') }),
    ]);
    const order = orders[0];
    const item = items[0];
    const plan = planDistributorOwnerAllocation({
      order, item, ownerOrgId: body.owner_org_id,
      distributorProducts: products, ownerLots,
      actorId: session.user_id,
    });
    if (!plan.ok) return sendJson(res, 409, { error: plan.reason, available: plan.available });
    const audit = {
      id: stableId('aud', `${order.id}:${item.id}:owner:${body.owner_org_id}`),
      kind: 'order.owner_allocated', ref_id: order.id, actor_id: session.user_id,
      payload: {
        order_item_id: item.id,
        sku: item.sku,
        inventory_owner_org_id: body.owner_org_id,
        distributor_flow: 'unite_sell_through',
      },
      created_at: plan.order.owner_allocation_updated_at,
    };
    const results = await sql.transaction((txn) => [
      txn`UPDATE um_rows SET data=${JSON.stringify(plan.order)}::jsonb,updated_at=now()
        WHERE tbl='orders' AND id=${order.id} AND deleted=false
          AND data->>'status'='payment_pending' AND data->>'payment_status'='pending'
          AND COALESCE((data->>'fulfillment_revision')::int,0)=${Number(order.fulfillment_revision || 0)}
        RETURNING id`,
      txn`UPDATE um_rows SET data=${JSON.stringify(plan.item)}::jsonb,updated_at=now()
        WHERE tbl='order_items' AND id=${item.id} AND deleted=false AND data->>'order_id'=${order.id}
          AND EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${order.id}
            AND COALESCE((o.data->>'fulfillment_revision')::int,0)=${Number(plan.order.fulfillment_revision)})`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${order.id}
          AND COALESCE((o.data->>'fulfillment_revision')::int,0)=${Number(plan.order.fulfillment_revision)})
        ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!results[0]?.length) return sendJson(res, 409, { error: 'owner_allocation_conflict' });
    logEvent('orders.owner_allocation', 'allocated', { order_id: order.id, item_id: item.id, owner_org_id: body.owner_org_id });
    return sendJson(res, 200, { ok: true, order: plan.order, item: plan.item });
  } catch (error) {
    logEvent('orders.owner_allocation', 'error', { actor_id: session.user_id, error: error.message });
    return sendJson(res, 500, { error: 'owner_allocation_failed' });
  }
}
