/**
 * Stripe webhook receiver — PRD-09.
 *
 *   POST /api/hooks/stripe
 *   Header: Stripe-Signature: t=<ts>,v1=<hmac>
 *
 * Configure in the Stripe dashboard → Webhooks with events:
 *   payment_intent.succeeded, invoice.paid, invoice.payment_failed,
 *   invoice.sent, customer.updated
 *
 * Env: STRIPE_WEBHOOK_SECRET (whsec_...).
 *
 * Verified events are buffered for the SPA poller (GET /api/hooks/events)
 * and logged; durable persistence + QBO payment posting move server-side
 * when Postgres (PRD-13) lands.
 */

import { readRawBody, sendJson, verifyStripeSignature, logEvent } from '../_lib/http.js';
import { pushEvent } from '../_lib/events.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  const raw = await readRawBody(req);
  const payload = raw.toString('utf8');
  const check = verifyStripeSignature({
    header: req.headers['stripe-signature'],
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  if (!check.ok) {
    logEvent('hooks.stripe', 'rejected', { reason: check.reason });
    return sendJson(res, 400, { error: 'signature_verification_failed', reason: check.reason });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return sendJson(res, 400, { error: 'invalid_json' });
  }

  const evt = pushEvent({ source: 'stripe', type: event.type, payload: event, verified: true });
  logEvent('hooks.stripe', 'accepted', { type: event.type, id: event.id, seq: evt.seq });
  sendJson(res, 200, { received: true, seq: evt.seq });
}
