/**
 * Generic authenticated upstream proxy — PRD-01.
 *
 *   /api/proxy/qbo/invoice           → Intuit QBO (OAuth, realm-scoped)
 *   /api/proxy/stripe/v1-less path   → Stripe (form-encoded, secret key)
 *   /api/proxy/flexport/shipments    → Flexport (Bearer + version header)
 *   /api/proxy/anthropic/v1/messages → Claude (server-held API key)
 *   ... see api/_lib/services.js for the full registry.
 *
 * The browser clients in src/lib/external/* call these paths with
 * plain JSON; secrets are injected here and never reach the client.
 * When a service's env vars are missing we return 503 with a typed
 * error so the client can fall back to its local stub.
 */

import { SERVICES } from '../../_lib/services.js';
import { readRawBody, sendJson, logEvent } from '../../_lib/http.js';

export default async function handler(req, res) {
  const { service, path = [] } = req.query;
  const svc = SERVICES[service];
  if (!svc) {
    return sendJson(res, 404, { error: 'unknown_service', service, known: Object.keys(SERVICES) });
  }
  if (!svc.configured()) {
    return sendJson(res, 503, { error: 'not_configured', service, hint: `Set the ${svc.label} env vars in Vercel to enable this proxy.` });
  }

  const upstreamPath = '/' + (Array.isArray(path) ? path.join('/') : String(path));
  let url;
  try {
    url = svc.buildUrl(upstreamPath, req.query);
  } catch (err) {
    return sendJson(res, 500, { error: 'url_build_failed', detail: err.message });
  }

  let headers;
  try {
    headers = await svc.headers();
  } catch (err) {
    // Token refresh failures land here — surface as 502 so the client stubs.
    logEvent('proxy', 'auth_failed', { service, error: err.message });
    return sendJson(res, 502, { error: 'upstream_auth_failed', service, detail: err.message });
  }

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const raw = await readRawBody(req);
    if (raw.length > 0) {
      if (svc.transformBody) {
        const json = JSON.parse(raw.toString('utf8') || '{}');
        body = svc.transformBody(json);
      } else {
        body = raw;
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
