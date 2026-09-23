import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { eventsSince } from '../_lib/events.js';
import { sendJson } from '../_lib/http.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const live = await authorizeLiveRequest(req, sql, { roles: ['admin'] });
    if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    const source = req.query.source ? String(req.query.source) : undefined;
    const events = await eventsSince(sql, req.query.since || null, { source });
    return sendJson(res, 200, {
      events,
      latest_cursor: events.length ? events[events.length - 1].cursor : (req.query.since || null),
    });
  } catch {
    return sendJson(res, 503, { error: 'webhook_event_feed_unavailable' });
  }
}
