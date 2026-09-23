import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveProfile, sessionFromRequest } from '../_lib/auth.js';
import { planDistributorPickupAction } from '../_lib/distributorPickups.js';
import { persistOrderHandoff } from '../_lib/orderLifecycle.js';
import { queueCustomerIoTransactional } from '../_lib/customerioOutbox.js';
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
    const raw = await readRawBody(req);
    const body = JSON.parse(raw.toString('utf8') || '{}');
    const action = String(body.action || '').trim();
    const sql = neon(process.env.DATABASE_URL);
    const profiles = await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${session.user_id} AND deleted=false LIMIT 1`;
    const profile = profiles[0]?.data;
    const live = authorizeLiveProfile(session, profile, { roles: ['admin', 'warehouse_manager', 'warehouse_operator'] });
    if (!live.ok) return sendJson(res, 403, { error: live.reason });
    if (['confirm', 'cancel', 'no_show'].includes(action) && !['admin', 'warehouse_manager'].includes(profile.role)) {
      return sendJson(res, 403, { error: 'warehouse_manager_required' });
    }
    const pickupId = String(body.pickup_id || '').trim();
    const pickupRows = await sql`SELECT data FROM um_rows WHERE tbl='distributor_pickups' AND id=${pickupId} AND deleted=false LIMIT 1`;
    const pickup = pickupRows[0]?.data;
    const plan = planDistributorPickupAction({ pickup, action, actorId: session.user_id, input: body });
    if (!plan.ok) return sendJson(res, 409, { error: plan.reason });
    if (plan.idempotent) return sendJson(res, 200, { ok: true, duplicate: true, pickup: plan.pickup });

    let handoff = null;
    if (action === 'handoff') {
      handoff = await persistOrderHandoff(sql, pickup.order_id, {
        actorId: session.user_id,
        handoffReference: plan.handoff_reference,
      });
      if (!handoff.ok) return sendJson(res, 409, { error: handoff.reason });
    }

    const event = {
      id: stableId('dpe', `${pickup.id}:${action}:${plan.event.evidence_reference || plan.event.occurred_at}`),
      pickup_id: pickup.id, owner_org_id: pickup.owner_org_id, ...plan.event,
    };
    const audit = {
      id: stableId('aud', `${pickup.id}:${action}:${event.id}`),
      kind: `distributor.pickup_${action}`, ref_id: pickup.id,
      actor_id: session.user_id,
      payload: {
        public_order_reference: pickup.public_order_reference,
        evidence_type: plan.event.evidence_type || null,
        evidence_reference: plan.event.evidence_reference || null,
      },
      created_at: plan.event.occurred_at,
    };
    const results = await sql.transaction((txn) => [
      txn`UPDATE um_rows SET data=${JSON.stringify(plan.pickup)}::jsonb,updated_at=now()
        WHERE tbl='distributor_pickups' AND id=${pickup.id} AND deleted=false AND data->>'status'=${pickup.status}
        RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'distributor_pickup_events',${event.id},${JSON.stringify(event)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='distributor_pickups' AND p.id=${pickup.id} AND p.data->>'status'=${plan.pickup.status})
        ON CONFLICT (tbl,id) DO NOTHING`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='distributor_pickups' AND p.id=${pickup.id} AND p.data->>'status'=${plan.pickup.status})
        ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!results[0]?.length) return sendJson(res, 409, { error: 'pickup_state_conflict' });

    let notificationStatus = null;
    if (action === 'handoff') {
      if (handoff.notification?.deliveries?.length) {
        const deliveries = [];
        for (const planned of handoff.notification.deliveries) {
          deliveries.push(await queueCustomerIoTransactional(sql, planned.args));
        }
        notificationStatus = deliveries.every((delivery) => delivery.ok) ? 'sent' : 'queued';
      } else {
        notificationStatus = 'blocked';
      }
    }
    logEvent('distributor.pickup_action', action, { pickup_id: pickup.id, actor_id: session.user_id });
    return sendJson(res, 200, { ok: true, pickup: plan.pickup, order: handoff?.order || null, notification_status: notificationStatus });
  } catch (error) {
    logEvent('distributor.pickup_action', 'error', { actor_id: session.user_id, error: error.message });
    return sendJson(res, 500, { error: 'pickup_action_failed' });
  }
}
