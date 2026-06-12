/**
 * Google OAuth 2.0 — step 1 (authorize redirect) — PRD-05.
 *
 *   GET /api/auth/google/connect
 *
 * One consent grants Gmail (send + read shared inboxes) and Calendar
 * scopes for the operational account (e.g. ops@unitemedical.net).
 * Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Google Cloud →
 * OAuth consent → Web application credentials).
 *
 * Redirect URI to register: https://<deployment>/api/auth/google/callback
 */

import crypto from 'node:crypto';
import { sendJson } from '../../_lib/http.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
].join(' ');

export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return sendJson(res, 503, { error: 'not_configured', hint: 'Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in Vercel env.' });
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${host}/api/auth/google/callback`;
  const state = crypto.randomBytes(16).toString('hex');

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('access_type', 'offline');   // ← refresh token
  url.searchParams.set('prompt', 'consent');        // ← force refresh token re-issue
  url.searchParams.set('state', state);

  res.statusCode = 302;
  res.setHeader('Set-Cookie', `google_oauth_state=${state}; HttpOnly; Path=/api/auth/google; Max-Age=600; SameSite=Lax; Secure`);
  res.setHeader('Location', url.toString());
  res.end();
}
