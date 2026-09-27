import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { sessionFromRequest } from '../_lib/auth.js';
import { authorizeCommerceContext } from '../_lib/commerce.js';
import { buildDistributorBlindOrderDraft } from '../_lib/distributorOrders.js';
import { releasePaidOrder } from '../_lib/orderLifecycle.js';
import { createHostedOrderPayment } from '../_lib/stripeOrders.js';
import { logEvent, readRawBody, sendJson } from '../_lib/http.js';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}
function requestHash(session, body) {
  const normalized = {
    org_id: session.org_id,
    external_reference: String(body.external_reference || '').trim(),
    fulfillment_mode: body.fulfillment_mode,
    carrier_name: body.carrier_name,
    carrier_service: body.carrier_service || null,
    carrier_account_ref: body.carrier_account_ref || null,
    payment_method: body.payment_method || null,
    destination: body.destination || {},
    lines: (body.lines || []).map((row) => ({ source: row.source, sku: row.sku, qty: Number(row.qty) }))
      .sort((a, b) => `${a.source}:${a.sku}`.localeCompare(`${b.source}:${b.sku}`)),
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
async function rows(sql, table, where = null) {
  const result = where
    ? await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false AND data @> ${JSON.stringify(where)}::jsonb`
    : await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false`;
  return result.map((row) => row.data);
}
async function upsert(sql, table, row) {
  await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
    VALUES (${table},${String(row.id)},${JSON.stringify(row)}::jsonb,false,now())
    ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()`;
}

async function ensureHostedPayment(sql, order, items) {
  const result = await createHostedOrderPayment({
    order,
    items,
    customer: { email: order.contact_email, name: order.customer_name },
  });
  const now = new Date().toISOString();
  const request = {
    id: stableId('payreq', order.id), order_id: order.id, customer_id: order.customer_id,
    provider: 'stripe', method: order.payment_method,
    status: result.ok ? 'open' : result.reason,
    provider_invoice_id: result.provider_invoice_id || null,
    payment_url: result.payment_url || null,
    updated_at: now,
  };
  await upsert(sql, 'payment_requests', request);
  if (!result.ok) {
    await upsert(sql, 'tasks', {
      id: stableId('task', `${order.id}:payment_configuration`),
      kind: 'order_payment_configuration_required', status: 'open', ref_type: 'order', ref_id: order.id,
      subject: `Payment setup required for ${order.id}`, owner_email: 'ops@unitemedical.net', created_at: now,
    });
    return { order, payment_request: request };
  }
  const updatedOrder = {
    ...order,
    stripe_invoice_id: result.provider_invoice_id,
    payment_url: result.payment_url,
    updated_at: now,
  };
  await upsert(sql, 'orders', updatedOrder);
  await upsert(sql, 'invoices', {
    id: stableId('INV', order.id), order_id: order.id, customer_id: order.customer_id,
    amount: order.total, balance: order.total, status: 'open', provider: 'stripe',
    provider_invoice_id: result.provider_invoice_id, payment_url: result.payment_url,
    due_date: result.due_date || null, created_at: now,
  });
  return { order: updatedOrder, payment_request: request };
}

async function resumeDistributorOrder(sql, order, items, session, now = new Date().toISOString()) {
  let current = order;
  if (current.payment_status === 'not_required' || /^net\d+$/.test(current.payment_method)) {
    if (['inventory_reserved', 'ready_to_ship', 'ready_for_pickup', 'shipped'].includes(current.status)) return { ok: true, order: current };
    if (current.payment_status !== 'not_required' && current.payment_status !== 'terms_approved') {
      current = { ...current, payment_status: 'terms_approved', status: 'payment_released', credit_released_at: now };
      await upsert(sql, 'orders', current);
    }
    const released = await releasePaidOrder(sql, current.id, { actorId: session.user_id });
    if (!released.ok) return { ok: false, reason: released.reason, order: current };
    current = released.order;
    await upsert(sql, 'tasks', {
      id: stableId('task', `${current.id}:warehouse_prepare`),
      kind: 'distributor_blind_order_prepare', status: 'open', ref_type: 'order', ref_id: current.id,
      subject: `Prepare distributor order ${current.public_order_reference}`,
      owner_email: 'warehouse@unitemedical.net',
      payload: { fulfillment_mode: current.fulfillment_mode, carrier_name: current.carrier_name },
      created_at: now,
    });
    return { ok: true, order: current };
  }
  if (current.payment_url) return { ok: true, order: current };
  const payment = await ensureHostedPayment(sql, current, items);
  return { ok: true, order: payment.order, payment_request: payment.payment_request };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (session.role !== 'distributor' || !session.org_id) return sendJson(res, 403, { error: 'distributor_access_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  try {
    const raw = await readRawBody(req);
    const body = JSON.parse(raw.toString('utf8') || '{}');
    const idempotencyKey = String(req.headers['idempotency-key'] || body.idempotency_key || '').trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) return sendJson(res, 400, { error: 'idempotency_key_required' });
    const sql = neon(process.env.DATABASE_URL);
    const [profiles, organizations, memberships, distributorProducts, ownerLots, products, inventory, pricingRows, contractRows, volumeBreakRows, paymentMethods] = await Promise.all([
      rows(sql, 'profiles', { id: session.user_id }),
      rows(sql, 'organizations', { id: session.org_id }),
      rows(sql, 'organization_users', { user_id: session.user_id, org_id: session.org_id }),
      rows(sql, 'distributor_products', { owner_org_id: session.org_id }),
      rows(sql, 'inventory_lots', { owner_org_id: session.org_id }),
      rows(sql, 'products'), rows(sql, 'inventory'), rows(sql, 'pricing_rules'),
      rows(sql, 'account_prices', { org_id: session.org_id }), rows(sql, 'volume_price_breaks'),
      rows(sql, 'payment_methods', { org_id: session.org_id }),
    ]);
    const context = authorizeCommerceContext({
      session, profile: profiles[0], organization: organizations[0], membership: memberships[0],
    });
    if (!context.ok || context.session.role !== 'distributor') return sendJson(res, 403, { error: context.reason || 'distributor_access_required' });
    const orderId = stableId('DIST', `${session.user_id}:${idempotencyKey}`);
    const hash = requestHash(session, body);
    const existing = (await rows(sql, 'orders', { id: orderId }))[0];
    if (existing) {
      if (existing.request_hash !== hash) return sendJson(res, 409, { error: 'idempotency_key_reused_with_different_request' });
      const existingItems = await rows(sql, 'order_items', { order_id: orderId });
      const resumed = await resumeDistributorOrder(sql, existing, existingItems, session);
      if (!resumed.ok) return sendJson(res, 409, { error: resumed.reason, order: resumed.order });
      return sendJson(res, 200, { ok: true, duplicate: true, order: resumed.order, items: existingItems, payment_request: resumed.payment_request || null });
    }
    const draft = buildDistributorBlindOrderDraft({
      context, request: body, distributorProducts, ownerLots, products, inventory,
      pricingRows, contractRows, volumeBreakRows, paymentMethods,
    });
    if (!draft.ok) return sendJson(res, 400, { error: draft.reason, sku: draft.sku || null, available: draft.available });
    const now = new Date().toISOString();
    const creationNonce = crypto.randomBytes(16).toString('hex');
    let order = { id: orderId, ...draft.order, request_hash: hash, idempotency_key: idempotencyKey, creation_nonce: creationNonce };
    const items = draft.lines.map((line, index) => ({
      id: stableId('line', `${orderId}:${index}:${line.inventory_owner_type}:${line.sku}`),
      order_id: orderId, line_number: index + 1, ...line,
    }));
    const audit = {
      id: stableId('aud', `${orderId}:placed`), kind: 'distributor.order_placed', ref_id: orderId,
      actor_id: session.user_id,
      payload: { public_order_reference: order.public_order_reference, fulfillment_mode: order.fulfillment_mode },
      created_at: now,
    };
    const results = await sql.transaction((txn) => [
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('orders',${order.id},${JSON.stringify(order)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
      ...items.map((item) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'order_items',${item.id},${JSON.stringify(item)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${order.id} AND o.data->>'creation_nonce'=${creationNonce})
        ON CONFLICT (tbl,id) DO NOTHING`),
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${order.id} AND o.data->>'creation_nonce'=${creationNonce})
        ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!results[0]?.length) {
      const winner = (await rows(sql, 'orders', { id: orderId }))[0];
      if (!winner || winner.request_hash !== hash) return sendJson(res, 409, { error: 'idempotency_key_reused_with_different_request' });
      const winnerItems = await rows(sql, 'order_items', { order_id: orderId });
      const resumedWinner = await resumeDistributorOrder(sql, winner, winnerItems, session);
      if (!resumedWinner.ok) return sendJson(res, 409, { error: resumedWinner.reason, order: resumedWinner.order });
      return sendJson(res, 200, { ok: true, duplicate: true, order: resumedWinner.order, items: winnerItems, payment_request: resumedWinner.payment_request || null });
    }

    const resumed = await resumeDistributorOrder(sql, order, items, session, now);
    if (!resumed.ok) return sendJson(res, 409, { error: resumed.reason, order: resumed.order });
    order = resumed.order;
    logEvent('distributor.orders', 'placed', { order_id: order.id, org_id: session.org_id });
    return sendJson(res, 201, { ok: true, order, items });
  } catch (error) {
    logEvent('distributor.orders', 'error', { org_id: session.org_id, error: error.message });
    return sendJson(res, 500, { error: 'distributor_order_failed' });
  }
}
