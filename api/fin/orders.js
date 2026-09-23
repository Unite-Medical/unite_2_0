import { neon } from '@neondatabase/serverless';
import { finCustomerContext, projectFinOrders, verifyFinToken } from '../_lib/fin.js';
import { sendJson } from '../_lib/http.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (process.env.UNITE_ENVIRONMENT !== 'staging' || process.env.UNITE_FIN_CUSTOMER_ENABLED !== 'true') return sendJson(res, 404, { error: 'not_enabled' });
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const session = verifyFinToken(token, { secret: process.env.SESSION_SECRET });
  if (!session) return sendJson(res, 401, { error: 'customer_sign_in_required' });
  const reference = new URL(req.url, 'https://staging.unitemedical.net').searchParams.get('reference') || '';
  if (reference.trim().length < 2 || reference.length > 100) return sendJson(res, 400, { error: 'exact_order_or_po_reference_required' });
  try {
    const sql = neon(process.env.DATABASE_URL);
    if (!await finCustomerContext(sql, session)) return sendJson(res, 403, { error: 'account_not_authorized' });
    const rows = await sql`SELECT data FROM um_rows WHERE tbl='orders' AND deleted=false AND data->>'customer_id'=${session.org_id} AND (lower(data->>'id')=${reference.toLowerCase().trim()} OR lower(data->>'order_number')=${reference.toLowerCase().trim()} OR lower(data->>'source_order_number')=${reference.toLowerCase().trim()} OR lower(data->>'po_number')=${reference.toLowerCase().trim()}) LIMIT 5`;
    const orders = rows.map(r => r.data), ids = orders.map(r => r.id);
    const [items, shipments] = ids.length ? await Promise.all([
      sql`SELECT data FROM um_rows WHERE tbl='order_items' AND deleted=false AND data->>'order_id'=ANY(${ids}) LIMIT 1000`,
      sql`SELECT data FROM um_rows WHERE tbl='shipments' AND deleted=false AND data->>'order_id'=ANY(${ids}) LIMIT 250`,
    ]) : [[], []];
    return sendJson(res, 200, { environment: 'staging', source: 'unite_staging_database', checked_at: new Date().toISOString(), notice: 'Staging records may be test or imported snapshots. Not authoritative production, carrier, or processor status.', orders: projectFinOrders({ orders, items: items.map(r => r.data), shipments: shipments.map(r => r.data) }, session.org_id, reference), next_step: !orders.length ? 'No matching accessible staging order. Ask a teammate; do not search another account.' : null });
  } catch { return sendJson(res, 503, { error: 'order_lookup_temporarily_unavailable' }); }
}
