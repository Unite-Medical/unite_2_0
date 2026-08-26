import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody, sendJson } from '../_lib/http.js';

const TIERS = new Set(['A', 'B', 'C']);
const TERMS = new Set(['ach', 'card', 'wire', 'net15', 'net30', 'net60', 'mspv']);
const SEGMENTS = new Set(['asc', 'pharmacy', 'gov', 'distributors', 'ems', 'hospital']);
const APPROVAL = new Set(['manual_review', 'approved', 'suspended']);
const STATUS = new Set(['active', 'suspended', 'disabled']);
const PATCH_FIELDS = new Set(['segment', 'tier', 'terms', 'credit_limit', 'account_rep', 'approval_status', 'status']);

function stableId(value) {
  return `aud_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`;
}

export function planOrganizationUpdate(organization, patch, { actorId, now = new Date() } = {}) {
  if (!organization?.id) return { ok: false, reason: 'organization_not_found' };
  const input = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => !PATCH_FIELDS.has(key))) return { ok: false, reason: 'invalid_organization_patch' };
  if (input.tier !== undefined && !TIERS.has(input.tier)) return { ok: false, reason: 'invalid_tier' };
  if (input.terms !== undefined && !TERMS.has(input.terms)) return { ok: false, reason: 'invalid_terms' };
  if (input.segment !== undefined && !SEGMENTS.has(input.segment)) return { ok: false, reason: 'invalid_segment' };
  if (input.approval_status !== undefined && !APPROVAL.has(input.approval_status)) return { ok: false, reason: 'invalid_approval_status' };
  if (input.status !== undefined && !STATUS.has(input.status)) return { ok: false, reason: 'invalid_organization_status' };
  if (input.credit_limit !== undefined && (!Number.isFinite(Number(input.credit_limit)) || Number(input.credit_limit) < 0)) {
    return { ok: false, reason: 'invalid_credit_limit' };
  }
  const at = (now instanceof Date ? now : new Date(now)).toISOString();
  let normalized = { ...input };
  if (normalized.credit_limit !== undefined) normalized.credit_limit = Number(normalized.credit_limit);
  const firstApproval = organization.approval_status !== 'approved' && normalized.approval_status === 'approved';
  if (firstApproval) {
    normalized = {
      ...normalized,
      tier: 'C',
      terms: 'ach',
      credit_limit: 0,
      approved_at: at,
      approved_by: actorId,
    };
  }
  const next = {
    ...organization,
    ...normalized,
    revision: Number(organization.revision || 0) + 1,
    updated_at: at,
    updated_by: actorId,
  };
  return {
    ok: true,
    organization: next,
    patch: Object.fromEntries(Object.keys(normalized).map((key) => [key, next[key]])),
    expected_revision: Number(organization.revision || 0),
    revoke_sessions: next.status !== organization.status || next.approval_status !== organization.approval_status,
    ensure_ach: firstApproval,
  };
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
    const rows = await sql`SELECT data FROM um_rows WHERE tbl='organizations' AND id=${orgId} AND deleted=false LIMIT 1`;
    const plan = planOrganizationUpdate(rows[0]?.data, body.patch, { actorId: live.session.user_id });
    if (!plan.ok) return sendJson(res, plan.reason === 'organization_not_found' ? 404 : 400, { error: plan.reason });
    const audit = {
      id: stableId(`${orgId}:${plan.expected_revision + 1}:organization_updated`), kind: 'organization.updated',
      ref_id: orgId, actor_id: live.session.user_id,
      payload: { fields: Object.keys(plan.patch), revision: plan.expected_revision + 1 }, created_at: plan.organization.updated_at,
    };
    const ach = {
      id: `apm_${crypto.createHash('sha256').update(`${orgId}:ach`).digest('hex').slice(0, 20)}`,
      org_id: orgId, method: 'ach', status: 'active', credit_limit: null,
      approved_by: live.session.user_id, approved_at: plan.organization.updated_at,
    };
    const results = await sql.transaction((txn) => {
      const queries = [
        txn`UPDATE um_rows SET data=data || ${JSON.stringify({ ...plan.patch, revision: plan.expected_revision + 1, updated_at: plan.organization.updated_at, updated_by: live.session.user_id })}::jsonb,updated_at=now()
          WHERE tbl='organizations' AND id=${orgId} AND deleted=false
            AND COALESCE((data->>'revision')::int,0)=${plan.expected_revision} RETURNING id`,
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
          WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='organizations' AND id=${orgId} AND COALESCE((data->>'revision')::int,0)=${plan.expected_revision + 1})
          ON CONFLICT (tbl,id) DO NOTHING`,
      ];
      if (plan.revoke_sessions) queries.push(txn`UPDATE um_rows SET
        data=jsonb_set(data,'{session_revision}',to_jsonb(COALESCE((data->>'session_revision')::int,0)+1),true),updated_at=now()
        WHERE tbl='profiles' AND deleted=false AND data->>'org_id'=${orgId}`);
      if (plan.ensure_ach) queries.push(txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'account_payment_methods',${ach.id},${JSON.stringify(ach)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='organizations' AND id=${orgId} AND data->>'approval_status'='approved')
        ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()`);
      return queries;
    });
    if (!results[0]?.length) return sendJson(res, 409, { error: 'organization_changed_retry' });
    return sendJson(res, 200, { ok: true, organization: plan.organization });
  } catch {
    return sendJson(res, 500, { error: 'organization_update_failed' });
  }
}
