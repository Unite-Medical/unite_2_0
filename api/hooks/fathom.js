/**
 * Fathom call-completed webhook receiver — PRD-05.
 *
 *   POST /api/hooks/fathom
 *   Header: X-Fathom-Signature (HMAC-SHA256 of body) — or, when routed
 *   through Zapier, a shared ?token= matching FATHOM_WEBHOOK_SECRET.
 *
 * Payload: recording_id, share_url, transcript_url, summary,
 * action_items, call metadata. The SPA poller dispatches it to
 * fathom.handleCallCompleted which runs the Claude extraction prompts
 * and pushes HubSpot tasks.
 */

import { readRawBody, sendJson, verifyHmacSignature, safeEqual, logEvent } from '../_lib/http.js';
import { pushEvent } from '../_lib/events.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  const raw = await readRawBody(req);
  const payload = raw.toString('utf8');

  const viaToken = req.query.token && secret && safeEqual(req.query.token, secret);
  const viaHmac = verifyHmacSignature({ header: req.headers['x-fathom-signature'], payload, secret }).ok;
  if (!viaToken && !viaHmac) {
    logEvent('hooks.fathom', 'rejected', { reason: 'no_valid_auth' });
    return sendJson(res, 401, { error: 'signature_verification_failed' });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return sendJson(res, 400, { error: 'invalid_json' });
  }

  const evt = pushEvent({ source: 'fathom', type: event.event || 'recording.completed', payload: event, verified: true });
  logEvent('hooks.fathom', 'accepted', { recording: event?.data?.recording_id, seq: evt.seq });
  sendJson(res, 200, { received: true, seq: evt.seq });
}
