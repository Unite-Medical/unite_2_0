import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody, sendJson } from '../_lib/http.js';

const EVENTS = new Set(['order_placed', 'shipped', 'delivered', 'invoice', 'backorder']);
function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '')); }

export function planNotificationRecipientAction({ organization, existing = null, action, email, events, actorId, now = new Date() } = {}) {
  if (!organization?.id || organization.status !== 'active') return { ok: false, reason: 'organization_not_found' };
  if (!['upsert', 'remove'].includes(action)) return { ok: false, reason: 'invalid_recipient_action' };
  const normalizedEmail = String(email || existing?.email || '').trim().toLowerCase();
  if (!validEmail(normalizedEmail)) return { ok: false, reason: 'valid_email_required' };
  if (action === 'remove' && !existing) return { ok: false, reason: 'recipient_not_found' };
  if (events !== undefined && !Array.isArray(events)) return { ok: false, reason: 'invalid_notification_events' };
  const normalizedEvents = events === undefined ? (existing?.events || [...EVENTS]) : [...new Set(events)];
  if (normalizedEvents.some((event) => !EVENTS.has(event))) return { ok: false, reason: 'invalid_notification_events' };
  const at = (now instanceof Date ? now : new Date(now)).toISOString();
  const row = {
    ...(existing || {}), id: existing?.id || stableId('anr', `${organization.id}:${normalizedEmail}`),
    org_id: organization.id, email: normalizedEmail, events: normalizedEvents,
    revision: Number(existing?.revision || 0) + 1, updated_at: at, updated_by: actorId,
    created_at: existing?.created_at || at,
  };
  return { ok: true, row, remove: action === 'remove', expected_revision: Number(existing?.revision || 0) };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const live = await authorizeLiveRequest(req, sql, { roles: ['admin'] });
    if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    const orgId = String(body.organization_id || '');
    const email = String(body.email || '').trim().toLowerCase();
    const [orgRows, recipientRows] = await Promise.all([
      sql`SELECT data FROM um_rows WHERE tbl='organizations' AND id=${orgId} AND deleted=false LIMIT 1`,
      sql`SELECT data FROM um_rows WHERE tbl='account_notification_recipients' AND deleted=false
        AND data->>'org_id'=${orgId} AND lower(data->>'email')=${email} LIMIT 1`,
    ]);
    const plan = planNotificationRecipientAction({
      organization: orgRows[0]?.data, existing: recipientRows[0]?.data || null,
      action: body.action, email, events: body.events, actorId: live.session.user_id,
    });
    if (!plan.ok) return sendJson(res, ['organization_not_found', 'recipient_not_found'].includes(plan.reason) ? 404 : 400, { error: plan.reason });
    const audit = {
      id: stableId('aud', `${plan.row.id}:${plan.row.revision}:${plan.remove ? 'remove' : 'upsert'}`),
      kind: plan.remove ? 'account.notification_recipient_removed' : 'account.notification_recipient_updated',
      ref_id: plan.row.id, actor_id: live.session.user_id,
      payload: { org_id: orgId, email: plan.row.email, events: plan.row.events }, created_at: plan.row.updated_at,
    };
    const results = await sql.transaction((txn) => [
      plan.remove
        ? txn`UPDATE um_rows SET deleted=true,updated_at=now() WHERE tbl='account_notification_recipients' AND id=${plan.row.id}
            AND deleted=false AND COALESCE((data->>'revision')::int,0)=${plan.expected_revision} RETURNING id`
        : txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
            VALUES ('account_notification_recipients',${plan.row.id},${JSON.stringify(plan.row)}::jsonb,false,now())
            ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()
            WHERE COALESCE((um_rows.data->>'revision')::int,0)=${plan.expected_revision} RETURNING id`,
      plan.remove
        ? txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
            SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
            WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='account_notification_recipients' AND id=${plan.row.id}
              AND deleted=true AND COALESCE((data->>'revision')::int,0)=${plan.expected_revision})
            ON CONFLICT (tbl,id) DO NOTHING`
        : txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
            SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
            WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='account_notification_recipients' AND id=${plan.row.id}
              AND deleted=false AND COALESCE((data->>'revision')::int,0)=${plan.row.revision})
            ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!results[0]?.length) return sendJson(res, 409, { error: 'notification_recipient_changed_retry' });
    return sendJson(res, 200, { ok: true, recipient: plan.remove ? { ...plan.row, __deleted: true } : plan.row });
  } catch {
    return sendJson(res, 500, { error: 'notification_recipient_update_failed' });
  }
}
