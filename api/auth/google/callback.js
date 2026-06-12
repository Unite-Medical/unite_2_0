/**
 * Google OAuth 2.0 — step 2 (code exchange) — PRD-05.
 *
 *   GET /api/auth/google/callback?code=...&state=...
 *
 * Exchanges the code for a refresh token and shows the operator the
 * env var to set. The proxy mints short-lived access tokens from
 * GOOGLE_REFRESH_TOKEN for both Gmail and Calendar calls.
 */

import { sendJson, logEvent } from '../../_lib/http.js';

export default async function handler(req, res) {
  const { code, state } = req.query;
  if (!code) return sendJson(res, 400, { error: 'missing_code' });

  const cookieState = /google_oauth_state=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
  if (!cookieState || cookieState !== state) {
    return sendJson(res, 400, { error: 'state_mismatch', hint: 'Restart the flow at /api/auth/google/connect' });
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${host}/api/auth/google/callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    logEvent('auth.google', 'exchange_failed', { status: tokenRes.status });
    return sendJson(res, 502, { error: 'token_exchange_failed', detail: detail.slice(0, 300) });
  }

  const tokens = await tokenRes.json();
  logEvent('auth.google', 'connected', {});

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html><body style="font-family:ui-monospace,monospace;max-width:720px;margin:48px auto;line-height:1.6">
    <h2>Google Workspace connected</h2>
    <p>Set this in Vercel → Project → Settings → Environment Variables, then redeploy:</p>
    <pre style="background:#f4f1f4;padding:16px;border-radius:8px;overflow:auto">GOOGLE_REFRESH_TOKEN=${tokens.refresh_token || '(no refresh token returned — re-run with prompt=consent)'}</pre>
    <p>This single grant powers Gmail send/read and Calendar through the proxy.</p>
    <p><strong>Close this tab when done — tokens are not stored anywhere else.</strong></p>
  </body></html>`);
}
