import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../../_lib/auth.js';
import { sendJson, logEvent } from '../../_lib/http.js';
import { decryptQboSecret, markQboDisconnected, readQboCredential, saveQboCredential } from '../../_lib/qboTokens.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL || !process.env.QBO_TOKEN_ENCRYPTION_KEY) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const live = await authorizeLiveRequest(req, sql, { roles: ['admin'] });
    if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    const credential = await readQboCredential(sql);
    if (!credential || credential.status === 'disconnected') return sendJson(res, 200, { ok: true, disconnected: true, duplicate: true });
    if (!credential.refresh_token_ciphertext) return sendJson(res, 409, { error: 'qbo_reauthorization_required' });

    const refreshToken = decryptQboSecret(credential.refresh_token_ciphertext, process.env.QBO_TOKEN_ENCRYPTION_KEY);
    const basic = Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64');
    let upstream;
    try {
      upstream = await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token: refreshToken }),
      });
    } catch (error) {
      await saveQboCredential(sql, {
        ...credential,
        status: 'provider_unknown',
        last_error: `disconnect_network_unknown:${error.message}`.slice(0, 300),
        disconnect_requested_by: live.session.user_id,
        disconnect_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return sendJson(res, 502, { error: 'qbo_disconnect_outcome_unknown', action: 'reauthorize_or_verify_in_intuit' });
    }
    if (!upstream.ok) {
      logEvent('auth.qbo', 'disconnect_failed', { status: upstream.status, actor_id: live.session.user_id });
      return sendJson(res, 502, { error: 'qbo_disconnect_failed', status: upstream.status });
    }
    await markQboDisconnected(sql, { actorId: live.session.user_id });
    logEvent('auth.qbo', 'disconnected', { actor_id: live.session.user_id });
    return sendJson(res, 200, { ok: true, disconnected: true });
  } catch {
    return sendJson(res, 500, { error: 'qbo_disconnect_unavailable' });
  }
}
