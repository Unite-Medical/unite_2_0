/**
 * Generic authenticated upstream proxy — PRD-01.
 *
 *   /api/proxy/qbo/invoice           → Intuit QBO (OAuth, realm-scoped)
 *   /api/proxy/stripe/<path>         → Stripe (form-encoded, secret key)
 *   /api/proxy/flexport/shipments    → Flexport (Bearer + version header)
 *   /api/proxy/hubspot/crm/v3/...    → HubSpot CRM (Bearer)
 *   /api/proxy/anthropic/v1/messages → Claude (server-held API key)
 *   ... see api/_lib/services.js for the full registry.
 *
 * This is a FLAT function (not a `[...path]` catch-all): Vercel's
 * file-system router does not reliably register catch-all routes nested
 * under `api/proxy/`, so a `vercel.json` rewrite maps
 * `/api/proxy/:path*` → `/api/proxy?__proxypath=:path*` and we parse the
 * service (first segment) + upstream path here. `/api/proxy/hts` still
 * resolves to the flat `api/proxy/hts.js` function first, because
 * filesystem routes take precedence over rewrites.
 *
 * The browser clients in src/lib/external/* call these paths with plain
 * JSON; secrets are injected here and never reach the client. When a
 * service's env vars are missing we return 503 with a typed error so the
 * client can fall back to its local stub.
 */

import { SERVICES } from './_lib/services.js';
import { neon } from '@neondatabase/serverless';
import { readRawBody, sendJson, logEvent } from './_lib/http.js';
import { authorizeLiveRequest } from './_lib/auth.js';
import { canUseServiceProxy } from './_lib/rowStore.js';

export default async function handler(req, res) {
  const raw = req.query.__proxypath;
  const joined = Array.isArray(raw) ? raw[0] : (raw || '');
  const segments = String(joined).split('/').filter(Boolean);
  const [service, ...rest] = segments;
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'authorization_not_configured' });
  let live;
  try {
    live = await authorizeLiveRequest(req, neon(process.env.DATABASE_URL));
  } catch {
    return sendJson(res, 503, { error: 'authorization_unavailable' });
  }
  if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
  const session = live.session;
  const svc = SERVICES[service];
  if (!svc) {
    return sendJson(res, 404, { error: 'unknown_service', service, known: Object.keys(SERVICES) });
  }
  const upstreamPath = '/' + rest.join('/');
  if (!canUseServiceProxy(session, service, upstreamPath, req.method)) return sendJson(res, 403, { error: 'proxy_forbidden', service });
  if (!svc.configured()) {
    return sendJson(res, 503, { error: 'not_configured', service, hint: `Set the ${svc.label} env vars in Vercel to enable this proxy.` });
  }

  let context = null;
  try {
    context = svc.context ? await svc.context() : null;
  } catch (err) {
    logEvent('proxy', 'auth_failed', { service, error: err.message });
    return sendJson(res, 502, { error: 'upstream_auth_failed', service, detail: err.message });
  }

  let url;
  try {
    url = await svc.buildUrl(upstreamPath, req.query, context);
  } catch (err) {
    return sendJson(res, 500, { error: 'url_build_failed', detail: err.message });
  }

  let headers;
  try {
    headers = await svc.headers(context);
  } catch (err) {
    // Token refresh failures land here — surface as 502 so the client stubs.
    logEvent('proxy', 'auth_failed', { service, error: err.message });
    return sendJson(res, 502, { error: 'upstream_auth_failed', service, detail: err.message });
  }

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const rawBody = await readRawBody(req);
    if (rawBody.length > 0) {
      if (svc.transformBody) {
        const json = JSON.parse(rawBody.toString('utf8') || '{}');
        body = svc.transformBody(json);
      } else {
        body = rawBody;
      }
    }
  }

  const started = Date.now();
  try {
    const upstream = await fetch(url, { method: req.method, headers, body });
    const text = await upstream.text();
    logEvent('proxy', 'forwarded', { service, path: upstreamPath, status: upstream.status, ms: Date.now() - started });
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.end(text);
  } catch (err) {
    logEvent('proxy', 'upstream_error', { service, path: upstreamPath, error: err.message });
    sendJson(res, 502, { error: 'upstream_unreachable', service, detail: err.message });
  }
}
