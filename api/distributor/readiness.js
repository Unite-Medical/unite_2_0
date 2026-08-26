import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveProfile, sessionFromRequest } from '../_lib/auth.js';
import { planDistributorReadiness } from '../_lib/distributorOrders.js';
import { logEvent, readRawBody, sendJson } from '../_lib/http.js';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  try {
    const sql = neon(process.env.DATABASE_URL);
    const profiles = await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${session.user_id} AND deleted=false LIMIT 1`;
    const profile = profiles[0]?.data;
    const live = authorizeLiveProfile(session, profile, { roles: ['admin', 'warehouse_manager'] });
    if (!live.ok) {
      return sendJson(res, 403, { error: live.reason });
    }
    const raw = await readRawBody(req);
    const body = JSON.parse(raw.toString('utf8') || '{}');
    const orderId = String(body.order_id || '').trim();
    const orders = await sql`SELECT data FROM um_rows WHERE tbl='orders' AND id=${orderId} AND deleted=false LIMIT 1`;
    const order = orders[0]?.data;
    const plan = planDistributorReadiness({
      order,
      actorId: session.user_id,
      evidence: { provider_reference: body.provider_reference, document_type: body.document_type },
    });
    if (!plan.ok) return sendJson(res, 409, { error: plan.reason });
    const audit = {
      id: stableId('aud', `${orderId}:warehouse-ready:${plan.shipment.provider_reference}`),
      kind: 'distributor.order_ready', ref_id: orderId, actor_id: session.user_id,
      payload: {
        fulfillment_mode: plan.shipment.mode,
        carrier: plan.shipment.carrier,
        document_type: plan.shipment.document_type,
        provider_reference: plan.shipment.provider_reference,
      },
      created_at: plan.order.warehouse_ready_at,
    };
    const results = await sql.transaction((txn) => [
      txn`UPDATE um_rows SET data=${JSON.stringify(plan.order)}::jsonb,updated_at=now()
        WHERE tbl='orders' AND id=${orderId} AND deleted=false AND data->>'status'='inventory_reserved'
          AND COALESCE((data->>'fulfillment_revision')::int,0)=${Number(order?.fulfillment_revision || 0)}
        RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'shipments',${plan.shipment.id},${JSON.stringify(plan.shipment)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'status' IN ('ready_for_pickup','ready_to_ship'))
        ON CONFLICT (tbl,id) DO NOTHING`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'status' IN ('ready_for_pickup','ready_to_ship'))
        ON CONFLICT (tbl,id) DO NOTHING`,
      txn`UPDATE um_rows SET data=jsonb_set(jsonb_set(data,'{status}','"completed"'::jsonb),'{completed_at}',to_jsonb(now()::text)),updated_at=now()
        WHERE tbl='tasks' AND deleted=false AND data->>'kind'='distributor_blind_order_prepare' AND data->>'ref_id'=${orderId}`,
    ]);
    if (!results[0]?.length) return sendJson(res, 409, { error: 'readiness_conflict' });
    logEvent('distributor.readiness', 'ready', { order_id: orderId, actor_id: session.user_id });
    return sendJson(res, 200, { ok: true, order: plan.order, shipment: plan.shipment });
  } catch (error) {
    logEvent('distributor.readiness', 'error', { actor_id: session.user_id, error: error.message });
    return sendJson(res, 500, { error: 'readiness_failed' });
  }
}
