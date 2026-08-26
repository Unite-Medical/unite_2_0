import { neon } from '@neondatabase/serverless';
import { authorizeLiveProfile, sessionFromRequest } from '../_lib/auth.js';
import { logEvent, sendJson } from '../_lib/http.js';

function pick(row, fields) {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(row || {}, field)).map((field) => [field, row[field]]));
}

async function rowsFor(sql, table) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false`;
  return rows.map((row) => row.data);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (!['customer', 'distributor'].includes(session.role)) return sendJson(res, 403, { error: 'account_session_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const [profileRows, organizationRows, membershipRows] = await Promise.all([
      sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${String(session.user_id)} AND deleted=false LIMIT 1`,
      sql`SELECT data FROM um_rows WHERE tbl='organizations' AND id=${String(session.org_id || '')} AND deleted=false LIMIT 1`,
      sql`SELECT data FROM um_rows WHERE tbl='organization_users' AND deleted=false AND data->>'user_id'=${String(session.user_id)} AND data->>'org_id'=${String(session.org_id || '')} LIMIT 1`,
    ]);
    const profile = profileRows[0]?.data;
    const organization = organizationRows[0]?.data;
    const membership = membershipRows[0]?.data;
    const live = authorizeLiveProfile(session, profile, { roles: ['customer', 'distributor'] });
    if (!live.ok) return sendJson(res, 403, { error: live.reason });
    if (!organization || organization.id !== profile.org_id || organization.id !== session.org_id || (organization.status && organization.status !== 'active')) return sendJson(res, 403, { error: 'organization_inactive' });
    if (!membership || membership.status !== 'active') return sendJson(res, 403, { error: 'membership_inactive' });

    const [addresses, paymentMethods, orders, orderItems, invoices, quotes, shipments] = await Promise.all([
      rowsFor(sql, 'addresses'), rowsFor(sql, 'account_payment_methods'), rowsFor(sql, 'orders'),
      rowsFor(sql, 'order_items'), rowsFor(sql, 'invoices'), rowsFor(sql, 'quotes'), rowsFor(sql, 'shipments'),
    ]);
    const ownOrders = orders.filter((row) => row.customer_id === organization.id).slice(-200);
    const orderIds = new Set(ownOrders.map((row) => row.id));
    const payload = {
      profile: pick(profile, ['id', 'email', 'name', 'role', 'org_id', 'title', 'status']),
      organization: pick(organization, ['id', 'name', 'segment', 'tier', 'terms', 'approval_status', 'status', 'account_rep', 'contact_email']),
      membership: pick(membership, ['id', 'user_id', 'org_id', 'role', 'status']),
      addresses: addresses.filter((row) => row.org_id === organization.id).map((row) => pick(row, ['id', 'org_id', 'label', 'line1', 'line2', 'city', 'state', 'zip', 'country', 'is_default'])),
      payment_methods: paymentMethods.filter((row) => row.org_id === organization.id && row.status === 'active').map((row) => pick(row, ['id', 'org_id', 'method', 'status', 'credit_limit'])),
      orders: ownOrders.map((row) => pick(row, ['id', 'customer_id', 'status', 'payment_status', 'subtotal', 'freight', 'shipping_cost', 'tax', 'total', 'po_number', 'payment_method', 'ship_to_address_id', 'tracking_number', 'carrier', 'placed_at', 'created_at', 'shipped_at', 'delivered_at'])),
      order_items: orderItems.filter((row) => orderIds.has(row.order_id)).map((row) => pick(row, ['id', 'order_id', 'customer_id', 'sku', 'name', 'qty', 'unit_price', 'ext_price', 'status'])),
      invoices: invoices.filter((row) => row.customer_id === organization.id || orderIds.has(row.order_id)).map((row) => pick(row, ['id', 'order_id', 'customer_id', 'amount', 'terms', 'status', 'due_date', 'paid_at', 'payment_url', 'created_at'])),
      quotes: quotes.filter((row) => row.customer_id === organization.id).map((row) => pick(row, ['id', 'customer_id', 'status', 'revision', 'valid_until', 'subtotal', 'shipping_cost', 'tax', 'total', 'customer_po', 'payment_terms', 'accepted_at', 'created_at'])),
      shipments: shipments.filter((row) => orderIds.has(row.order_id)).map((row) => pick(row, ['id', 'order_id', 'status', 'carrier', 'tracking_number', 'shipped_at', 'delivered_at', 'events'])),
    };
    logEvent('account.bootstrap', 'served', { user_id: session.user_id, org_id: organization.id, orders: payload.orders.length });
    return sendJson(res, 200, payload);
  } catch (error) {
    logEvent('account.bootstrap', 'error', { user_id: session.user_id, error: error.message });
    return sendJson(res, 500, { error: 'account_bootstrap_failed' });
  }
}
