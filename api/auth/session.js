import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import {
  authorizeLiveProfile,
  clearSessionCookie,
  createSessionToken,
  hashStoredPassword,
  passwordNeedsUpgrade,
  sessionFromRequest,
  setSessionCookie,
  verifyStoredPassword,
} from '../_lib/auth.js';
import { logEvent, readRawBody, sendJson } from '../_lib/http.js';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_MAX_IP_ATTEMPTS = 20;
const DUMMY_PASSWORD_RECORD = hashStoredPassword('not-a-valid-password', { salt: 'unite-auth-dummy-salt-v1' });

function safeSession(profile, organization = null) {
  return {
    user_id: profile.id,
    email: profile.email,
    name: profile.name || null,
    role: profile.role,
    org_id: profile.org_id || null,
    approval_status: organization?.approval_status || profile.approval_status || null,
    tier: organization?.tier || profile.tier || null,
    session_revision: Number(profile.session_revision || 0),
  };
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}
function throttleId(scope, value) {
  return `auth_limit_${scope}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`;
}
export function loginThrottleDescriptors(email, req) {
  const ip = clientIp(req);
  return [
    { id: throttleId('account', email), scope: 'account', value: email, max_attempts: LOGIN_MAX_ATTEMPTS },
    { id: throttleId('ip', ip), scope: 'ip', value: ip, max_attempts: LOGIN_MAX_IP_ATTEMPTS },
    { id: throttleId('pair', `${email}:${ip}`), scope: 'pair', value: `${email}:${ip}`, max_attempts: LOGIN_MAX_ATTEMPTS },
  ];
}
async function getRow(sql, table, id) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${id} AND deleted=false LIMIT 1`;
  return rows[0]?.data || null;
}
async function readThrottle(sql, id) {
  return getRow(sql, 'auth_login_limits', id);
}
function throttleBlocked(record, now = Date.now()) {
  const until = record?.blocked_until ? new Date(record.blocked_until).getTime() : 0;
  return Number.isFinite(until) && until > now ? until : 0;
}
async function reserveLoginAttempt(sql, descriptor, email) {
  const { id, scope, max_attempts: maxAttempts } = descriptor;
  const now = Date.now();
  const initial = {
    id,
    scope,
    email_hash: crypto.createHash('sha256').update(email).digest('hex'),
    attempts: 1,
    window_started_at: new Date(now).toISOString(),
    blocked_until: null,
    updated_at: new Date(now).toISOString(),
  };
  const cutoff = new Date(now - LOGIN_WINDOW_MS).toISOString();
  const blockedUntil = new Date(now + LOGIN_BLOCK_MS).toISOString();
  const rows = await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
    VALUES ('auth_login_limits',${id},${JSON.stringify(initial)}::jsonb,false,now())
    ON CONFLICT (tbl,id) DO UPDATE SET
      data=jsonb_build_object(
        'id',${id},
        'scope',${scope},
        'email_hash',${initial.email_hash},
        'attempts',CASE WHEN (um_rows.deleted OR COALESCE((um_rows.data->>'window_started_at')::timestamptz,to_timestamp(0))<${cutoff}::timestamptz)
          THEN 1 ELSE COALESCE((um_rows.data->>'attempts')::int,0)+1 END,
        'window_started_at',CASE WHEN (um_rows.deleted OR COALESCE((um_rows.data->>'window_started_at')::timestamptz,to_timestamp(0))<${cutoff}::timestamptz)
          THEN ${initial.window_started_at} ELSE um_rows.data->>'window_started_at' END,
        'blocked_until',CASE WHEN (CASE WHEN (um_rows.deleted OR COALESCE((um_rows.data->>'window_started_at')::timestamptz,to_timestamp(0))<${cutoff}::timestamptz)
          THEN 1 ELSE COALESCE((um_rows.data->>'attempts')::int,0)+1 END)>=${maxAttempts}
          THEN ${blockedUntil} ELSE NULL END,
        'updated_at',${initial.updated_at}
      ),deleted=false,updated_at=now()
    RETURNING data`;
  return rows[0].data;
}
async function clearThrottle(sql, id) {
  await sql`UPDATE um_rows SET deleted=true,updated_at=now() WHERE tbl='auth_login_limits' AND id=${id}`;
}
async function releaseSuccessfulIpAttempt(sql, id) {
  await sql`UPDATE um_rows SET data=jsonb_set(jsonb_set(data,'{attempts}',to_jsonb(GREATEST(0,COALESCE((data->>'attempts')::int,0)-1)),true),'{blocked_until}','null'::jsonb,true),updated_at=now()
    WHERE tbl='auth_login_limits' AND id=${id} AND deleted=false`;
}
async function organizationFor(sql, profile) {
  if (!profile?.org_id) return null;
  return getRow(sql, 'organizations', String(profile.org_id));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.SESSION_SECRET || !process.env.DATABASE_URL) {
    return sendJson(res, 503, { error: 'auth_not_configured' });
  }
  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    const claimed = sessionFromRequest(req);
    if (!claimed) return sendJson(res, 401, { error: 'authentication_required' });
    try {
      const profile = await getRow(sql, 'profiles', String(claimed.user_id));
      const live = authorizeLiveProfile(claimed, profile);
      if (!live.ok) {
        clearSessionCookie(res);
        return sendJson(res, 401, { error: live.reason });
      }
      const session = safeSession(profile, await organizationFor(sql, profile));
      setSessionCookie(res, createSessionToken(session));
      return sendJson(res, 200, { session });
    } catch (error) {
      logEvent('auth.session', 'validation_error', { error: error.message });
      return sendJson(res, 503, { error: 'session_validation_failed' });
    }
  }

  if (req.method === 'DELETE') {
    const claimed = sessionFromRequest(req);
    try {
      if (claimed?.user_id) {
        const revoked = await sql`UPDATE um_rows SET
          data=jsonb_set(data,'{session_revision}',to_jsonb(COALESCE((data->>'session_revision')::int,0)+1),true),
          updated_at=now()
          WHERE tbl='profiles' AND id=${String(claimed.user_id)} AND deleted=false
            AND COALESCE((data->>'session_revision')::int,0)=${Number(claimed.session_revision || 0)}
          RETURNING id`;
        if (!revoked.length) return sendJson(res, 409, { error: 'session_already_revoked' });
      }
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true, revoked: Boolean(claimed?.user_id) });
    } catch (error) {
      clearSessionCookie(res);
      logEvent('auth.session', 'logout_revocation_error', { error: error.message });
      return sendJson(res, 503, { error: 'logout_revocation_failed' });
    }
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  try {
    const raw = await readRawBody(req);
    const { email: rawEmail = '', password = '' } = JSON.parse(raw.toString('utf8') || '{}');
    const email = String(rawEmail).trim().toLowerCase();
    if (!email || !password) return sendJson(res, 400, { error: 'credentials_required' });
    const descriptors = loginThrottleDescriptors(email, req);
    const existingLimits = await Promise.all(descriptors.map((descriptor) => readThrottle(sql, descriptor.id)));
    const blockedUntil = Math.max(0, ...existingLimits.map((record) => throttleBlocked(record)));
    if (blockedUntil) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000))));
      return sendJson(res, 429, { error: 'too_many_login_attempts' });
    }
    const throttles = await Promise.all(descriptors.map((descriptor) => reserveLoginAttempt(sql, descriptor, email)));
    const exceeded = throttles.find((record, index) => Number(record.attempts || 0) > descriptors[index].max_attempts);
    if (exceeded) {
      const retryAfter = Math.max(1, Math.ceil((Date.parse(exceeded.blocked_until || Date.now() + LOGIN_BLOCK_MS) - Date.now()) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return sendJson(res, 429, { error: 'too_many_login_attempts' });
    }

    const rows = await sql`
      SELECT data FROM um_rows
      WHERE tbl='profiles' AND deleted=false
        AND lower(data->>'email')=${email}
      LIMIT 1`;
    let profile = rows[0]?.data;
    const valid = verifyStoredPassword(profile || DUMMY_PASSWORD_RECORD, password, { allowLegacy: true }) && Boolean(profile);
    if (!valid || profile.status !== 'active') {
      const blocking = throttles.find((record) => record.blocked_until);
      logEvent('auth.session', 'login_failed', { email_hash: throttles[0].email_hash, attempts: throttles[0].attempts });
      if (blocking) res.setHeader('Retry-After', String(Math.ceil(LOGIN_BLOCK_MS / 1000)));
      return sendJson(res, blocking ? 429 : 401, { error: blocking ? 'too_many_login_attempts' : 'invalid_credentials' });
    }

    if (passwordNeedsUpgrade(profile)) {
      const passwordPatch = hashStoredPassword(password, { allowShortLegacy: true });
      const nextRevision = Number(profile.session_revision || 0) + 1;
      const upgradedRows = await sql`UPDATE um_rows SET
        data=(data - 'password') || ${JSON.stringify({ ...passwordPatch, session_revision: nextRevision })}::jsonb,
        updated_at=now()
        WHERE tbl='profiles' AND id=${profile.id} AND deleted=false
          AND data->>'status'=${profile.status}
          AND data->>'role'=${profile.role}
          AND COALESCE(data->>'org_id','')=${String(profile.org_id || '')}
          AND COALESCE((data->>'session_revision')::int,0)=${Number(profile.session_revision || 0)}
          AND COALESCE(data->>'password_hash','')=${String(profile.password_hash || '')}
          AND COALESCE(data->>'password_salt','')=${String(profile.password_salt || '')}
          AND COALESCE(data->>'password','')=${String(profile.password || '')}
        RETURNING data`;
      if (!upgradedRows.length) return sendJson(res, 409, { error: 'profile_changed_retry_login' });
      profile = upgradedRows[0].data;
    }
    await Promise.all([
      clearThrottle(sql, descriptors.find((row) => row.scope === 'account').id),
      clearThrottle(sql, descriptors.find((row) => row.scope === 'pair').id),
      releaseSuccessfulIpAttempt(sql, descriptors.find((row) => row.scope === 'ip').id),
    ]);
    const session = safeSession(profile, await organizationFor(sql, profile));
    setSessionCookie(res, createSessionToken(session));
    logEvent('auth.session', 'login_succeeded', { user_id: session.user_id, role: session.role });
    return sendJson(res, 200, { session });
  } catch (error) {
    logEvent('auth.session', 'error', { error: error.message });
    return sendJson(res, 500, { error: 'auth_failed' });
  }
}
