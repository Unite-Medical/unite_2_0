import { neon } from '@neondatabase/serverless';
import { sessionFromRequest } from '../_lib/auth.js';
import { buildDistributorOverview } from '../_lib/distributorProjection.js';
import { authorizeCommerceContext } from '../_lib/commerce.js';
import { logEvent, sendJson } from '../_lib/http.js';

const TABLES = new Set([
  'organizations', 'distributor_products', 'inventory_lots', 'consignment_movements',
  'purchase_orders', 'distributor_notifications', 'distributor_pickups', 'distributor_pickup_events',
  'orders', 'distributor_documents', 'distributor_ship_identities', 'payment_methods',
]);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (session.role !== 'distributor' || !session.org_id) return sendJson(res, 403, { error: 'distributor_access_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  try {
    const sql = neon(process.env.DATABASE_URL);
    const [profileRows, organizationRows, membershipRows] = await Promise.all([
      sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${session.user_id} AND deleted=false LIMIT 1`,
      sql`SELECT data FROM um_rows WHERE tbl='organizations' AND id=${session.org_id} AND deleted=false LIMIT 1`,
      sql`SELECT data FROM um_rows WHERE tbl='organization_users' AND deleted=false
        AND data->>'user_id'=${session.user_id} AND data->>'org_id'=${session.org_id} LIMIT 1`,
    ]);
    const authorization = authorizeCommerceContext({
      session,
      profile: profileRows[0]?.data,
      organization: organizationRows[0]?.data,
      membership: membershipRows[0]?.data,
    });
    if (!authorization.ok || authorization.session.role !== 'distributor') {
      return sendJson(res, 403, { error: authorization.reason || 'distributor_access_required' });
    }
    const rows = await sql`
      SELECT tbl, data FROM um_rows
      WHERE deleted=false AND (
        (tbl='organizations' AND id=${session.org_id})
        OR (tbl IN ('distributor_products','inventory_lots','consignment_movements','purchase_orders',
          'distributor_notifications','distributor_pickups','distributor_pickup_events','distributor_documents',
          'distributor_ship_identities') AND data->>'owner_org_id'=${session.org_id})
        OR (tbl='orders' AND COALESCE(data->>'on_behalf_of_org_id',data->>'customer_id')=${session.org_id} AND data->>'blind_ship'='true')
        OR (tbl='payment_methods' AND data->>'org_id'=${session.org_id})
      )`;
    const tables = {};
    for (const row of rows) {
      if (!TABLES.has(row.tbl)) continue;
      (tables[row.tbl] ||= []).push(row.data);
    }
    const overview = buildDistributorOverview({ session, tables, as_of: new Date(), window_days: 30 });
    if (!overview) return sendJson(res, 404, { error: 'distributor_not_found' });
    return sendJson(res, 200, overview);
  } catch (error) {
    logEvent('distributor.overview', 'error', { org_id: session.org_id, error: error.message });
    return sendJson(res, 500, { error: 'overview_failed' });
  }
}
