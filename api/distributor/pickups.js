import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { sessionFromRequest } from '../_lib/auth.js';
import { authorizeCommerceContext } from '../_lib/commerce.js';
import { validateDistributorPickupRequest } from '../_lib/distributorProjection.js';
import { buildCustomerIoOutbox, queueCustomerIoTransactional } from '../_lib/customerioOutbox.js';
import { logEvent, readRawBody, sendJson } from '../_lib/http.js';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}
async function upsert(sql, table, row) {
  await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
    VALUES (${table},${String(row.id)},${JSON.stringify(row)}::jsonb,false,now())
    ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()`;
}
function safePickup(row) {
  return {
    id: row.id, status: row.status, public_order_reference: row.public_order_reference,
    carrier_name: row.carrier_name, booking_reference: row.booking_reference,
    requested_start: row.requested_start, requested_end: row.requested_end,
    confirmed_start: row.confirmed_start || null, confirmed_end: row.confirmed_end || null,
    created_at: row.created_at,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (session.role !== 'distributor' || !session.org_id) return sendJson(res, 403, { error: 'distributor_access_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  try {
    const raw = await readRawBody(req);
    const body = JSON.parse(raw.toString('utf8') || '{}');
    const sql = neon(process.env.DATABASE_URL);
    const [profileRows, orgRows, membershipRows, orderRows] = await Promise.all([
      sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${session.user_id} AND deleted=false LIMIT 1`,
      sql`SELECT data FROM um_rows WHERE tbl='organizations' AND id=${session.org_id} AND deleted=false LIMIT 1`,
      sql`SELECT data FROM um_rows WHERE tbl='organization_users' AND deleted=false
        AND data->>'user_id'=${session.user_id} AND data->>'org_id'=${session.org_id} LIMIT 1`,
      sql`SELECT data FROM um_rows WHERE tbl='orders' AND id=${String(body.order_reference || '')} AND deleted=false LIMIT 1`,
    ]);
    const authorization = authorizeCommerceContext({
      session, profile: profileRows[0]?.data, organization: orgRows[0]?.data, membership: membershipRows[0]?.data,
    });
    if (!authorization.ok || authorization.session.role !== 'distributor') {
      return sendJson(res, 403, { error: authorization.reason || 'distributor_access_required' });
    }
    const order = orderRows[0]?.data || null;
    const validation = validateDistributorPickupRequest({ session: authorization.session, order, input: body });
    if (!validation.ok) return sendJson(res, 400, { error: validation.reason });
    const pickupId = stableId('dpick', `${session.org_id}:${order.id}:${String(body.booking_reference).trim()}`);
    const existingRows = await sql`SELECT data FROM um_rows WHERE tbl='distributor_pickups' AND id=${pickupId} AND deleted=false LIMIT 1`;
    if (existingRows[0]) return sendJson(res, 200, { ok: true, duplicate: true, pickup: safePickup(existingRows[0].data) });

    const now = new Date().toISOString();
    const pickup = {
      id: pickupId, owner_org_id: session.org_id, order_id: order.id,
      public_order_reference: order.public_order_reference || order.id,
      status: 'requested', carrier_name: String(body.carrier_name).trim(),
      booking_reference: String(body.booking_reference).trim(),
      third_party_account_ref: body.third_party_account_ref ? String(body.third_party_account_ref).trim().slice(-8) : null,
      dispatch_contact: {
        name: String(body.dispatch_contact.name).trim(),
        phone: String(body.dispatch_contact.phone).trim(),
      },
      requested_start: validation.start, requested_end: validation.end,
      warehouse_time_zone: validation.warehouse_time_zone,
      requested_by: session.email, requested_at: now, created_at: now, updated_at: now,
    };
    const event = {
      id: stableId('dpe', `${pickup.id}:requested`), pickup_id: pickup.id, owner_org_id: session.org_id,
      kind: 'requested', actor_id: session.user_id, occurred_at: now,
    };
    const task = {
      id: stableId('task', `${pickup.id}:requested`), kind: 'distributor_pickup_requested',
      subject: `Distributor pickup requested for ${pickup.public_order_reference}`,
      owner_email: 'ops@unitemedical.net', status: 'open', ref_type: 'distributor_pickup', ref_id: pickup.id,
      payload: {
        owner_org_id: session.org_id, public_order_reference: pickup.public_order_reference,
        carrier_name: pickup.carrier_name, requested_start: pickup.requested_start, requested_end: pickup.requested_end,
      },
      created_at: now,
    };
    const audit = {
      id: stableId('aud', `${pickup.id}:requested`), kind: 'distributor.pickup_requested', ref_id: pickup.id,
      payload: { owner_org_id: session.org_id, public_order_reference: pickup.public_order_reference },
      actor_id: session.user_id, created_at: now,
    };
    const notificationArgs = {
      idempotency_key: `pickup:${pickup.id}:requested`,
      to: 'ops@unitemedical.net', transactional_message_id: 'distributor_pickup_requested',
      subject: `Pickup requested · ${pickup.public_order_reference}`,
      body: `${pickup.carrier_name} requested ${pickup.requested_start} to ${pickup.requested_end}. Booking ${pickup.booking_reference}.`,
      ref_type: 'distributor_pickup', ref_id: pickup.id,
      message_data: { pickup_id: pickup.id, public_order_reference: pickup.public_order_reference },
      now: new Date(now),
    };
    const durableOutbox = buildCustomerIoOutbox(notificationArgs);
    const results = await sql.transaction((txn) => [
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('distributor_pickups',${pickup.id},${JSON.stringify(pickup)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'distributor_pickup_events',${event.id},${JSON.stringify(event)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='distributor_pickups' AND p.id=${pickup.id}) ON CONFLICT (tbl,id) DO NOTHING`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'tasks',${task.id},${JSON.stringify(task)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='distributor_pickups' AND p.id=${pickup.id}) ON CONFLICT (tbl,id) DO NOTHING`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='distributor_pickups' AND p.id=${pickup.id}) ON CONFLICT (tbl,id) DO NOTHING`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'customerio_outbox',${durableOutbox.id},${JSON.stringify(durableOutbox)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='distributor_pickups' AND p.id=${pickup.id}) ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    let duplicate = false;
    let responsePickup = pickup;
    if (!results[0]?.length) {
      const existing = await sql`SELECT data FROM um_rows WHERE tbl='distributor_pickups' AND id=${pickup.id} AND deleted=false LIMIT 1`;
      if (!existing[0]?.data) return sendJson(res, 409, { error: 'pickup_request_conflict' });
      duplicate = true;
      responsePickup = existing[0].data;
    }
    const delivery = await queueCustomerIoTransactional(sql, notificationArgs);
    await upsert(sql, 'notification_outbox', {
      id: stableId('outbox', `${pickup.id}:requested`), kind: 'distributor_pickup_requested',
      recipient: 'ops@unitemedical.net', ref_type: 'distributor_pickup', ref_id: pickup.id,
      status: delivery.ok ? 'sent' : 'queued', error: delivery.ok ? null : delivery.reason,
      created_at: now,
    });
    logEvent('distributor.pickups', 'requested', { pickup_id: pickup.id, org_id: session.org_id });
    return sendJson(res, duplicate ? 200 : 201, { ok: true, duplicate, pickup: safePickup(responsePickup), notification_status: delivery.ok ? 'sent' : 'queued' });
  } catch (error) {
    logEvent('distributor.pickups', 'error', { org_id: session.org_id, error: error.message });
    return sendJson(res, 500, { error: 'pickup_request_failed' });
  }
}
