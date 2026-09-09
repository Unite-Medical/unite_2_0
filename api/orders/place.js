import { validateEstimate } from '../_lib/checkoutEstimate.js';
import { orderApprovalGate } from '../_lib/orderApproval.js';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { sessionFromRequest } from '../_lib/auth.js';
import { buildAuthoritativeOrderDraft, loadCommerceContext } from '../_lib/commerce.js';
import { logEvent, readRawBody, sendJson } from '../_lib/http.js';
import { createHostedOrderPayment } from '../_lib/stripeOrders.js';
import { releasePaidOrder } from '../_lib/orderLifecycle.js';
import { createOrderLabel } from '../_lib/orderShipping.js';

async function rowsFor(sql, table) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false`;
  return rows.map((row) => row.data);
}

function stableOrderId(userId, key) {
  const digest = crypto.createHash('sha256').update(`${userId}:${key}`).digest('hex').slice(0, 16).toUpperCase();
  return `UM-${new Date().getUTCFullYear()}-${digest}`;
}

export function orderRequestHash(session, body = {}) {
  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .map((line) => ({ sku: String(line?.sku || '').trim(), qty: Number(line?.qty) }))
    .sort((a, b) => a.sku.localeCompare(b.sku));
  return crypto.createHash('sha256').update(JSON.stringify({
    user_id: session?.user_id || null,
    org_id: session?.org_id || null,
    po_number: String(body.po_number || '').trim(),
    estimate_id:body.estimate_id||null,shipping_option_id:body.shipping_option_id||null,
    payment_method: String(body.payment_method || '').trim(),
    ship_to_address_id: String(body.ship_to_address_id || '').trim(),
    ship_method: String(body.ship_method || 'fedex_ground'),
    lines,
  })).digest('hex');
}

function statusFor(reason) {
  if (reason === 'authentication_required') return 401;
  if (['account_not_approved', 'profile_inactive', 'organization_inactive', 'membership_inactive', 'buyer_authority_required', 'role_changed'].includes(reason)) return 403;
  if (reason === 'insufficient_stock') return 409;
  return 400;
}

function publicOrder(order) {
  return {
    id: order.id,
    customer_id: order.customer_id,
    status: order.status,
    payment_status: order.payment_status,
    subtotal: order.subtotal,
    freight: order.freight,
    tax: order.tax,
    total: order.total,
    po_number: order.po_number,
    payment_method: order.payment_method,
    ship_to_address_id: order.ship_to_address_id,
    placed_at: order.placed_at,
    payment_url: order.payment_url || null,
    approval_required: !orderApprovalGate(order).ok,
    approval_status: order.approval?.status || null,
  };
}

async function upsertRow(sql, table, row) {
  await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
    VALUES (${table},${String(row.id)},${JSON.stringify(row)}::jsonb,false,now())
    ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()`;
}

export async function ensureOrderPayment(sql, order, orderItems) {
  if(['cancelled','refunded','shipped','delivered'].includes(order?.status))return {order,payment:{ok:false,reason:'order_already_closed'}};
  const gate=orderApprovalGate(order);
  if(!gate.ok) return {order,payment:{ok:false,reason:gate.reason}};
  if (['net15', 'net30', 'net60', 'mspv'].includes(order.payment_method)) {
    const releasedOrder = { ...order, payment_status: 'terms_approved', credit_released_at: new Date().toISOString() };
    const saved=await sql`UPDATE um_rows SET data=${JSON.stringify(releasedOrder)}::jsonb,updated_at=now() WHERE tbl='orders' AND id=${order.id} AND deleted=false AND data=${JSON.stringify(order)}::jsonb RETURNING id`;
    if(!saved.length)return {order,payment:{ok:false,reason:'order_changed_retry'}};
    const release = await releasePaidOrder(sql, order.id, { actorId: 'approved_credit_terms' });
    const label = release.ok ? await createOrderLabel(sql, order.id, { actorId: 'approved_credit_terms' }) : null;
    return { order: label?.ok ? label.order : release.ok ? release.order : releasedOrder, payment: { ok: true, terms_released: true }, release, label };
  }
  const payment = await createHostedOrderPayment({ order, items: orderItems });
  const now = new Date().toISOString();
  const request = {
    id: `payment_request_${order.id}`, order_id: order.id, customer_id: order.customer_id,
    method: order.payment_method, amount: order.total,
    provider: 'stripe', provider_invoice_id: payment.provider_invoice_id || null,
    payment_url: payment.payment_url || null,
    status: payment.ok ? 'open' : payment.reason === 'stripe_not_configured' ? 'configuration_required' : 'retry_required',
    error: payment.ok ? null : payment.reason,
    updated_at: now, created_at: now,
  };
  await upsertRow(sql, 'payment_requests', request);
  if (!payment.ok) {
    await upsertRow(sql, 'tasks', {
      id: `task_payment_${order.id}`, kind: 'order_payment_setup',
      subject: `Create payment request for ${order.id}`, owner_email: 'accounting@unitemedical.net',
      status: 'open', ref_type: 'order', ref_id: order.id,
      payload: { reason: payment.reason, amount: order.total }, created_at: now,
    });
    return { order, payment };
  }
  const updatedOrder = {
    ...order,
    stripe_invoice_id: payment.provider_invoice_id,
    payment_url: payment.payment_url,
    payment_request_status: 'open',
  };
  const saved=await sql`UPDATE um_rows SET data=${JSON.stringify(updatedOrder)}::jsonb,updated_at=now() WHERE tbl='orders' AND id=${order.id} AND deleted=false AND data=${JSON.stringify(order)}::jsonb RETURNING id`;
  if(!saved.length)return {order,payment:{ok:false,reason:'order_changed_payment_reconciliation_required'}};
  await upsertRow(sql, 'invoices', {
    id: `INV-${order.id}`, order_id: order.id, customer_id: order.customer_id,
    amount: order.total, terms: order.payment_terms, status: 'open',
    stripe_invoice_id: payment.provider_invoice_id,
    payment_url: payment.payment_url, created_at: now,
  });
  return { order: updatedOrder, payment };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (session.role !== 'customer') return sendJson(res, 403, { error: 'customer_order_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });

  try {
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    const idempotencyKey = String(body.idempotency_key || '').trim();
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) return sendJson(res, 400, { error: 'idempotency_key_required' });
    const sql = neon(process.env.DATABASE_URL);
    const context = await loadCommerceContext(sql, session);
    if (!context.ok) return sendJson(res, statusFor(context.reason), { error: context.reason });

    const orderId = stableOrderId(session.user_id, idempotencyKey);
    const requestHash = orderRequestHash(session, body);
    const existingRows = await sql`SELECT data FROM um_rows WHERE tbl='orders' AND id=${orderId} AND deleted=false LIMIT 1`;
    if (existingRows[0]?.data) {
      const existing = existingRows[0].data;
      if (existing.customer_id !== session.org_id) return sendJson(res, 403, { error: 'order_owner_mismatch' });
      if (existing.request_hash && existing.request_hash !== requestHash) return sendJson(res, 409, { error: 'idempotency_conflict' });
      const itemRows = await sql`SELECT data FROM um_rows WHERE tbl='order_items' AND deleted=false AND data->>'order_id'=${orderId}`;
      const ensured = existing.payment_url || ['paid', 'terms_approved'].includes(existing.payment_status)
        ? { order: existing }
        : await ensureOrderPayment(sql, existing, itemRows.map((row) => row.data));
      return sendJson(res, 200, { ok: true, duplicate: true, order: publicOrder(ensured.order), payment: ensured.payment || null });
    }

    const [products, pricingRows, contractRows, volumeBreakRows, paymentMethods, addresses, inventoryRows] = await Promise.all([
      rowsFor(sql, 'products'), rowsFor(sql, 'pricing'), rowsFor(sql, 'customer_contract_prices'),
      rowsFor(sql, 'volume_breaks'), rowsFor(sql, 'account_payment_methods'), rowsFor(sql, 'addresses'), rowsFor(sql, 'inventory'),
    ]);
    const draft = buildAuthoritativeOrderDraft({
      context,
      request: {
        po_number: body.po_number,
        payment_method: body.payment_method,
        ship_to_address_id: body.ship_to_address_id,
        ship_method: body.ship_method,
        notes: body.notes,
        order_source: body.order_source,
        lines: body.lines,
      },
      products, pricingRows, contractRows, volumeBreakRows, paymentMethods, addresses,
    });
    if (!draft.ok) return sendJson(res, statusFor(draft.reason), { error: draft.reason, sku: draft.sku || null });
    const estimates=await sql`SELECT data FROM um_rows WHERE tbl='checkout_estimates' AND id=${String(body.estimate_id||'')} AND deleted=false AND data->>'customer_id'=${session.org_id}`;
    const checked=validateEstimate(estimates[0]?.data,draft,body.shipping_option_id);
    if(!checked.ok)return sendJson(res,409,{error:checked.reason});
    const option=checked.option;
    Object.assign(draft.order,{freight:option.freight,tax:option.tax,total:option.total,ship_method:option.service,carrier:option.carrier,shipping_package:option.shipping_package,ship_from:option.ship_from,tax_calculation_id:option.tax_calculation_id,tax_basis:option.tax_basis,estimate_id:body.estimate_id,totals_verified:true});
    if(draft.payment_grant.credit_limit!=null&&/^net\d+$/.test(draft.order.payment_method)&&draft.order.total>Number(draft.payment_grant.credit_limit))return sendJson(res,409,{error:'over_credit_limit'});


    for (const line of draft.lines) {
      const available = inventoryRows
        .filter((row) => row.sku === (line.inventory_sku || line.sku) && (row.owner_type || 'unite') === 'unite')
        .reduce((sum, row) => sum + Math.max(0, Number(row.on_hand || 0) - Number(row.reserved || 0)), 0);
      if (available < line.qty) return sendJson(res, 409, { error: 'insufficient_stock', sku: line.sku, available });
    }

    const creationNonce = crypto.randomBytes(16).toString('hex');
    const order = { id: orderId, ...draft.order, idempotency_key: idempotencyKey, request_hash: requestHash, fulfillment_revision: 0, creation_nonce: creationNonce };
    const orderItems = draft.lines.map((line, index) => ({
      id: `${orderId}-line-${index + 1}`,
      order_id: orderId,
      customer_id: order.customer_id,
      ...line,
      status: 'pending',
    }));
    const audit = {
      id: `aud_${crypto.randomBytes(12).toString('hex')}`,
      kind: 'order.placed_server', ref_id: orderId, actor_id: session.user_id,
      payload: { total: order.total, items: orderItems.length, payment_method: order.payment_method, po_number: order.po_number },
      created_at: new Date().toISOString(),
    };

    const results = await sql.transaction((txn) => [
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('orders',${order.id},${JSON.stringify(order)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
      ...orderItems.map((item) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'order_items',${item.id},${JSON.stringify(item)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${order.id} AND o.data->>'creation_nonce'=${creationNonce})
        ON CONFLICT (tbl,id) DO NOTHING`),
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${order.id} AND o.data->>'creation_nonce'=${creationNonce})
        ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!results[0]?.length) {
      const winnerRows = await sql`SELECT data FROM um_rows WHERE tbl='orders' AND id=${orderId} AND deleted=false LIMIT 1`;
      const winner = winnerRows[0]?.data;
      if (!winner || winner.customer_id !== session.org_id) return sendJson(res, 409, { error: 'order_creation_conflict' });
      if (winner.request_hash !== requestHash) return sendJson(res, 409, { error: 'idempotency_conflict' });
      const winnerItemRows = await sql`SELECT data FROM um_rows WHERE tbl='order_items' AND deleted=false AND data->>'order_id'=${orderId}`;
      const ensuredWinner = winner.payment_url || ['paid', 'terms_approved'].includes(winner.payment_status)
        ? { order: winner }
        : await ensureOrderPayment(sql, winner, winnerItemRows.map((row) => row.data));
      return sendJson(res, 200, { ok: true, duplicate: true, order: publicOrder(ensuredWinner.order), payment: ensuredWinner.payment || null });
    }
    const ensured = await ensureOrderPayment(sql, order, orderItems);
    logEvent('orders.place', 'created', { order_id: order.id, user_id: session.user_id, org_id: session.org_id, total: order.total, payment: ensured.payment?.ok || false });
    return sendJson(res, 201, {
      ok: true,
      order: publicOrder(ensured.order),
      payment: ensured.payment || null,
      lines: orderItems.map((item) => ({ sku: item.sku, name: item.name, qty: item.qty, unit_price: item.unit_price, ext_price: item.ext_price })),
    });
  } catch (error) {
    logEvent('orders.place', 'error', { user_id: session.user_id, error: error.message });
    return sendJson(res, 500, { error: 'order_placement_failed' });
  }
}
