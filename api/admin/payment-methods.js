import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody, sendJson } from '../_lib/http.js';

const METHODS = new Set(['card', 'ach', 'wire', 'net15', 'net30', 'net60']);
const TERMS_METHODS = new Set(['net15', 'net30', 'net60']);
function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}

export function planPaymentMethodAction({ organization, existing = null, method, action, credit_limit, actorId, now = new Date() } = {}) {
  if (!organization?.id) return { ok: false, reason: 'organization_not_found' };
  if (organization.status !== 'active' || organization.approval_status !== 'approved') return { ok: false, reason: 'account_not_approved' };
  if (!METHODS.has(method)) return { ok: false, reason: 'invalid_payment_method' };
  if (!['enable', 'suspend', 'set_limit'].includes(action)) return { ok: false, reason: 'invalid_payment_action' };
  if (action !== 'enable' && (!existing || existing.method !== method || existing.org_id !== organization.id)) {
    return { ok: false, reason: 'payment_method_not_found' };
  }
  if (action === 'set_limit' && !TERMS_METHODS.has(method)) return { ok: false, reason: 'credit_limit_not_applicable' };
  const limit = TERMS_METHODS.has(method) ? Number(credit_limit ?? existing?.credit_limit ?? 0) : null;
  if (limit !== null && (!Number.isFinite(limit) || limit < 0)) return { ok: false, reason: 'invalid_credit_limit' };
  const at = (now instanceof Date ? now : new Date(now)).toISOString();
  const row = {
    ...(existing || {}), id: existing?.id || stableId('apm', `${organization.id}:${method}`),
    org_id: organization.id, method,
    status: action === 'suspend' ? 'suspended' : 'active',
    credit_limit: limit,
    approved_by: action === 'suspend' ? existing?.approved_by || null : actorId,
    approved_at: action === 'suspend' ? existing?.approved_at || null : at,
    suspended_by: action === 'suspend' ? actorId : null,
    suspended_at: action === 'suspend' ? at : null,
    revision: Number(existing?.revision || 0) + 1,
    updated_at: at,
  };
  return { ok: true, row, expected_revision: Number(existing?.revision || 0) };
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
    const method = String(body.method || '');
    const [orgRows, methodRows] = await Promise.all([
      sql`SELECT data FROM um_rows WHERE tbl='organizations' AND id=${orgId} AND deleted=false LIMIT 1`,
      sql`SELECT data FROM um_rows WHERE tbl='account_payment_methods' AND deleted=false
        AND data->>'org_id'=${orgId} AND data->>'method'=${method} LIMIT 1`,
    ]);
    const plan = planPaymentMethodAction({
      organization: orgRows[0]?.data, existing: methodRows[0]?.data || null,
      method, action: body.action, credit_limit: body.credit_limit,
      actorId: live.session.user_id,
    });
    if (!plan.ok) return sendJson(res, plan.reason === 'organization_not_found' || plan.reason === 'payment_method_not_found' ? 404 : 400, { error: plan.reason });
    const audit = {
      id: stableId('aud', `${plan.row.id}:${plan.row.revision}`), kind: 'account.payment_method_changed',
      ref_id: plan.row.id, actor_id: live.session.user_id,
      payload: { org_id: orgId, method, status: plan.row.status, credit_limit: plan.row.credit_limit }, created_at: plan.row.updated_at,
    };
    const results = await sql.transaction((txn) => [
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        VALUES ('account_payment_methods',${plan.row.id},${JSON.stringify(plan.row)}::jsonb,false,now())
        ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()
        WHERE COALESCE((um_rows.data->>'revision')::int,0)=${plan.expected_revision}
        RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='account_payment_methods' AND id=${plan.row.id}
          AND COALESCE((data->>'revision')::int,0)=${plan.row.revision})
        ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!results[0]?.length) return sendJson(res, 409, { error: 'payment_method_changed_retry' });
    return sendJson(res, 200, { ok: true, payment_method: plan.row });
  } catch {
    return sendJson(res, 500, { error: 'payment_method_update_failed' });
  }
}
