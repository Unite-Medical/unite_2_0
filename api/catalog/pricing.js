import { neon } from '@neondatabase/serverless';
import { sessionFromRequest } from '../_lib/auth.js';
import { loadCommerceContext, resolveAuthoritativePrice } from '../_lib/commerce.js';
import { logEvent, readRawBody, sendJson } from '../_lib/http.js';

async function rowsFor(sql, table) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false`;
  return rows.map((row) => row.data);
}

function statusFor(reason) {
  if (reason === 'authentication_required') return 401;
  if (['account_not_approved', 'profile_inactive', 'organization_inactive', 'membership_inactive', 'buyer_authority_required', 'role_changed'].includes(reason)) return 403;
  return 400;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const context = await loadCommerceContext(sql, session);
    if (!context.ok) return sendJson(res, statusFor(context.reason), { error: context.reason });
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    const requested = Array.isArray(body.lines) ? body.lines.slice(0, 500) : [];
    if (!requested.length) return sendJson(res, 400, { error: 'pricing_lines_required' });

    const [products, pricingRows, contractRows, volumeBreakRows] = await Promise.all([
      rowsFor(sql, 'products'), rowsFor(sql, 'pricing'), rowsFor(sql, 'customer_contract_prices'), rowsFor(sql, 'volume_breaks'),
    ]);
    const results = requested.map((line) => {
      const parent = products.find((product) => (
        product.sku === line.sku || product.id === line.sku
        || (product.variants || []).some((variant) => variant.sku === line.sku)
      ));
      const variant = parent?.variants?.find((candidate) => candidate.sku === line.sku);
      const pricedProduct = variant
        ? { ...parent, sku: line.sku, price: variant.price, quote_only: parent.quote_only || variant.price == null }
        : parent;
      return resolveAuthoritativePrice({
        product: pricedProduct,
        quantity: Number(line.qty || 1),
        organization: context.organization,
        pricingRows,
        contractRows,
        volumeBreakRows,
      });
    });
    logEvent('catalog.pricing', 'resolved', { user_id: session.user_id, org_id: session.org_id, lines: results.length });
    return sendJson(res, 200, { prices: results });
  } catch (error) {
    logEvent('catalog.pricing', 'error', { user_id: session.user_id, error: error.message });
    return sendJson(res, 500, { error: 'pricing_failed' });
  }
}
