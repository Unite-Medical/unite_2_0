import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { createSessionToken, hashStoredPassword, setSessionCookie } from '../_lib/auth.js';
import { buildCustomerIoOutbox, queueCustomerIoTransactional } from '../_lib/customerioOutbox.js';
import { logEvent, readRawBody, sendJson } from '../_lib/http.js';
import { evaluateAccount } from '../../src/lib/accountApproval.js';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}

function safeSession(profile, organization) {
  return {
    user_id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    org_id: profile.org_id,
    approval_status: organization.approval_status,
    tier: organization.tier,
    session_revision: Number(profile.session_revision || 0),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.SESSION_SECRET || !process.env.DATABASE_URL) return sendJson(res, 503, { error: 'auth_not_configured' });

  try {
    const raw = await readRawBody(req);
    const body = JSON.parse(raw.toString('utf8') || '{}');
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim();
    const companyName = String(body.org_name || '').trim();
    const website = String(body.website || '').trim().toLowerCase();
    if (!companyName || !name || !website || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: 'company_contact_and_work_email_required' });
    }
    if (password.length < 8) return sendJson(res, 400, { error: 'password_too_short' });

    const sql = neon(process.env.DATABASE_URL);
    await sql`CREATE TABLE IF NOT EXISTS um_rows (tbl TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted BOOLEAN NOT NULL DEFAULT false, PRIMARY KEY (tbl,id))`;
    const existing = await sql`SELECT id FROM um_rows WHERE tbl='profiles' AND deleted=false AND lower(data->>'email')=${email} LIMIT 1`;
    if (existing.length) return sendJson(res, 409, { error: 'account_exists' });

    const approval = evaluateAccount({ email, website, address: body.address || '' });
    const approved = approval.decision === 'AUTO_APPROVE';
    const now = new Date().toISOString();
    const orgId = stableId('org', email);
    const userId = stableId('usr', email);
    const organization = {
      id: orgId,
      name: companyName,
      segment: body.segment || 'asc',
      tier: 'C',
      terms: 'ach',
      credit_limit: 0,
      total_spend: 0,
      account_rep: 'Aidan Park',
      account_owner_email: 'sales@unitemedical.net',
      website,
      contact_email: email,
      approval_status: approved ? 'approved' : 'manual_review',
      status: 'active',
      approval_score: approval.score,
      approval_reasons: approval.reasons,
      approved_at: approved ? now : null,
      created_at: now,
    };
    const profile = {
      id: userId,
      email,
      ...hashStoredPassword(password),
      name,
      role: 'customer',
      org_id: orgId,
      title: 'Account owner',
      status: 'active',
      session_revision: 0,
      created_at: now,
    };
    const membership = {
      id: stableId('orguser', `${orgId}:${userId}`), org_id: orgId, user_id: userId,
      role: 'owner', status: 'active', created_at: now,
    };
    const contact = {
      id: stableId('contact', email), org_id: orgId, name, email,
      role: 'account_owner', source: 'registration', status: 'active', created_at: now,
    };
    const paymentMethod = {
      id: stableId('apm', `${orgId}:ach`), org_id: orgId, method: 'ach', status: 'active',
      credit_limit: null, approved_by: 'registration_policy', approved_at: now,
    };
    const task = {
      id: stableId('task', `${orgId}:registration`),
      kind: approved ? 'new_account_onboarding' : 'account_manual_review',
      subject: approved ? `Onboard approved account · ${companyName}` : `Review company account · ${companyName}`,
      owner_email: organization.account_owner_email,
      status: 'open', ref_type: 'organization', ref_id: orgId,
      payload: { email, website, approval_score: approval.score }, created_at: now,
    };
    const audit = {
      id: stableId('aud', `${orgId}:registered`), kind: 'account.registered', ref_id: orgId,
      actor_id: userId, payload: { approval_status: organization.approval_status, score: approval.score }, created_at: now,
    };
    const firstName = name.split(' ')[0];
    const notificationArgs = {
      idempotency_key: `registration:${orgId}:received`,
      to: email,
      transactional_message_id: approved ? 'account_approved' : 'account_request_received',
      subject: approved ? 'Welcome to Unite Medical' : 'Unite Medical account request received',
      body: approved
        ? `Hi ${firstName}, your company account is approved with default pricing and ACH invoice payment. Your assigned rep will follow up.`
        : `Hi ${firstName}, we received your company account request. It is in manual review. You can build a Quick Quote while review is pending.`,
      ref_type: 'organization', ref_id: orgId,
      message_data: { organization_id: orgId, user_id: userId, approval_status: organization.approval_status },
      now: new Date(now),
    };
    const outbox = buildCustomerIoOutbox(notificationArgs);
    const lockNonce = crypto.randomBytes(16).toString('hex');
    const lock = { id: stableId('reglock', email), email_hash: crypto.createHash('sha256').update(email).digest('hex'), nonce: lockNonce, created_at: now };
    const results = await sql.transaction((txn) => [
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        VALUES ('registration_locks',${lock.id},${JSON.stringify(lock)}::jsonb,false,now())
        ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'profiles',${profile.id},${JSON.stringify(profile)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='registration_locks' AND id=${lock.id} AND data->>'nonce'=${lockNonce})
          AND NOT EXISTS (SELECT 1 FROM um_rows WHERE tbl='profiles' AND deleted=false AND lower(data->>'email')=${email})
        ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'organizations',${organization.id},${JSON.stringify(organization)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='profiles' AND id=${profile.id} AND data->>'created_at'=${now})
        ON CONFLICT (tbl,id) DO NOTHING`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'organization_users',${membership.id},${JSON.stringify(membership)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='profiles' AND id=${profile.id} AND data->>'created_at'=${now})
        ON CONFLICT (tbl,id) DO NOTHING`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'contacts',${contact.id},${JSON.stringify(contact)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='profiles' AND id=${profile.id} AND data->>'created_at'=${now})
        ON CONFLICT (tbl,id) DO NOTHING`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'account_payment_methods',${paymentMethod.id},${JSON.stringify(paymentMethod)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='profiles' AND id=${profile.id} AND data->>'created_at'=${now})
        ON CONFLICT (tbl,id) DO NOTHING`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'tasks',${task.id},${JSON.stringify(task)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='profiles' AND id=${profile.id} AND data->>'created_at'=${now})
        ON CONFLICT (tbl,id) DO NOTHING`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='profiles' AND id=${profile.id} AND data->>'created_at'=${now})
        ON CONFLICT (tbl,id) DO NOTHING`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'customerio_outbox',${outbox.id},${JSON.stringify(outbox)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='profiles' AND id=${profile.id} AND data->>'created_at'=${now})
        ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!results[0]?.length || !results[1]?.length) return sendJson(res, 409, { error: 'account_exists' });
    const delivery = await queueCustomerIoTransactional(sql, notificationArgs);

    const session = safeSession(profile, organization);
    setSessionCookie(res, createSessionToken(session));
    logEvent('auth.register', 'created', { user_id: userId, org_id: orgId, approval_status: organization.approval_status });
    return sendJson(res, 201, { session, approval, notification_status: delivery.ok ? 'sent' : 'queued', organization: { id: orgId, approval_status: organization.approval_status, tier: organization.tier, terms: organization.terms } });
  } catch (error) {
    logEvent('auth.register', 'error', { error: error.message });
    return sendJson(res, 500, { error: 'registration_failed' });
  }
}
