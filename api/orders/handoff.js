import { neon } from '@neondatabase/serverless';
import { authorizeLiveProfile, sessionFromRequest } from '../_lib/auth.js';
import { queueCustomerIoTransactional } from '../_lib/customerioOutbox.js';
import { logEvent, readRawBody, sendJson } from '../_lib/http.js';
import { persistOrderHandoff } from '../_lib/orderLifecycle.js';

async function getRow(sql, table, id) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${String(id)} AND deleted=false LIMIT 1`;
  return rows[0]?.data || null;
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (!['admin', 'warehouse_manager', 'warehouse_operator'].includes(session.role)) return sendJson(res, 403, { error: 'handoff_capability_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  try {
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    const orderId = String(body.order_id || '').trim();
    const reference = String(body.handoff_reference || '').trim();
    if (!orderId || !reference) return sendJson(res, 400, { error: 'order_and_handoff_reference_required' });
    const sql = neon(process.env.DATABASE_URL);
    const profile = await getRow(sql, 'profiles', session.user_id);
    const live = authorizeLiveProfile(session, profile, { roles: ['admin', 'warehouse_manager', 'warehouse_operator'] });
    if (!live.ok) return sendJson(res, 403, { error: live.reason });
    const result = await persistOrderHandoff(sql, orderId, {
      actorId: session.user_id,
      handoffReference: reference,
    });
    if (!result.ok) return sendJson(res, result.reason.includes('conflict') || result.reason.includes('already') ? 409 : 400, { error: result.reason });

    let notification = 'blocked';
    if (result.notification?.deliveries?.length) {
      const deliveries = [];
      for (const planned of result.notification.deliveries) {
        deliveries.push(await queueCustomerIoTransactional(sql, planned.args));
      }
      const first = deliveries[0];
      notification = deliveries.every((delivery) => delivery.ok) ? 'sent' : 'queued';
      await sql`UPDATE um_rows SET data=data || ${JSON.stringify({
        status: notification,
        customerio_message_id: first?.provider_message_id || null,
        provider_message_id: first?.provider_message_id || null,
        sent_at: notification === 'sent' ? new Date().toISOString() : null,
        error: notification === 'sent' ? null : deliveries.find((delivery) => !delivery.ok)?.reason || 'delivery_queued',
      })}::jsonb,updated_at=now() WHERE tbl='gmail_outbox' AND id=${result.notification.legacy_outbox.id}`;
    }
    logEvent('orders.handoff', result.idempotent ? 'replayed' : 'committed', { order_id: orderId, actor_id: session.user_id, reference });
    return sendJson(res, 200, {
      ok: true, idempotent: Boolean(result.idempotent), notification,
      order: { id: result.order.id, status: result.order.status, shipped_at: result.order.shipped_at },
      shipment: {
        id: result.shipment.id, status: result.shipment.status,
        carrier: result.shipment.carrier, tracking_number: result.shipment.tracking_number,
        handoff_reference: result.shipment.handoff_reference,
      },
    });
  } catch (error) {
    logEvent('orders.handoff', 'error', { user_id: session.user_id, error: error.message });
    return sendJson(res, 500, { error: 'handoff_failed' });
  }
}
