/**
 * QuickBooks Online OAuth 2.0 — step 2 (code exchange) — PRD-02.
 *
 *   GET /api/auth/qbo/callback?code=...&realmId=...&state=...
 *
 * Exchanges the authorization code for access + refresh tokens and
 * shows the operator exactly which env vars to set. We don't persist
 * tokens automatically (no Postgres yet) — the refresh token goes
 * into Vercel env as QBO_REFRESH_TOKEN and the proxy refreshes access
 * tokens on demand from then on.
 */

import { sendJson, logEvent } from '../../_lib/http.js';

export default async function handler(req, res) {
  const { code, realmId, state } = req.query;
  if (!code) return sendJson(res, 400, { error: 'missing_code' });

  const cookieState = /qbo_oauth_state=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
  if (!cookieState || cookieState !== state) {
    return sendJson(res, 400, { error: 'state_mismatch', hint: 'Restart the flow at /api/auth/qbo/connect' });
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${host}/api/auth/qbo/callback`;

  const basic = Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64');
  const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    logEvent('auth.qbo', 'exchange_failed', { status: tokenRes.status });
    return sendJson(res, 502, { error: 'token_exchange_failed', detail: detail.slice(0, 300) });
  }

  const tokens = await tokenRes.json();
  logEvent('auth.qbo', 'connected', { realmId });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html><body style="font-family:ui-monospace,monospace;max-width:720px;margin:48px auto;line-height:1.6">
    <h2>QuickBooks connected</h2>
    <p>Set these in Vercel → Project → Settings → Environment Variables, then redeploy:</p>
    <pre style="background:#f4f1f4;padding:16px;border-radius:8px;overflow:auto">QBO_REALM_ID=${realmId}
QBO_REFRESH_TOKEN=${tokens.refresh_token}
QBO_ENVIRONMENT=production</pre>
    <p>The proxy mints access tokens from the refresh token automatically.
    Refresh tokens are valid 100 days and roll forward on each use.</p>
    <p><strong>Close this tab when done — tokens are not stored anywhere else.</strong></p>
  </body></html>`);
}
