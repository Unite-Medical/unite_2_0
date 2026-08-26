import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody, sendJson } from '../_lib/http.js';

function stableId(prefix, value) { return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`; }
function number(value) { return Number(value) || 0; }

export function planReturnRequest({ order, orderItems = [], priorRmas = [], items = [], reason, actorId, idempotencyKey, now = new Date() } = {}) {
  if (!order) return { ok: false, reason: 'order_not_found' };
  if (!['shipped', 'delivered', 'partially_shipped'].includes(order.status)) return { ok: false, reason: 'order_not_returnable' };
  if (!idempotencyKey || idempotencyKey.length < 8) return { ok: false, reason: 'idempotency_key_required' };
  if (!Array.isArray(items) || !items.length) return { ok: false, reason: 'return_items_required' };
  const planned = [];
  for (const input of items) {
    const orderItem = orderItems.find((row) => row.id === input.order_item_id && row.order_id === order.id);
    const qty = number(input.qty);
    if (!orderItem || !Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'invalid_return_item' };
    if (input.opened === true && (input.sterile === true || orderItem.sterile === true)) return { ok: false, reason: 'opened_sterile_non_returnable' };
    const priorQty = priorRmas.filter((rma) => !['rejected', 'cancelled'].includes(rma.status))
      .flatMap((rma) => rma.items || [])
      .filter((row) => row.order_item_id === orderItem.id)
      .reduce((sum, row) => sum + number(row.qty), 0);
    const shippedQty = number(orderItem.shipped_qty || orderItem.qty);
    if (priorQty + qty > shippedQty) return { ok: false, reason: 'return_exceeds_shipped_quantity', order_item_id: orderItem.id };
    planned.push({
      order_item_id: orderItem.id, sku: orderItem.sku, inventory_sku: orderItem.inventory_sku || orderItem.sku,
      qty, opened: input.opened === true, sterile: input.sterile === true || orderItem.sterile === true,
      lot_id: input.lot_id ? String(input.lot_id) : null,
    });
  }
  const at = (now instanceof Date ? now : new Date(now)).toISOString();
  const id = stableId('RMA', `${order.id}:${idempotencyKey}`);
  return {
    ok: true,
    rma: {
      id, order_id: order.id, customer_id: order.customer_id, requested_by: actorId,
      reason: String(reason || 'customer_request'), items: planned, status: 'requested', revision: 0,
      merchandise_value: null, restocking_fee_rate: reason === 'discretionary' ? 0.15 : 0,
      restocking_fee: null, refund_total: null, idempotency_key: idempotencyKey,
      requested_at: at, updated_at: at,
    },
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const live = await authorizeLiveRequest(req, sql);
    if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    const orderId = String(body.order_id || '');
    const [orderRows, itemRows, rmaRows] = await Promise.all([
      sql`SELECT data FROM um_rows WHERE tbl='orders' AND id=${orderId} AND deleted=false LIMIT 1`,
      sql`SELECT data FROM um_rows WHERE tbl='order_items' AND deleted=false AND data->>'order_id'=${orderId}`,
      sql`SELECT data FROM um_rows WHERE tbl='rmas' AND deleted=false AND data->>'order_id'=${orderId}`,
    ]);
    const order = orderRows[0]?.data;
    const staff = ['admin', 'finance', 'warehouse_manager'].includes(live.profile.role);
    if (!staff && (!live.session.org_id || live.session.org_id !== order?.customer_id)) return sendJson(res, 403, { error: 'order_access_denied' });
    const plan = planReturnRequest({
      order, orderItems: itemRows.map((row) => row.data), priorRmas: rmaRows.map((row) => row.data),
      items: body.items, reason: body.reason, actorId: live.session.user_id,
      idempotencyKey: String(body.idempotency_key || ''),
    });
    if (!plan.ok) return sendJson(res, plan.reason === 'order_not_found' ? 404 : 409, { error: plan.reason });
    const orgRows = await sql`SELECT data FROM um_rows WHERE tbl='organizations' AND id=${order.customer_id} AND deleted=false LIMIT 1`;
    const organization = orgRows[0]?.data;
    const ownerEmail = order.account_owner_email || organization?.account_owner_email || 'returns@unitemedical.net';
    const task = {
      id: stableId('task', `${plan.rma.id}:review`), kind: 'rma_review', subject: `Review ${plan.rma.id}`,
      owner_email: ownerEmail, status: 'open', ref_type: 'rma', ref_id: plan.rma.id,
      payload: { order_id: order.id, reason: plan.rma.reason }, created_at: plan.rma.requested_at,
    };
    const audit = { id: stableId('aud', `${plan.rma.id}:requested`), kind: 'rma.requested', ref_id: plan.rma.id, actor_id: live.session.user_id, created_at: plan.rma.requested_at };
    const result = await sql.transaction((txn) => [
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('rmas',${plan.rma.id},${JSON.stringify(plan.rma)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'tasks',${task.id},${JSON.stringify(task)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows r WHERE r.tbl='rmas' AND r.id=${plan.rma.id}) ON CONFLICT (tbl,id) DO NOTHING`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows r WHERE r.tbl='rmas' AND r.id=${plan.rma.id}) ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!result[0]?.length) {
      const existing = await sql`SELECT data FROM um_rows WHERE tbl='rmas' AND id=${plan.rma.id} AND deleted=false LIMIT 1`;
      return sendJson(res, 200, { ok: true, duplicate: true, rma: existing[0]?.data });
    }
    return sendJson(res, 201, { ok: true, rma: plan.rma });
  } catch {
    return sendJson(res, 500, { error: 'return_request_failed' });
  }
}
