import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../../_lib/auth.js';
import { readRawBody, sendJson } from '../../_lib/http.js';
import { vendorPriceStatus } from '../../../src/lib/commercialPolicy.js';

function hash(value, length = 20) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}
function stableId(prefix, value) { return `${prefix}_${hash(value)}`; }
function number(value) { return Number(value) || 0; }
function stableLines(lines) {
  return [...lines].map((line) => ({ sku: line.sku, qty: Number(line.qty), cost: Number(line.cost) }))
    .sort((a, b) => a.sku.localeCompare(b.sku));
}

export function planReplenishmentPurchaseOrders({ products = [], inventory = [], vendors = [], actorId, idempotencyKey, now = new Date() } = {}) {
  if (!idempotencyKey) return { ok: false, reason: 'idempotency_key_required' };
  const groups = new Map();
  for (const product of products) {
    const pools = inventory.filter((row) => row.sku === product.sku && (row.owner_type || 'unite') === 'unite');
    const available = pools.reduce((sum, row) => sum + Math.max(0, number(row.on_hand) - number(row.reserved)), 0);
    const reorderAt = pools.reduce((sum, row) => sum + Math.max(0, number(row.reorder_at)), 0);
    if (available > reorderAt) continue;
    const qty = Math.max(0, Math.ceil(pools.reduce((sum, row) => sum + number(row.reorder_qty), 0) || number(product.reorder_qty)));
    const cost = number(product.cogs ?? product.unit_cost ?? product.cost);
    const vendorName = String(product.vendor || product.vendor_name || '').trim();
    if (!(qty > 0) || !(cost > 0) || !vendorName) continue;
    const vendor = vendors.find((row) => row.name === vendorName && row.status === 'approved');
    if (!vendor) continue;
    const line = { sku: product.sku, name: product.name, qty, cost, received_qty: 0, accepted_qty: 0 };
    const key = vendor.id || vendor.name;
    const group = groups.get(key) || { vendor, lines: [] };
    group.lines.push(line);
    groups.set(key, group);
  }
  const at = (now instanceof Date ? now : new Date(now)).toISOString();
  const purchaseOrders = [...groups.values()].map(({ vendor, lines }) => {
    const normalized = stableLines(lines);
    const id = stableId('po', `replenishment:${idempotencyKey}:${vendor.id || vendor.name}:${JSON.stringify(normalized)}`);
    return {
      id, po_type: 'inventory', vendor_name: vendor.name, vendor_id: vendor.id,
      vendor_email: vendor.contact_email || vendor.email || null,
      status: 'draft', revision: 1, receiving_revision: 0,
      created_by: actorId, created_at: at, updated_at: at,
      line_items: lines,
      total_cost: +lines.reduce((sum, line) => sum + line.qty * line.cost, 0).toFixed(2),
      wms_po_id: id, warehouse_id: 'wh_atl', idempotency_key: idempotencyKey,
    };
  });
  return purchaseOrders.length ? { ok: true, purchase_orders: purchaseOrders } : { ok: false, reason: 'no_replenishment_required' };
}

export function planSourcingOfferPurchaseOrder({ offer, vendor, request, actorId, expectedRevision, now = new Date() } = {}) {
  if (!offer) return { ok: false, reason: 'offer_not_found' };
  if (Number(offer.revision || 0) !== Number(expectedRevision)) return { ok: false, reason: 'offer_revision_changed' };
  if (offer.status !== 'reviewable') return { ok: false, reason: 'offer_needs_review' };
  if (!vendor || vendor.status !== 'approved') return { ok: false, reason: 'vendor_not_approved' };
  const lines = [];
  for (const line of offer.line_items || []) {
    const price = vendorPriceStatus(line, now);
    if (!price.reusable) return { ok: false, reason: `vendor_price_${price.reason}` };
    const qty = Number(line.qty);
    const cost = Number(line.unit_price);
    if (!line.sku || !Number.isInteger(qty) || qty <= 0 || !(cost > 0)) return { ok: false, reason: 'invalid_offer_line' };
    lines.push({ sku: line.sku, name: line.name, qty, cost, received_qty: 0, accepted_qty: 0 });
  }
  if (!lines.length) return { ok: false, reason: 'offer_lines_required' };
  const at = (now instanceof Date ? now : new Date(now)).toISOString();
  const poId = stableId('po', `offer:${offer.id}:revision:${Number(offer.revision || 0)}`);
  const purchaseOrder = {
    id: poId, po_type: 'inventory', vendor_name: offer.vendor_name || vendor.name,
    vendor_id: vendor.id, vendor_email: vendor.contact_email || vendor.email || null,
    vendor_offer_id: offer.id, sourcing_request_id: offer.sourcing_request_id,
    vendor_price_valid_until: (offer.line_items || []).map((line) => line.valid_until).filter(Boolean).sort()[0] || null,
    status: 'draft', revision: 1, receiving_revision: 0,
    line_items: lines, total_cost: +lines.reduce((sum, line) => sum + line.qty * line.cost, 0).toFixed(2),
    created_by: actorId, created_at: at, updated_at: at, wms_po_id: poId, warehouse_id: 'wh_atl',
  };
  return {
    ok: true, purchase_order: purchaseOrder, expected_offer_revision: Number(offer.revision || 0),
    offer: { ...offer, status: 'approved', approved_by: actorId, approved_at: at, purchase_order_id: poId, revision: Number(offer.revision || 0) + 1 },
    request: request ? { ...request, status: 'po_draft', selected_vendor_offer_id: offer.id, purchase_order_id: poId, updated_at: at } : null,
  };
}

async function rows(sql, table) {
  const result = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false`;
  return result.map((row) => row.data);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const live = await authorizeLiveRequest(req, sql, { roles: ['admin', 'sourcing_manager'] });
    if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    if (body.source === 'replenishment') {
      const idempotencyKey = String(body.idempotency_key || '').trim();
      if (idempotencyKey.length < 8) return sendJson(res, 400, { error: 'idempotency_key_required' });
      const [products, inventory, vendors] = await Promise.all([rows(sql, 'products'), rows(sql, 'inventory'), rows(sql, 'vendors')]);
      const plan = planReplenishmentPurchaseOrders({ products, inventory, vendors, actorId: live.session.user_id, idempotencyKey });
      if (!plan.ok) return sendJson(res, plan.reason === 'no_replenishment_required' ? 200 : 400, { ok: false, error: plan.reason, purchase_orders: [] });
      const audits = plan.purchase_orders.map((po) => ({
        id: stableId('aud', `${po.id}:drafted`), kind: 'replenish.po_drafted', ref_id: po.id,
        actor_id: live.session.user_id, payload: { vendor: po.vendor_name, lines: po.line_items.length, total: po.total_cost }, created_at: po.created_at,
      }));
      await sql.transaction((txn) => [
        ...plan.purchase_orders.map((po) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          VALUES ('purchase_orders',${po.id},${JSON.stringify(po)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING`),
        ...audits.map((audit) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          VALUES ('audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING`),
      ]);
      return sendJson(res, 200, { ok: true, purchase_orders: plan.purchase_orders });
    }
    if (body.source === 'sourcing_offer') {
      const offerId = String(body.offer_id || '');
      const [offerRows, vendorRows, requestRows] = await Promise.all([
        sql`SELECT data FROM um_rows WHERE tbl='vendor_offers' AND id=${offerId} AND deleted=false LIMIT 1`,
        rows(sql, 'vendors'), rows(sql, 'sourcing_requests'),
      ]);
      const offer = offerRows[0]?.data;
      const plan = planSourcingOfferPurchaseOrder({
        offer, vendor: vendorRows.find((row) => row.id === offer?.vendor_id),
        request: requestRows.find((row) => row.id === offer?.sourcing_request_id),
        actorId: live.session.user_id, expectedRevision: body.expected_revision,
      });
      if (!plan.ok) return sendJson(res, ['offer_not_found'].includes(plan.reason) ? 404 : 409, { error: plan.reason });
      const audit = {
        id: stableId('aud', `${plan.purchase_order.id}:drafted`), kind: 'sourcing.po_drafted',
        ref_id: plan.purchase_order.id, actor_id: live.session.user_id,
        payload: { offer_id: offer.id, request_id: offer.sourcing_request_id }, created_at: plan.purchase_order.created_at,
      };
      const results = await sql.transaction((txn) => [
        txn`UPDATE um_rows SET data=${JSON.stringify(plan.offer)}::jsonb,updated_at=now()
          WHERE tbl='vendor_offers' AND id=${offer.id} AND deleted=false AND data->>'status'='reviewable'
            AND COALESCE((data->>'revision')::int,0)=${plan.expected_offer_revision} RETURNING id`,
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          SELECT 'purchase_orders',${plan.purchase_order.id},${JSON.stringify(plan.purchase_order)}::jsonb,false,now()
          WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='vendor_offers' AND id=${offer.id} AND data->>'purchase_order_id'=${plan.purchase_order.id})
          ON CONFLICT (tbl,id) DO NOTHING`,
        ...(plan.request ? [txn`UPDATE um_rows SET data=${JSON.stringify(plan.request)}::jsonb,updated_at=now()
          WHERE tbl='sourcing_requests' AND id=${plan.request.id} AND deleted=false`] : []),
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
          WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='purchase_orders' AND id=${plan.purchase_order.id})
          ON CONFLICT (tbl,id) DO NOTHING`,
      ]);
      if (!results[0]?.length) return sendJson(res, 409, { error: 'offer_state_changed' });
      return sendJson(res, 200, { ok: true, purchase_order: plan.purchase_order, offer: plan.offer, request: plan.request });
    }
    return sendJson(res, 400, { error: 'invalid_draft_source' });
  } catch {
    return sendJson(res, 500, { error: 'purchase_order_draft_failed' });
  }
}
