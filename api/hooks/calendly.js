/**
 * Calendly webhook receiver — brief §5 (rep booking flow).
 *
 *   POST /api/hooks/calendly
 *   Header: Calendly-Webhook-Signature: t=<ts>,v1=<hmac>  (Stripe-style)
 *
 * Subscribed events: invitee.created, invitee.canceled.
 * Env: CALENDLY_WEBHOOK_SECRET (signing key from webhook subscription).
 *
 * The SPA poller turns invitee.created into a CRM activity + HubSpot
 * engagement via calendly.handleWebhookEvent.
 */

import { readRawBody, sendJson, verifyStripeSignature, logEvent } from '../_lib/http.js';
import { pushEvent } from '../_lib/events.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  const raw = await readRawBody(req);
  const payload = raw.toString('utf8');
  const check = verifyStripeSignature({
    header: req.headers['calendly-webhook-signature'],
    payload,
    secret: process.env.CALENDLY_WEBHOOK_SECRET,
  });
  if (!check.ok) {
    logEvent('hooks.calendly', 'rejected', { reason: check.reason });
    return sendJson(res, 400, { error: 'signature_verification_failed', reason: check.reason });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return sendJson(res, 400, { error: 'invalid_json' });
  }

  const evt = pushEvent({ source: 'calendly', type: event.event, payload: event, verified: true });
  logEvent('hooks.calendly', 'accepted', { type: event.event, seq: evt.seq });
  sendJson(res, 200, { received: true, seq: evt.seq });
}
