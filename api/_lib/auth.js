import crypto from 'node:crypto';
import { safeEqual, sendJson } from './http.js';

const COOKIE_NAME = 'um_session';
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;

function secretOrThrow(secret) {
  const value = secret || process.env.SESSION_SECRET;
  if (!value || String(value).length < 24) throw new Error('SESSION_SECRET must be at least 24 characters');
  return String(value);
}

function signature(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

export function createSessionToken(session, { secret, now = Date.now(), ttlMs = DEFAULT_TTL_MS } = {}) {
  const key = secretOrThrow(secret);
  const payload = {
    user_id: String(session.user_id),
    email: session.email ? String(session.email).toLowerCase() : null,
    name: session.name || null,
    role: String(session.role || ''),
    org_id: session.org_id || null,
    approval_status: session.approval_status || null,
    tier: session.tier || null,
    session_revision: Number(session.session_revision || 0),
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + ttlMs) / 1000),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signature(body, key)}`;
}

export function verifySessionToken(token, { secret, now = Date.now() } = {}) {
  try {
    const key = secretOrThrow(secret);
    const [body, provided, extra] = String(token || '').split('.');
    if (!body || !provided || extra || !safeEqual(provided, signature(body, key))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.user_id || !payload.role || !Number.isFinite(payload.exp)) return null;
    if (payload.exp <= Math.floor(now / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashStoredPassword(password, { salt = crypto.randomBytes(16).toString('hex'), allowShortLegacy = false } = {}) {
  const value = String(password || '');
  if (value.length < 8 && !allowShortLegacy) throw new Error('password_too_short');
  return {
    password_salt: String(salt),
    password_hash: crypto.scryptSync(value, String(salt), 32).toString('hex'),
    password_algorithm: 'scrypt-v1',
  };
}

export function verifyStoredPassword(profile, password, { allowLegacy = false } = {}) {
  if (profile?.password_hash && profile?.password_salt) {
    const digest = profile.password_algorithm === 'scrypt-v1'
      ? crypto.scryptSync(String(password), String(profile.password_salt), 32).toString('hex')
      : crypto.createHash('sha256').update(`${profile.password_salt}:${String(password)}`).digest('hex');
    return safeEqual(digest, profile.password_hash);
  }
  return Boolean(allowLegacy && profile?.password !== undefined && safeEqual(String(profile.password), String(password)));
}

export function passwordNeedsUpgrade(profile) {
  return profile?.password_algorithm !== 'scrypt-v1';
}

export function authorizeLiveProfile(session, profile, { roles = null } = {}) {
  if (!session || !profile || String(profile.id) !== String(session.user_id)) return { ok: false, reason: 'profile_not_found' };
  if (profile.status !== 'active') return { ok: false, reason: 'profile_inactive' };
  if (String(profile.role || '') !== String(session.role || '')) return { ok: false, reason: 'session_role_stale' };
  if (String(profile.org_id || '') !== String(session.org_id || '')) return { ok: false, reason: 'session_organization_stale' };
  if (Number(profile.session_revision || 0) !== Number(session.session_revision || 0)) return { ok: false, reason: 'session_revoked' };
  if (roles && !roles.includes(profile.role)) return { ok: false, reason: 'forbidden' };
  return { ok: true, profile };
}

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return [part.trim(), ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

export function sessionFromRequest(req, options = {}) {
  const authorization = String(req.headers?.authorization || '');
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : null;
  const cookie = parseCookies(req.headers?.cookie || '')[COOKIE_NAME];
  return verifySessionToken(bearer || cookie, options);
}

export async function authorizeLiveRequest(req, sql, { roles = null } = {}) {
  const session = sessionFromRequest(req);
  if (!session) return { ok: false, reason: 'authentication_required' };
  const rows = await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${String(session.user_id)} AND deleted=false LIMIT 1`;
  const authorization = authorizeLiveProfile(session, rows[0]?.data || null, { roles });
  return authorization.ok ? { ...authorization, session } : authorization;
}

export function setSessionCookie(res, token, { maxAgeSeconds = Math.floor(DEFAULT_TTL_MS / 1000) } = {}) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export function requireSession(req, res, { roles = null } = {}) {
  const session = sessionFromRequest(req);
  if (!session) {
    sendJson(res, 401, { error: 'authentication_required' });
    return null;
  }
  if (roles && !roles.includes(session.role)) {
    sendJson(res, 403, { error: 'forbidden' });
    return null;
  }
  return session;
}
