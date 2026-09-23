import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest, sessionFromRequest } from '../_lib/auth.js';
import { sendJson, logEvent } from '../_lib/http.js';
import { projectQuoteBundleForSession } from '../_lib/rowStore.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const id = String(req.query?.id || '');
  const requested = String(req.query?.view || '');
  const view = requested || (session.role === 'customer' ? 'customer' : 'sales');
  if (!id) return sendJson(res, 400, { error: 'quote_id_required' });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const live = await authorizeLiveRequest(req, sql);
    if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    const quoteRows = await sql`SELECT data FROM um_rows WHERE tbl='quotes' AND id=${id} AND deleted=false LIMIT 1`;
    const quote = quoteRows[0]?.data;
    if (!quote) return sendJson(res, 404, { error: 'quote_not_found' });
    const itemRows = await sql`SELECT data FROM um_rows WHERE tbl='quote_items' AND deleted=false AND data->>'quote_id'=${id}`;
    const bundle = projectQuoteBundleForSession({ quote, items: itemRows.map((row) => row.data) }, session, view);
    if (!bundle) return sendJson(res, 404, { error: 'quote_not_found' });
    return sendJson(res, 200, bundle);
  } catch (error) {
    logEvent('quotes.view', 'error', { id, error: error.message });
    return sendJson(res, 500, { error: 'quote_view_failed' });
  }
}
