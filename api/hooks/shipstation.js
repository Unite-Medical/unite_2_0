/**
 * ShipStation webhook receiver — PRD-04.
 *
 *   POST /api/hooks/shipstation
 *
 * ShipStation webhooks (ORDER_NOTIFY, SHIP_NOTIFY, ITEM_SHIP_NOTIFY)
 * don't carry the shipment payload — they send a `resource_url` the
 * receiver must fetch with API credentials. We do that hop here so the
 * SPA poller receives a fully-hydrated event.
 *
 * ShipStation doesn't HMAC-sign webhooks; we authenticate by requiring
 * a shared token in the URL (?token=) matching SHIPSTATION_WEBHOOK_SECRET,
 * which is the vendor-recommended pattern.
 */

import { readRawBody, sendJson, safeEqual, logEvent } from '../_lib/http.js';
import { pushEvent } from '../_lib/events.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  const secret = process.env.SHIPSTATION_WEBHOOK_SECRET;
  if (!secret) return sendJson(res, 503, { error: 'not_configured', hint: 'Set SHIPSTATION_WEBHOOK_SECRET' });
  if (!req.query.token || !safeEqual(req.query.token, secret)) {
    logEvent('hooks.shipstation', 'rejected', { reason: 'bad_token' });
    return sendJson(res, 401, { error: 'bad_token' });
  }

  const raw = await readRawBody(req);
  let notice;
  try {
    notice = JSON.parse(raw.toString('utf8'));
  } catch {
    return sendJson(res, 400, { error: 'invalid_json' });
  }

  // Hydrate: fetch the resource the notification points at.
  let resource = null;
  if (notice.resource_url && process.env.SHIPSTATION_API_KEY) {
    try {
      const auth = Buffer.from(`${process.env.SHIPSTATION_API_KEY}:${process.env.SHIPSTATION_API_SECRET}`).toString('base64');
      const r = await fetch(notice.resource_url, { headers: { Authorization: `Basic ${auth}` } });
      if (r.ok) resource = await r.json();
    } catch (err) {
      logEvent('hooks.shipstation', 'hydrate_failed', { error: err.message });
    }
  }

  const evt = pushEvent({
    source: 'shipstation',
    type: notice.resource_type || 'UNKNOWN',
    payload: { notice, resource },
    verified: true,
  });
  logEvent('hooks.shipstation', 'accepted', { type: notice.resource_type, seq: evt.seq });
  sendJson(res, 200, { received: true, seq: evt.seq });
}
