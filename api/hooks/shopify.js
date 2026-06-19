/**
 * Shopify webhook receiver — PRD-04.
 *
 *   POST /api/hooks/shopify
 *   Headers:
 *     X-Shopify-Hmac-Sha256: <base64 HMAC-SHA256 of the raw body>
 *     X-Shopify-Topic:       e.g. orders/create, orders/fulfilled, products/update
 *     X-Shopify-Shop-Domain: <shop>.myshopify.com
 *
 * Shopify signs the raw request body with the app's secret (base64 HMAC).
 * Dev Dashboard apps sign with the app's Client Secret; we verify against
 * SHOPIFY_WEBHOOK_SECRET, then SHOPIFY_CLIENT_SECRET, then SHOPIFY_API_SECRET
 * (legacy). Verified events are buffered for the SPA poller
 * (GET /api/hooks/events) and dispatched by shopify.handleWebhookEvent.
 *
 * Subscribe in Shopify admin (Settings → Notifications → Webhooks) or via the
 * Admin API to: orders/create, orders/updated, orders/fulfilled,
 * orders/cancelled, products/update, inventory_levels/update.
 */

import { readRawBody, sendJson, verifyHmacSignature, logEvent } from '../_lib/http.js';
import { pushEvent } from '../_lib/events.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET;
  if (!secret) return sendJson(res, 503, { error: 'not_configured', hint: 'Set SHOPIFY_CLIENT_SECRET (or SHOPIFY_WEBHOOK_SECRET)' });

  const raw = await readRawBody(req);
  const payload = raw.toString('utf8');
  const check = verifyHmacSignature({
    header: req.headers['x-shopify-hmac-sha256'],
    payload,
    secret,
  });
  if (!check.ok) {
    logEvent('hooks.shopify', 'rejected', { reason: check.reason });
    return sendJson(res, 401, { error: 'signature_verification_failed', reason: check.reason });
  }

  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    return sendJson(res, 400, { error: 'invalid_json' });
  }

  const topic = req.headers['x-shopify-topic'] || 'unknown';
  const shop = req.headers['x-shopify-shop-domain'] || null;
  const evt = pushEvent({
    source: 'shopify',
    type: topic,
    payload: { topic, shop, data },
    verified: true,
  });
  logEvent('hooks.shopify', 'accepted', { topic, shop, seq: evt.seq });
  sendJson(res, 200, { received: true, seq: evt.seq });
}
