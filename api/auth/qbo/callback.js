import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../../_lib/auth.js';
import { sendJson, logEvent } from '../../_lib/http.js';
import { planQboCredential, readQboCredential, saveQboCredential } from '../../_lib/qboTokens.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL || !process.env.QBO_TOKEN_ENCRYPTION_KEY) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  const live = await authorizeLiveRequest(req, sql, { roles: ['admin'] });
  if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });

  const { code, realmId, state } = req.query;
  if (!code || !realmId) return sendJson(res, 400, { error: 'missing_oauth_result' });
  const cookieState = /qbo_oauth_state=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
  if (!cookieState || cookieState !== state) return sendJson(res, 400, { error: 'state_mismatch' });

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${host}/api/auth/qbo/callback`;
  const basic = Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64');
  let tokenRes;
  try {
    tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    });
  } catch {
    logEvent('auth.qbo', 'exchange_unknown', { realm_id: String(realmId) });
    return sendJson(res, 502, { error: 'token_exchange_outcome_unknown', action: 'restart_authorization' });
  }
  if (!tokenRes.ok) {
    logEvent('auth.qbo', 'exchange_failed', { status: tokenRes.status });
    return sendJson(res, 502, { error: 'token_exchange_failed', status: tokenRes.status });
  }

  const tokens = await tokenRes.json();
  const prior = await readQboCredential(sql);
  const credential = planQboCredential({
    realmId,
    environment: process.env.QBO_ENVIRONMENT || 'production',
    tokens,
    encryptionKey: process.env.QBO_TOKEN_ENCRYPTION_KEY,
    actorId: live.session.user_id,
    prior,
  });
  try {
    await saveQboCredential(sql, credential);
  } catch {
    logEvent('auth.qbo', 'credential_persistence_failed', { realm_id: String(realmId) });
    return sendJson(res, 503, { error: 'credential_persistence_failed', action: 'restart_authorization' });
  }

  logEvent('auth.qbo', 'connected', { realm_id: String(realmId), actor_id: live.session.user_id });
  res.statusCode = 302;
  res.setHeader('Set-Cookie', 'qbo_oauth_state=; HttpOnly; Path=/api/auth/qbo; Max-Age=0; SameSite=Lax; Secure');
  res.setHeader('Location', '/admin/integrations?qbo=connected');
  res.end();
}
