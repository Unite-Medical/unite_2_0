import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveProfile, sessionFromRequest } from '../_lib/auth.js';
import { buildCustomerIoOutbox } from '../_lib/customerioOutbox.js';
import { readRawBody, sendJson } from '../_lib/http.js';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`;
}
function normalizedEmail(value) { return String(value || '').trim().toLowerCase(); }
function requestIp(req) { return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(); }
function ipHash(req) { return crypto.createHash('sha256').update(requestIp(req) || 'unknown').digest('hex'); }
async function row(sql, table, id) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${String(id)} AND deleted=false LIMIT 1`;
  return rows[0]?.data || null;
}

export function planSourcingRequest({ input = {}, actor = null, organization = null, now = new Date(), source_ip_hash = null } = {}) {
  const idempotencyKey = String(input.idempotency_key || '').trim();
  if (idempotencyKey.length < 12) return { ok: false, reason: 'idempotency_key_required' };
  const description = String(input.product_description || input.description || '').trim();
  if (!description) return { ok: false, reason: 'product_description_required' };
  const contactEmail = normalizedEmail(actor?.email || input.contact_email);
  if (!contactEmail || !/^\S+@\S+\.\S+$/.test(contactEmail)) return { ok: false, reason: 'contact_email_required' };
  const at = now.toISOString();
  const requestId = stableId('src', idempotencyKey);
  const ownerEmail = normalizedEmail(organization?.assigned_owner_email || organization?.account_owner_email || 'support@unitemedical.net');
  const canonical = {
    organization_id: actor?.org_id || null,
    organization_name: organization?.name || String(input.organization_name || '').trim() || null,
    contact_email: contactEmail,
    product_description: description,
    quantity_text: String(input.quantity_text || input.quantity || '').trim() || null,
    path: String(input.path || 'source'),
  };
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  const request = {
    id: requestId,
    idempotency_key: idempotencyKey,
    request_hash: requestHash,
    status: 'new',
    source_channel: actor ? 'customer_account' : 'public_quote',
    source_evidence: actor ? { profile_id: actor.user_id } : { form: 'quote_router', active_submission: true },
    source_ip_hash,
    organization_id: actor?.org_id || null,
    organization_name: canonical.organization_name,
    contact_name: String(input.contact_name || actor?.name || '').trim() || null,
    contact_email: contactEmail,
    account_owner_email: ownerEmail,
    product_description: description,
    quantity_text: canonical.quantity_text,
    manufacturer: String(input.manufacturer || '').trim() || null,
    part_number: String(input.part_number || '').trim() || null,
    destination: String(input.destination || '').trim() || null,
    response_due_at: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: at,
    updated_at: at,
  };
  const task = {
    id: stableId('task', `${requestId}:assignment`), kind: 'sourcing_request',
    subject: `Source ${description.slice(0, 120)}`, owner_email: ownerEmail,
    status: 'open', due_at: request.response_due_at, ref_type: 'sourcing_request',
    ref_id: requestId, created_at: at,
  };
  const audit = {
    id: stableId('aud', `${requestId}:created`), kind: 'sourcing.requested', ref_id: requestId,
    actor_id: actor?.user_id || contactEmail,
    payload: { source_channel: request.source_channel, owner_email: ownerEmail }, created_at: at,
  };
  const outbox = buildCustomerIoOutbox({
    idempotency_key: `sourcing:${requestId}:assigned`, to: ownerEmail,
    from: 'support@unitemedical.net', transactional_message_id: 'sourcing_assigned',
    subject: `New sourcing request ${requestId}`,
    body: `${request.organization_name || contactEmail} requested ${request.quantity_text || 'an unspecified quantity of'} ${description}.`,
    ref_type: 'sourcing_request', ref_id: requestId,
    message_data: { sourcing_request_id: requestId, source_channel: request.source_channel }, now,
  });
  return { ok: true, request, task, audit, outbox };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const input = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    let actor = null;
    let organization = null;
    const session = sessionFromRequest(req);
    if (session) {
      const profile = await row(sql, 'profiles', session.user_id);
      const live = authorizeLiveProfile(session, profile);
      if (!live.ok) return sendJson(res, 403, { error: live.reason });
      actor = session;
      organization = session.org_id ? await row(sql, 'organizations', session.org_id) : null;
    } else {
      const recent = await sql`SELECT COUNT(*)::int AS count FROM um_rows
        WHERE tbl='sourcing_requests' AND deleted=false
          AND data->>'source_ip_hash'=${ipHash(req)}
          AND (data->>'created_at')::timestamptz > now()-interval '1 hour'`;
      if (Number(recent[0]?.count || 0) >= 10) return sendJson(res, 429, { error: 'sourcing_rate_limited' });
    }
    const plan = planSourcingRequest({ input, actor, organization, source_ip_hash: actor ? null : ipHash(req) });
    if (!plan.ok) return sendJson(res, 400, { error: plan.reason });
    const existing = await row(sql, 'sourcing_requests', plan.request.id);
    if (existing) {
      if (existing.request_hash !== plan.request.request_hash) return sendJson(res, 409, { error: 'idempotency_key_conflict' });
      return sendJson(res, 200, { ok: true, duplicate: true, request: { id: existing.id, status: existing.status, response_due_at: existing.response_due_at } });
    }
    const results = await sql.transaction((txn) => [
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        VALUES ('sourcing_requests',${plan.request.id},${JSON.stringify(plan.request)}::jsonb,false,now())
        ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        VALUES ('tasks',${plan.task.id},${JSON.stringify(plan.task)}::jsonb,false,now())
        ON CONFLICT (tbl,id) DO NOTHING`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        VALUES ('audit_log',${plan.audit.id},${JSON.stringify(plan.audit)}::jsonb,false,now())
        ON CONFLICT (tbl,id) DO NOTHING`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        VALUES ('customerio_outbox',${plan.outbox.id},${JSON.stringify(plan.outbox)}::jsonb,false,now())
        ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!results[0]?.length) {
      const raced = await row(sql, 'sourcing_requests', plan.request.id);
      if (raced?.request_hash === plan.request.request_hash) return sendJson(res, 200, { ok: true, duplicate: true, request: { id: raced.id, status: raced.status, response_due_at: raced.response_due_at } });
      return sendJson(res, 409, { error: 'sourcing_request_conflict' });
    }
    return sendJson(res, 201, { ok: true, request: { id: plan.request.id, status: plan.request.status, response_due_at: plan.request.response_due_at } });
  } catch (error) {
    return sendJson(res, 500, { error: 'sourcing_request_failed', detail: error.message });
  }
}
