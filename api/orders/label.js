import { neon } from '@neondatabase/serverless';
import { authorizeLiveProfile, sessionFromRequest } from '../_lib/auth.js';
import { logEvent, readRawBody, sendJson } from '../_lib/http.js';
import { createOrderLabel, LABEL_ROLES, readyToShipOrders } from '../_lib/orderShipping.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (!['GET', 'POST'].includes(req.method)) return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (!LABEL_ROLES.includes(session.role)) return sendJson(res, 403, { error: 'label_capability_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  try {
    if (req.method === 'GET') {
      const sql = neon(process.env.DATABASE_URL);
      const profiles = await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${String(session.user_id)} AND deleted=false LIMIT 1`;
      const live = authorizeLiveProfile(session, profiles[0]?.data, { roles: LABEL_ROLES });
      if (!live.ok) return sendJson(res, 403, { error: live.reason });
      const labelFor = String(req.query?.label || new URL(req.url, 'http://x').searchParams.get('label') || '').trim();
      if (labelFor) {
        const rows = await sql`SELECT data FROM um_rows WHERE tbl='shipments' AND deleted=false AND data->>'order_id'=${labelFor} AND data->>'label_data_base64' IS NOT NULL ORDER BY updated_at DESC LIMIT 1`;
        const pdf = rows[0]?.data?.label_data_base64;
        if (!pdf) return sendJson(res, 404, { error: 'label_not_found' });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="label-${labelFor.replace(/[^\w-]/g, '')}.pdf"`);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.end(Buffer.from(pdf, 'base64'));
      }
      const orders = (await sql`SELECT data FROM um_rows WHERE tbl='orders' AND deleted=false AND data->>'status' IN ('inventory_reserved','ready_to_ship')`).map((r) => r.data);
      const ids = orders.map((o) => o.id), addressIds = orders.map((o) => o.ship_to_address_id).filter(Boolean);
      const items = ids.length ? (await sql`SELECT data FROM um_rows WHERE tbl='order_items' AND deleted=false AND data->>'order_id' = ANY(${ids})`).map((r) => r.data) : [];
      const addresses = addressIds.length ? (await sql`SELECT data FROM um_rows WHERE tbl='addresses' AND deleted=false AND id = ANY(${addressIds})`).map((r) => r.data) : [];
      return sendJson(res, 200, { ok: true, orders: readyToShipOrders({ orders, items, addresses }) });
    }
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    const orderId = String(body.order_id || '').trim();
    if (!orderId) return sendJson(res, 400, { error: 'order_id_required' });
    const sql = neon(process.env.DATABASE_URL);
    const profiles = await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${String(session.user_id)} AND deleted=false LIMIT 1`;
    const profile = profiles[0]?.data;
    const live = authorizeLiveProfile(session, profile, { roles: LABEL_ROLES });
    if (!live.ok) return sendJson(res, 403, { error: live.reason });
    const result = await createOrderLabel(sql, orderId, { actorId: session.user_id });
    if (!result.ok) return sendJson(res, result.reason === 'label_reconciliation_required' ? 409 : 400, { error: result.reason });
    logEvent('orders.label', result.idempotent ? 'reused' : 'created', { order_id: orderId, actor_id: session.user_id });
    return sendJson(res, 200, {
      ok: true, idempotent: Boolean(result.idempotent),
      order: { id: result.order.id, status: result.order.status, tracking_number: result.order.tracking_number, carrier: result.order.carrier },
      shipment: { id: result.shipment.id, status: result.shipment.status, tracking_number: result.shipment.tracking_number, carrier: result.shipment.carrier },
    });
  } catch (error) {
    logEvent('orders.label', 'error', { user_id: session.user_id, error: error.message });
    return sendJson(res, 500, { error: 'label_creation_failed' });
  }
}
