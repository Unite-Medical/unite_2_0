/**
 * Flexport webhook receiver — PRD-03.
 *
 *   POST /api/hooks/flexport
 *   Header: X-Flexport-Signature: <hmac-sha256 of body>
 *
 * Subscribed events (Flexport portal → Developer → Webhooks):
 *   shipment.departed, shipment.arrived, shipment.cleared,
 *   shipment.delivered, shipment.exception
 *
 * Env: FLEXPORT_WEBHOOK_SECRET.
 *
 * The `shipment.cleared` event is the trigger for the receiving chain
 * (inventory increment → QBO landed-cost bill → reorder recalc) which
 * the SPA executes via flexport.handleWebhookEvent after polling
 * GET /api/hooks/events.
 */

import { readRawBody, sendJson, verifyHmacSignature, logEvent } from '../_lib/http.js';
import { pushEvent } from '../_lib/events.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  const raw = await readRawBody(req);
  const payload = raw.toString('utf8');
  const check = verifyHmacSignature({
    header: req.headers['x-flexport-signature'] || req.headers['x-signature'],
    payload,
    secret: process.env.FLEXPORT_WEBHOOK_SECRET,
  });
  if (!check.ok) {
    logEvent('hooks.flexport', 'rejected', { reason: check.reason });
    return sendJson(res, 400, { error: 'signature_verification_failed', reason: check.reason });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return sendJson(res, 400, { error: 'invalid_json' });
  }

  const evt = pushEvent({ source: 'flexport', type: event.type, payload: event, verified: true });
  logEvent('hooks.flexport', 'accepted', { type: event.type, seq: evt.seq });
  sendJson(res, 200, { received: true, seq: evt.seq });
}
