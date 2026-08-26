import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody, sendJson } from '../_lib/http.js';
import { minimumSellPrice } from '../../src/lib/commercialPolicy.js';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}
function dateOnly(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : String(value);
}

export function planContractPriceAction({ organization, product, existing = null, action, unit_price, min_qty = 1, effective_from = null, effective_to = null, actorId, now = new Date() } = {}) {
  if (!organization?.id || organization.status !== 'active' || organization.approval_status !== 'approved') return { ok: false, reason: 'account_not_approved' };
  if (!product?.sku) return { ok: false, reason: 'product_not_found' };
  if (!['set', 'suspend'].includes(action)) return { ok: false, reason: 'invalid_contract_action' };
  const quantity = Number(min_qty);
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, reason: 'invalid_minimum_quantity' };
  if (action === 'suspend' && !existing) return { ok: false, reason: 'contract_price_not_found' };
  const from = effective_from ? dateOnly(effective_from) : null;
  const to = effective_to ? dateOnly(effective_to) : null;
  if ((effective_from && !from) || (effective_to && !to) || (from && to && to < from)) return { ok: false, reason: 'invalid_effective_dates' };
  const cost = Number(product.landed_cost ?? product.cogs ?? product.unit_cost ?? product.cost);
  const floor = minimumSellPrice(cost);
  const price = Number(unit_price ?? existing?.unit_price);
  if (action === 'set') {
    if (!Number.isFinite(cost) || cost <= 0) return { ok: false, reason: 'cost_basis_required' };
    if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: 'invalid_contract_price' };
    if (price + 1e-9 < floor) return { ok: false, reason: 'margin_floor_violation', minimum_price: floor };
  }
  const at = (now instanceof Date ? now : new Date(now)).toISOString();
  const row = {
    ...(existing || {}),
    id: existing?.id || stableId('contract', `${organization.id}:${product.sku}:${quantity}`),
    org_id: organization.id, product_sku: product.sku, min_qty: quantity,
    unit_price: Number.isFinite(price) ? +price.toFixed(2) : existing?.unit_price,
    effective_from: from, effective_to: to,
    status: action === 'suspend' ? 'suspended' : 'active',
    created_by: existing?.created_by || actorId,
    created_at: existing?.created_at || at,
    updated_by: actorId, updated_at: at,
    revision: Number(existing?.revision || 0) + 1,
  };
  return { ok: true, row, expected_revision: Number(existing?.revision || 0), minimum_price: floor };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const live = await authorizeLiveRequest(req, sql, { roles: ['admin'] });
    if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    const orgId = String(body.organization_id || '');
    const sku = String(body.product_sku || '').trim().toUpperCase();
    const minQty = Number(body.min_qty || 1);
    const [orgRows, productRows, contractRows] = await Promise.all([
      sql`SELECT data FROM um_rows WHERE tbl='organizations' AND id=${orgId} AND deleted=false LIMIT 1`,
      sql`SELECT data FROM um_rows WHERE tbl='products' AND deleted=false AND (id=${sku} OR data->>'sku'=${sku}) LIMIT 1`,
      sql`SELECT data FROM um_rows WHERE tbl='customer_contract_prices' AND deleted=false
        AND data->>'org_id'=${orgId} AND data->>'product_sku'=${sku}
        AND COALESCE((data->>'min_qty')::int,1)=${minQty} LIMIT 1`,
    ]);
    const plan = planContractPriceAction({
      organization: orgRows[0]?.data, product: productRows[0]?.data,
      existing: contractRows[0]?.data || null, action: body.action,
      unit_price: body.unit_price, min_qty: minQty,
      effective_from: body.effective_from, effective_to: body.effective_to,
      actorId: live.session.user_id,
    });
    if (!plan.ok) return sendJson(res, ['account_not_approved', 'product_not_found', 'contract_price_not_found'].includes(plan.reason) ? 404 : 400, { error: plan.reason, minimum_price: plan.minimum_price });
    const audit = {
      id: stableId('aud', `${plan.row.id}:${plan.row.revision}`), kind: 'account.contract_price_changed',
      ref_id: plan.row.id, actor_id: live.session.user_id,
      payload: { org_id: orgId, sku, min_qty: plan.row.min_qty, status: plan.row.status }, created_at: plan.row.updated_at,
    };
    const results = await sql.transaction((txn) => [
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        VALUES ('customer_contract_prices',${plan.row.id},${JSON.stringify(plan.row)}::jsonb,false,now())
        ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()
        WHERE COALESCE((um_rows.data->>'revision')::int,0)=${plan.expected_revision}
        RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='customer_contract_prices' AND id=${plan.row.id}
          AND COALESCE((data->>'revision')::int,0)=${plan.row.revision})
        ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!results[0]?.length) return sendJson(res, 409, { error: 'contract_price_changed_retry' });
    return sendJson(res, 200, { ok: true, contract_price: plan.row, minimum_price: plan.minimum_price });
  } catch {
    return sendJson(res, 500, { error: 'contract_price_update_failed' });
  }
}
