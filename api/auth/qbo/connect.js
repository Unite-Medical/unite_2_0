/**
 * QuickBooks Online OAuth 2.0 — step 1 (authorize redirect) — PRD-02.
 *
 *   GET /api/auth/qbo/connect
 *
 * Redirects the operator to Intuit's consent screen. Requires:
 *   QBO_CLIENT_ID, QBO_CLIENT_SECRET  (from the Intuit developer app)
 *
 * Redirect URI to register on the Intuit app:
 *   https://<deployment>/api/auth/qbo/callback
 */

import crypto from 'node:crypto';
import { sendJson } from '../../_lib/http.js';

export default async function handler(req, res) {
  const clientId = process.env.QBO_CLIENT_ID;
  if (!clientId) {
    return sendJson(res, 503, { error: 'not_configured', hint: 'Set QBO_CLIENT_ID + QBO_CLIENT_SECRET in Vercel env.' });
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${host}/api/auth/qbo/callback`;
  const state = crypto.randomBytes(16).toString('hex');

  const url = new URL('https://appcenter.intuit.com/connect/oauth2');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'com.intuit.quickbooks.accounting');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);

  res.statusCode = 302;
  res.setHeader('Set-Cookie', `qbo_oauth_state=${state}; HttpOnly; Path=/api/auth/qbo; Max-Age=600; SameSite=Lax; Secure`);
  res.setHeader('Location', url.toString());
  res.end();
}
