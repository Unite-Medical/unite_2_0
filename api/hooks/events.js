/**
 * Webhook event feed for the SPA — PRD-01 interim.
 *
 *   GET /api/hooks/events?since=<seq>&source=<stripe|flexport|...>
 *
 * The admin app polls this and dispatches each event to the matching
 * client-side handler (stripe.handleWebhookEvent, etc.), which updates
 * the local DB exactly as a server-side worker will once Postgres
 * lands. See src/lib/webhookBridge.js.
 */

import { eventsSince } from '../_lib/events.js';
import { sendJson } from '../_lib/http.js';

export default async function handler(req, res) {
  const since = Number(req.query.since || 0);
  const source = req.query.source || undefined;
  const events = eventsSince(Number.isFinite(since) ? since : 0, { source });
  sendJson(res, 200, { events, latest_seq: events.length ? events[events.length - 1].seq : since });
}
