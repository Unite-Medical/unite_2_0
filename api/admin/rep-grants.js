import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody, sendJson } from '../_lib/http.js';

const GRANTS = new Set([
  'place_order', 'price_override', 'discount', 'shipping_override',
  'add_payment_method', 'place_on_terms', 'override_credit_hold', 'override_payment_gate',
]);
function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}

export function planRepGrantAction({ profile, existing = null, grant, action, max_discount_pct, actorId, now = new Date() } = {}) {
  if (!profile?.id || profile.status !== 'active' || !['admin', 'rep', 'sales'].includes(profile.role)) return { ok: false, reason: 'eligible_rep_required' };
  if (!GRANTS.has(grant)) return { ok: false, reason: 'invalid_rep_grant' };
  if (!['grant', 'revoke'].includes(action)) return { ok: false, reason: 'invalid_grant_action' };
  if (action === 'revoke' && !existing) return { ok: false, reason: 'rep_grant_not_found' };
  const cap = grant === 'discount' ? Number(max_discount_pct ?? existing?.max_discount_pct ?? 10) : null;
  if (grant === 'discount' && (!Number.isFinite(cap) || cap < 0 || cap > 100)) return { ok: false, reason: 'invalid_discount_cap' };
  const at = (now instanceof Date ? now : new Date(now)).toISOString();
  const row = {
    ...(existing || {}), id: existing?.id || `rog_${profile.id}_${grant}`,
    rep_id: profile.id, grant, max_discount_pct: cap,
    granted_by: actorId, granted_at: at,
    revision: Number(existing?.revision || 0) + 1,
  };
  return { ok: true, row, remove: action === 'revoke', expected_revision: Number(existing?.revision || 0) };
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
    const repId = String(body.rep_id || '');
    const grant = String(body.grant || '');
    const [profileRows, grantRows] = await Promise.all([
      sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${repId} AND deleted=false LIMIT 1`,
      sql`SELECT data FROM um_rows WHERE tbl='rep_order_grants' AND deleted=false
        AND data->>'rep_id'=${repId} AND data->>'grant'=${grant} LIMIT 1`,
    ]);
    const plan = planRepGrantAction({
      profile: profileRows[0]?.data, existing: grantRows[0]?.data || null,
      grant, action: body.action, max_discount_pct: body.max_discount_pct,
      actorId: live.session.user_id,
    });
    if (!plan.ok) return sendJson(res, ['eligible_rep_required', 'rep_grant_not_found'].includes(plan.reason) ? 404 : 400, { error: plan.reason });
    const audit = {
      id: stableId('aud', `${plan.row.id}:${plan.row.revision}:${plan.remove ? 'revoke' : 'grant'}`),
      kind: plan.remove ? 'rep.grant_revoked' : 'rep.grant_updated', ref_id: repId,
      actor_id: live.session.user_id,
      payload: { grant, max_discount_pct: plan.row.max_discount_pct }, created_at: plan.row.granted_at,
    };
    const results = await sql.transaction((txn) => [
      plan.remove
        ? txn`UPDATE um_rows SET deleted=true,updated_at=now() WHERE tbl='rep_order_grants' AND id=${plan.row.id}
            AND deleted=false AND COALESCE((data->>'revision')::int,0)=${plan.expected_revision} RETURNING id`
        : txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
            VALUES ('rep_order_grants',${plan.row.id},${JSON.stringify(plan.row)}::jsonb,false,now())
            ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()
            WHERE COALESCE((um_rows.data->>'revision')::int,0)=${plan.expected_revision} RETURNING id`,
      plan.remove
        ? txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
            SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
            WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='rep_order_grants' AND id=${plan.row.id} AND deleted=true
              AND COALESCE((data->>'revision')::int,0)=${plan.expected_revision}) ON CONFLICT (tbl,id) DO NOTHING`
        : txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
            SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
            WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='rep_order_grants' AND id=${plan.row.id} AND deleted=false
              AND COALESCE((data->>'revision')::int,0)=${plan.row.revision}) ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!results[0]?.length) return sendJson(res, 409, { error: 'rep_grant_changed_retry' });
    return sendJson(res, 200, { ok: true, grant: plan.remove ? { ...plan.row, __deleted: true } : plan.row });
  } catch {
    return sendJson(res, 500, { error: 'rep_grant_update_failed' });
  }
}
