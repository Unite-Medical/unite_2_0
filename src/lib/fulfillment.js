/**
 * Zero-touch fulfillment orchestrator — PRD-24.
 *
 * Given an order, run the full downstream pipeline — validate → reserve
 * inventory → payment → QBO invoice → ShipStation label → packing slip
 * PDF → customer notifications — recording every step in
 * `fulfillment_pipeline` with retries + per-integration circuit breakers.
 * Any single integration can fail without killing the order (the brief's
 * "enter data once, sync everywhere", made resilient).
 *
 * Idempotent: re-running an order skips already-completed steps and only
 * retries failed/pending ones. Backorders are created when stock is
 * insufficient and auto-fulfill when inventory replenishes
 * (`fulfillBackorders`). Returns/refunds run through `createReturn`.
 *
 * Everything calls the same external clients used elsewhere, so it runs
 * in stub mode today and flips to live when each service's env vars land.
 */

import { db } from './db.js';
import { uid } from './format.js';
import { qbo, stripe, shipstation, gmail } from './services.js';
import { generateDocument } from './documents.js';
import { reservations } from './wms/reservations.js';
import { availability } from './wms/availability.js';
import { ledger } from './wms/ledger.js';
import { shipping } from './wms/shipping.js';
import { notifyRecipients } from './notifications.js';
import { blindShip } from './blindShip.js';
import { consignment } from './consignment.js';
import { createBackorderSuborder, planFulfillableBatch } from './orderBatches.js';

export const PIPELINE_STEPS = ['validate', 'payment', 'reserve', 'invoice', 'shipping', 'packing_slip', 'notify', 'delivered'];

// ---------------------------------------------------------------------------
// Circuit breakers (in-memory; resets on reload — fine for the demo)
// ---------------------------------------------------------------------------

const BREAKER_THRESHOLD = 5;
const BREAKER_WINDOW_MS = 10 * 60 * 1000;
const breakers = new Map(); // integration -> { failures: ts[], open: bool }

function recordFailure(integration) {
  const b = breakers.get(integration) || { failures: [] };
  const now = Date.now();
  b.failures = b.failures.filter((t) => now - t < BREAKER_WINDOW_MS);
  b.failures.push(now);
  b.open = b.failures.length >= BREAKER_THRESHOLD;
  breakers.set(integration, b);
}
function isOpen(integration) {
  const b = breakers.get(integration);
  if (!b) return false;
  const now = Date.now();
  b.failures = b.failures.filter((t) => now - t < BREAKER_WINDOW_MS);
  b.open = b.failures.length >= BREAKER_THRESHOLD;
  return b.open;
}
function recordSuccess(integration) {
  breakers.set(integration, { failures: [], open: false });
}

export function breakerStatus() {
  return [...breakers.entries()].map(([integration, b]) => ({ integration, open: b.open, recent_failures: b.failures.length }));
}

// ---------------------------------------------------------------------------
// Pipeline-row helpers
// ---------------------------------------------------------------------------

function stepRow(orderId, step) {
  return db.list('fulfillment_pipeline', { where: { order_id: orderId, step } })[0] || null;
}

function setStep(orderId, step, patch) {
  const existing = stepRow(orderId, step);
  if (existing) return db.update('fulfillment_pipeline', existing.id, patch);
  return db.insert('fulfillment_pipeline', {
    id: uid('fp'), order_id: orderId, step, status: 'pending', attempt_count: 0, ...patch,
  });
}

/**
 * Run a single step with retry + circuit breaker. `fn` returns a result
 * object on success or throws on failure. Skips if already completed.
 */
async function runStep(orderId, step, { integration, fn, onProgress, retries = 2 }) {
  const existing = stepRow(orderId, step);
  if (existing?.status === 'completed') {
    onProgress?.({ step, status: 'skipped', label: `${step}: already done` });
    return existing.result;
  }
  if (integration && isOpen(integration)) {
    setStep(orderId, step, { status: 'failed', error_message: `circuit_open:${integration}`, last_attempt_at: new Date().toISOString() });
    onProgress?.({ step, status: 'degraded', label: `${step}: ${integration} circuit open — skipped` });
    return null;
  }

  let attempt = (existing?.attempt_count || 0);
  let lastErr = null;
  while (attempt <= retries) {
    attempt += 1;
    setStep(orderId, step, { status: 'processing', attempt_count: attempt, last_attempt_at: new Date().toISOString() });
    try {
      const result = await fn();
      if (integration) recordSuccess(integration);
      setStep(orderId, step, { status: 'completed', result, error_message: null, completed_at: new Date().toISOString() });
      onProgress?.({ step, status: 'completed', label: `${step}: ok` });
      return result;
    } catch (err) {
      lastErr = err;
      if (integration) recordFailure(integration);
      setStep(orderId, step, { status: 'failed', error_message: err.message });
    }
  }
  onProgress?.({ step, status: 'failed', label: `${step}: ${lastErr?.message || 'failed'}` });
  return null;
}

// ---------------------------------------------------------------------------
// Inventory helpers
// ---------------------------------------------------------------------------

// Available-to-promise for a sku (on_hand − reserved), via the WMS read layer.
function availableForSku(sku) {
  return availability.availableToPromise(sku);
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runFulfillment(orderId, { onProgress = () => {} } = {}) {
  const order = db.get('orders', orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);
  const items = db.list('order_items', { where: { order_id: orderId } });
  if (!items.length) throw new Error(`Order ${orderId} has no items`);

  // STEP 1 — validate
  await runStep(orderId, 'validate', {
    onProgress,
    fn: async () => {
      if (!order.customer_id) throw new Error('order missing customer');
      const bad = items.find((i) => !(Number(i.unit_price) >= 0));
      if (bad) throw new Error(`bad pricing on ${bad.sku}`);
      return { ok: true, line_count: items.length };
    },
  });

  const batchPlan = planFulfillableBatch({
    order,
    items,
    availableBySku: (sku) => availableForSku(sku),
    availableForItem: (item) => item.inventory_owner_type === 'distributor' && item.inventory_owner_org_id
      ? consignment.availableFor({ owner_org_id: item.inventory_owner_org_id, sku: item.sku, distributor_sku: item.distributor_sku || null })
      : availableForSku(item.sku),
  });
  const shipItems = batchPlan.ship_lines;
  const backorders = [];
  for (const line of batchPlan.backorder_lines) {
    const original = items.find((item) => item.id === line.id) || items.find((item) => item.sku === line.sku);
    const existing = db.list('backorders', { where: { order_id: orderId, order_item_id: original?.id } })
      .find((row) => ['pending', 'stock_arrived', 'suborder_created'].includes(row.status));
    if (!existing) {
      backorders.push(db.insert('backorders', {
        id: uid('bo'),
        order_id: orderId,
        parent_order_id: order.parent_order_id || orderId,
        order_item_id: original?.id || null,
        customer_id: order.customer_id,
        assigned_owner_email: order.account_owner_email || null,
        sku: line.sku,
        product_name: line.name,
        quantity: line.qty,
        unit_price: line.unit_price,
        inventory_owner_type: line.inventory_owner_type || null,
        inventory_owner_org_id: line.inventory_owner_org_id || null,
        distributor_sku: line.distributor_sku || null,
        status: 'pending',
        eta_status: 'date_pending',
        estimated_restock: null,
        created_at: new Date().toISOString(),
      }));
    } else {
      backorders.push(existing);
    }
  }
  db.update('orders', orderId, {
    chargeable_total: batchPlan.charge_total,
    chargeable_merchandise_total: batchPlan.merchandise_total,
    chargeable_shipping_total: batchPlan.shipping_total,
    backorder_value: batchPlan.backorder_value,
    status: backorders.length ? 'partially_backordered' : order.status,
  });
  for (const item of items) {
    const shipLine = shipItems.find((line) => line.id === item.id) || shipItems.find((line) => line.sku === item.sku);
    db.update('order_items', item.id, {
      fulfillment_qty: Number(shipLine?.qty || 0),
      backorder_qty: Math.max(0, Number(item.qty || 0) - Number(shipLine?.qty || 0)),
    });
  }

  // STEP 2 — collect only the current available batch, or release an approved
  // credit account. No reservation exists before this step succeeds.
  const organization = db.get('organizations', order.customer_id);
  const terms = String(order.payment_terms || order.payment_method || '').toLowerCase();
  const approvedCredit = ['net15', 'net30', 'net60', 'mspv'].includes(terms)
    && Number(organization?.credit_limit || 0) >= batchPlan.charge_total
    && organization?.credit_status !== 'suspended';
  const priorPaymentStep = stepRow(orderId, 'payment');
  if (priorPaymentStep?.status === 'completed'
      && priorPaymentStep.result?.released === false
      && (order.payment_status === 'paid' || approvedCredit)) {
    setStep(orderId, 'payment', { status: 'pending', result: null, completed_at: null });
  }
  const paymentResult = await runStep(orderId, 'payment', {
    integration: 'stripe',
    onProgress,
    fn: async () => {
      if (!shipItems.length) return { released: false, reason: 'no_available_items', amount: 0 };
      if (order.payment_status === 'paid') return { released: true, already_paid: true, amount: batchPlan.charge_total };
      if (approvedCredit) {
        db.update('orders', orderId, { payment_status: 'terms_approved', credit_released_at: new Date().toISOString() });
        return { released: true, method: terms, amount: batchPlan.charge_total };
      }
      if (order.payment_method === 'card') {
        const pi = await stripe.createPaymentIntent({ amount: batchPlan.charge_total, currency: 'usd', metadata: { order_id: orderId } });
        await stripe.confirmPaymentIntent(pi.id);
        db.update('orders', orderId, { payment_status: 'paid', paid_amount: batchPlan.charge_total, paid_at: new Date().toISOString() });
        return { released: true, payment_intent_id: pi.id, method: 'card', amount: batchPlan.charge_total };
      }
      const customer = await stripe.upsertCustomer({ org: { id: order.customer_id, name: order.customer_name, segment: order.segment } });
      const inv = await stripe.createInvoice({
        stripe_customer_id: customer.id,
        line_items: shipItems.map((item) => ({ qty: item.qty, unit_price: item.unit_price, name: item.name, product_sku: item.sku })),
        terms: order.payment_terms,
        order_id: orderId,
      });
      db.update('orders', orderId, { payment_status: 'pending', stripe_invoice_id: inv.stripe_invoice_id });
      return { released: false, stripe_invoice_id: inv.stripe_invoice_id, method: order.payment_method, amount: batchPlan.charge_total };
    },
  });

  if (!paymentResult?.released) {
    const steps = db.list('fulfillment_pipeline', { where: { order_id: orderId } });
    return { order_id: orderId, steps, backorders, payment_pending: true, failed: [] };
  }

  // STEP 3 — reserve only the paid/credit-released batch. Stock is held here,
  // after release, and on_hand still moves only at ship confirm.
  await runStep(orderId, 'reserve', {
    integration: 'wms',
    onProgress,
    fn: async () => {
      const uniteItems = shipItems.filter((item) => item.inventory_owner_type !== 'distributor');
      const distributorItems = shipItems.filter((item) => item.inventory_owner_type === 'distributor' && item.inventory_owner_org_id);
      const result = reservations.reserve({ id: orderId, items: uniteItems.map((item) => ({ sku: item.sku, qty: item.qty })) });
      const ownerLines = [];
      let ownerShortfall = 0;
      for (const item of distributorItems) {
        const reserved = consignment.reserveForOrder({
          order_id: orderId,
          owner_org_id: item.inventory_owner_org_id,
          sku: item.sku,
          distributor_sku: item.distributor_sku || null,
          qty: item.qty,
        });
        ownerLines.push(...(reserved.lines || []));
        ownerShortfall += Number(reserved.shortfall || 0);
      }
      if (result.shortfall > 0 || ownerShortfall > 0) {
        db.insert('tasks', {
          id: uid('task'), kind: 'paid_order_allocation_shortfall', subject: `Paid order ${orderId} lost allocation`,
          owner_email: 'ops@unitemedical.net', status: 'open', ref_type: 'order', ref_id: orderId,
          payload: { lines: [...result.lines, ...ownerLines], owner_shortfall: ownerShortfall }, created_at: new Date().toISOString(),
        });
        throw new Error('paid_order_allocation_shortfall');
      }
      return { reserved: [...result.lines, ...ownerLines], backordered: backorders.length };
    },
  });

  // STEP 4 — QBO invoice (non-blocking: order proceeds even if it fails)
  await runStep(orderId, 'invoice', {
    integration: 'qbo',
    onProgress,
    retries: 1,
    fn: async () => {
      const existing = db.list('invoices', { where: { order_id: orderId } })[0];
      if (existing?.qbo_id) return { qbo_invoice_id: existing.qbo_id, reused: true };
      const customerId = db.get('organizations', order.customer_id)?.qbo_customer_id
        || (await qbo.upsertCustomer({ org: { id: order.customer_id, name: order.customer_name, segment: order.segment } }))?.id;
      const invoiceItems = shipItems.map((item) => ({ qty: item.qty, unit_price: item.unit_price, name: item.name, product_sku: item.sku }));
      if (batchPlan.shipping_total > 0) invoiceItems.push({ qty: 1, unit_price: batchPlan.shipping_total, name: 'Shipping', product_sku: 'SHIPPING' });
      const qboInvoice = await qbo.createInvoice({
        order_id: orderId, qbo_customer_id: customerId,
        items: invoiceItems,
        terms: order.payment_terms,
      });
      let invoiceRow = existing;
      const currentOrder = db.get('orders', orderId);
      if (!existing) {
        invoiceRow = db.insert('invoices', {
          id: qboInvoice.doc_number, order_id: orderId, customer_id: order.customer_id,
          amount: batchPlan.charge_total, terms: order.payment_terms, status: 'open',
          qbo_id: qboInvoice.qbo_invoice_id, due_date: qboInvoice.due_date,
        });
      }
      // PRD-26 §7: card orders paid up front — record the QBO payment + a
      // canonical payment row + mark the invoice paid (idempotent).
      if (currentOrder?.payment_status === 'paid' && invoiceRow && invoiceRow.status !== 'paid') {
        try { await qbo.recordPayment({ qbo_invoice_id: qboInvoice.qbo_invoice_id, amount: batchPlan.charge_total, method: order.payment_method }); } catch { /* queued */ }
        db.update('invoices', invoiceRow.id, { status: 'paid', balance: 0, paid_at: new Date().toISOString(), payment_method: order.payment_method });
        if (!db.list('payments', { where: { order_id: orderId } }).length) {
          db.insert('payments', { id: uid('pmt'), invoice_id: invoiceRow.id, order_id: orderId, amount: batchPlan.charge_total, method: order.payment_method, source: 'stripe', received_at: new Date().toISOString() });
        }
      }
      return { qbo_invoice_id: qboInvoice.qbo_invoice_id, doc_number: qboInvoice.doc_number };
    },
  });

  // STEP 5 — ShipStation label (rate-shop + create)
  await runStep(orderId, 'shipping', {
    integration: 'shipstation',
    onProgress,
    fn: async () => {
      const existing = db.list('shipments', { where: { order_id: orderId } })[0];
      if (existing?.tracking_number) return { tracking_number: existing.tracking_number, reused: true };
      const weight = Math.max(2, shipItems.reduce((a, b) => a + b.qty * 0.6, 0));
      let carrier = order.ship_method || 'fedex_ground';
      try {
        const rates = await shipstation.getRates({ weight_lbs: +weight.toFixed(1) });
        const cheapest = (rates?.rates || rates || []).slice().sort((a, b) => (a.shipmentCost ?? a.total ?? 0) - (b.shipmentCost ?? b.total ?? 0))[0];
        if (cheapest?.carrierCode || cheapest?.carrier) carrier = cheapest.serviceCode || cheapest.carrierCode || carrier;
      } catch { /* rate-shop best effort */ }
      // PRD-27 §6/§8: blind/white-label ship-from identity + third-party billing.
      const blind = blindShip.shipOptionsFor(order);
      const label = await shipstation.createLabel({
        order_id: orderId, carrier, warehouse_id: order.ship_from_warehouse || 'wh_atl', weight_lbs: +weight.toFixed(1),
        ship_from: blind.shipFrom, bill_to_third_party: blind.billToThirdParty,
      });
      db.insert('shipments', {
        id: `shp_${orderId}`, order_id: orderId, carrier: label.carrier, tracking_number: label.tracking_number,
        label_url: label.label_url, status: 'label_created', weight_lbs: +weight.toFixed(1),
        warehouse_id: order.ship_from_warehouse || 'wh_atl',
        events: [{ ts: new Date().toISOString(), label: 'Label created (orchestrator)' }],
      });
      db.update('orders', orderId, { tracking_number: label.tracking_number, carrier: label.carrier, status: 'ready_to_ship' });
      return { tracking_number: label.tracking_number, carrier: label.carrier, status: 'label_created' };
    },
  });

  // STEP 6 — packing slip PDF (+ blind-ship paperwork / required inserts)
  await runStep(orderId, 'packing_slip', {
    onProgress,
    fn: async () => {
      const docs = blindShip.packingDocsFor(order);
      const { record } = generateDocument({ type: 'packing_slip', ref_id: orderId, ref_type: 'order' });
      return { document_id: record.id, blind: docs.blind, template: docs.template, inserts: docs.inserts.map((d) => d.name) };
    },
  });

  // STEP 7 — notify all CC recipients on the account (PRD-26 §8): order
  // confirmation + invoice + shipping/tracking + any backorder note, fanned
  // out to every subscribed recipient through the Resend-primary mailer.
  await runStep(orderId, 'notify', {
    integration: 'gmail',
    onProgress,
    fn: async () => {
      const org = db.get('organizations', order.customer_id) || { id: order.customer_id, name: order.customer_name };
      const fallback = order.contact_email || `ap@${String(order.customer_name || 'customer').toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`;
      const placed = await notifyRecipients(org, 'order_placed', { order, fallback });
      const invoice = db.list('invoices', { where: { order_id: orderId } })[0];
      if (invoice) await notifyRecipients(org, 'invoice', { order, fallback, body: `Invoice ${invoice.id} for order ${orderId} ($${batchPlan.charge_total.toLocaleString()}) — terms ${order.payment_terms}.` });
      if (backorders.length) await notifyRecipients(org, 'backorder', { order, fallback });
      return { notified: placed.recipients, count: placed.recipients.length };
    },
  });

  // STEP 8 — delivered: stays pending until the ShipStation/carrier webhook
  if (!stepRow(orderId, 'delivered')) {
    setStep(orderId, 'delivered', { status: 'pending' });
  }

  db.update('orders', orderId, { fulfillment_ran_at: new Date().toISOString() });
  const steps = db.list('fulfillment_pipeline', { where: { order_id: orderId } });
  const failed = steps.filter((s) => s.status === 'failed');
  onProgress({ step: 'done', status: 'done', label: `Pipeline complete · ${failed.length} failed step(s)` });
  return { order_id: orderId, steps, backorders, failed: failed.map((s) => s.step) };
}

/**
 * Confirm physical carrier pickup or documented custody transfer. Label creation
 * alone never moves inventory or emits a shipped notification.
 */
export async function confirmShipmentHandoff(orderId, {
  actor_id = null,
  handoff_reference = null,
} = {}) {
  const order = db.get('orders', orderId);
  if (!order) return { ok: false, reason: 'order_not_found' };
  const shipment = db.list('shipments', { where: { order_id: orderId } })[0];
  if (!shipment) return { ok: false, reason: 'shipment_not_found' };
  if (shipment.status === 'shipped') return { ok: true, idempotent: true, order, shipment };
  if (shipment.status !== 'label_created') return { ok: false, reason: `cannot_handoff_${shipment.status}` };
  const actor = String(actor_id || '').trim();
  const reference = String(handoff_reference || '').trim();
  if (!actor) return { ok: false, reason: 'handoff_actor_required' };
  if (!reference) return { ok: false, reason: 'handoff_reference_required' };

  const ship = shipping.confirmShip(orderId, { actor_id: actor });
  if (!ship.ok) return ship;
  const handedOffAt = new Date().toISOString();
  const updatedShipment = db.update('shipments', shipment.id, {
    status: 'shipped',
    handed_off_at: handedOffAt,
    handed_off_by: actor,
    handoff_reference: reference,
    events: [
      ...(shipment.events || []),
      { ts: handedOffAt, label: 'Carrier pickup / custody transfer confirmed', reference, actor },
    ],
  });
  const updatedOrder = db.update('orders', orderId, {
    status: 'shipped', shipped_at: handedOffAt,
  });
  for (const ownerOrgId of ship.consignment_owner_org_ids || []) {
    await consignment.notifyLowStock(ownerOrgId);
  }

  const recipientOrgId = order.blind_ship
    ? (order.on_behalf_of_org_id || order.customer_id)
    : order.customer_id;
  const recipientOrg = db.get('organizations', recipientOrgId) || { id: recipientOrgId };
  const fallback = order.blind_ship
    ? (recipientOrg.contact_email || recipientOrg.billing_email || null)
    : (order.contact_email || recipientOrg.contact_email || recipientOrg.billing_email || null);
  await notifyRecipients(recipientOrg, 'shipped', {
    order: updatedOrder,
    fallback,
    carrier: updatedShipment.carrier,
    tracking: updatedShipment.tracking_number,
  });
  return { ok: true, order: updatedOrder, shipment: updatedShipment, ship };
}

/**
 * Mark an order delivered (called from the ShipStation SHIP/DELIVER
 * webhook in the bus). Decrements reserved → shipped, closes the step.
 */
export function markDelivered(orderId) {
  setStep(orderId, 'delivered', { status: 'completed', completed_at: new Date().toISOString(), result: { delivered: true } });
  db.update('orders', orderId, { status: 'delivered' });
  return { ok: true };
}

/**
 * Convert stock-arrived backorders into reviewable, unpaid suborders. Nothing
 * ships here. The suborder re-enters the normal payment, reserve, invoice, and
 * shipment flow after its own freight has been calculated.
 */
export async function fulfillBackorders(sku, { shipping_cost = null, onProgress = () => {} } = {}) {
  const candidates = db.list('backorders')
    .filter((backorder) => backorder.sku === sku && ['pending', 'stock_arrived'].includes(backorder.status));
  const groups = new Map();
  for (const backorder of candidates) {
    const parentId = backorder.parent_order_id || backorder.order_id;
    if (!groups.has(parentId)) groups.set(parentId, []);
    groups.get(parentId).push(backorder);
  }

  const suborders = [];
  const ready = [];
  const remainingByPool = new Map();
  for (const [parentId, backorders] of groups) {
    const first = backorders[0];
    const poolKey = `${first?.inventory_owner_type || 'unite'}:${first?.inventory_owner_org_id || 'unite'}:${sku}`;
    if (!remainingByPool.has(poolKey)) {
      remainingByPool.set(poolKey, first?.inventory_owner_type === 'distributor' && first?.inventory_owner_org_id
        ? consignment.availableFor({ owner_org_id: first.inventory_owner_org_id, sku, distributor_sku: first.distributor_sku || null })
        : availableForSku(sku));
    }
    const required = backorders.reduce((sum, backorder) => sum + Number(backorder.quantity || 0), 0);
    if (remainingByPool.get(poolKey) < required) continue;
    const freight = typeof shipping_cost === 'function'
      ? await shipping_cost({ parent_order_id: parentId, backorders })
      : shipping_cost == null ? Number.NaN : Number(shipping_cost);
    if (!Number.isFinite(freight) || freight < 0) {
      ready.push(...backorders.map((backorder) => backorder.id));
      if (!db.list('tasks', { where: { kind: 'backorder_rate_required', ref_id: parentId } }).length) {
        db.insert('tasks', {
          id: uid('task'), kind: 'backorder_rate_required', subject: `Rate backorder shipment for ${parentId}`,
          owner_email: backorders[0]?.assigned_owner_email || 'ops@unitemedical.net', status: 'open',
          ref_type: 'order', ref_id: parentId, payload: { backorder_ids: backorders.map((backorder) => backorder.id) },
          created_at: new Date().toISOString(),
        });
      }
      continue;
    }

    const suborder = createBackorderSuborder({
      parent_order_id: parentId,
      backorder_ids: backorders.map((backorder) => backorder.id),
      lines: backorders.map((backorder) => ({
        backorder_id: backorder.id,
        sku: backorder.sku,
        name: backorder.product_name,
        qty: backorder.quantity,
        unit_price: backorder.unit_price,
        inventory_owner_type: backorder.inventory_owner_type || null,
        inventory_owner_org_id: backorder.inventory_owner_org_id || null,
        distributor_sku: backorder.distributor_sku || null,
      })),
      shipping_cost: freight,
    });
    remainingByPool.set(poolKey, remainingByPool.get(poolKey) - required);
    suborders.push(suborder);
    onProgress({ label: `Created ${suborder.id} for ${required} unit(s) of ${sku}; awaiting payment/release` });
  }
  return { shipped: [], suborders, ready };
}

// ---------------------------------------------------------------------------
// Returns / refunds (Phase 6)
// ---------------------------------------------------------------------------

/** Create a system-numbered return request. No inventory or money moves here. */
export async function createReturn(orderId, returnItems, { reason = 'customer_request', requested_by = null } = {}) {
  const order = db.get('orders', orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);
  if ((returnItems || []).some((item) => item.opened === true && item.sterile === true)) {
    return { ok: false, reason: 'opened_sterile_non_returnable' };
  }
  if (!Array.isArray(returnItems) || !returnItems.length) return { ok: false, reason: 'no_return_items' };

  const rmaId = `RMA-${orderId}-${db.count('rmas') + 1}`;
  const organization = db.get('organizations', order.customer_id);
  const ownerEmail = order.account_owner_email || organization?.account_owner_email || 'returns@unitemedical.net';
  const rma = db.insert('rmas', {
    id: rmaId,
    order_id: orderId,
    customer_id: order.customer_id,
    account_owner_email: ownerEmail,
    requested_by,
    reason,
    items: returnItems.map((item) => ({ ...item, qty: Number(item.qty) || 0, unit_price: Number(item.unit_price) || 0 })),
    status: 'requested',
    merchandise_value: null,
    restocking_fee_rate: reason === 'discretionary' ? 0.15 : 0,
    restocking_fee: null,
    refund_total: null,
    requested_at: new Date().toISOString(),
  });
  db.insert('tasks', {
    id: uid('task'), kind: 'rma_review', subject: `Review ${rmaId}`,
    owner_email: ownerEmail, status: 'open', ref_type: 'rma', ref_id: rmaId,
    payload: { order_id: orderId, reason }, created_at: new Date().toISOString(),
  });
  db.insert('audit_log', { id: uid('aud'), kind: 'rma.requested', ref_id: rmaId, payload: { order_id: orderId, requested_by, reason } });
  return { ok: true, rma };
}

export function approveReturn(rmaId, { approved_by = 'returns' } = {}) {
  const rma = db.get('rmas', rmaId);
  if (!rma) throw new Error(`RMA ${rmaId} not found`);
  if (rma.status !== 'requested') throw new Error(`RMA ${rmaId} cannot be approved from ${rma.status}`);
  const updated = db.update('rmas', rmaId, {
    status: 'approved', approved_by, approved_at: new Date().toISOString(),
    return_label_status: 'pending_generation',
  });
  db.insert('audit_log', { id: uid('aud'), kind: 'rma.approved', ref_id: rmaId, payload: { approved_by } });
  return updated;
}

export function receiveReturn(rmaId, { received_by = 'warehouse' } = {}) {
  const rma = db.get('rmas', rmaId);
  if (!rma) throw new Error(`RMA ${rmaId} not found`);
  if (rma.status !== 'approved') throw new Error(`RMA ${rmaId} cannot be received from ${rma.status}`);
  const updated = db.update('rmas', rmaId, {
    status: 'quarantined', received_by, received_at: new Date().toISOString(), inventory_state: 'quarantine',
  });
  db.insert('audit_log', { id: uid('aud'), kind: 'rma.quarantined', ref_id: rmaId, payload: { received_by } });
  return updated;
}

export function inspectReturn(rmaId, {
  inspected_by = 'warehouse',
  released_by = null,
  disposition,
  accepted_items = [],
  disposition_evidence = null,
} = {}) {
  const rma = db.get('rmas', rmaId);
  if (!rma) return { ok: false, reason: 'rma_not_found' };
  if (rma.status !== 'quarantined') return { ok: false, reason: `cannot_inspect_${rma.status}` };
  const allowed = new Set(['restock_sellable', 'quality_hold', 'expired_disposal', 'return_to_vendor', 'investigation_hold']);
  if (!allowed.has(disposition)) return { ok: false, reason: 'invalid_disposition' };
  const releasesQuarantine = new Set(['restock_sellable', 'expired_disposal', 'return_to_vendor']).has(disposition);
  const releaseProfile = released_by ? db.get('profiles', released_by) : null;
  if (releasesQuarantine && (!releaseProfile || releaseProfile.role !== 'admin' || releaseProfile.status !== 'active')) {
    return { ok: false, reason: 'admin_release_required' };
  }
  if (['expired_disposal', 'return_to_vendor'].includes(disposition)
      && !String(disposition_evidence?.reference || disposition_evidence?.note || '').trim()) {
    return { ok: false, reason: 'disposition_evidence_required' };
  }

  const merchandiseValue = +(accepted_items || []).reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0), 0,
  ).toFixed(2);
  const feeRate = rma.reason === 'discretionary' ? 0.15 : 0;
  const restockingFee = +(merchandiseValue * feeRate).toFixed(2);
  const refundTotal = +(merchandiseValue - restockingFee).toFixed(2);

  if (disposition === 'restock_sellable') {
    const order = db.get('orders', rma.order_id);
    for (const item of accepted_items) {
      const qty = Number(item.qty) || 0;
      if (!item.sku || qty <= 0) continue;
      if (!item.lot_id) return { ok: false, reason: 'return_lot_genealogy_required', sku: item.sku };
      const shipped = db.list('lot_tracking', { where: { order_id: rma.order_id, product_sku: item.sku, lot_id: item.lot_id } })
        .reduce((sum, row) => sum + Number(row.qty || 0), 0);
      const alreadyReturned = db.list('stock_movements', { where: { ref_type: 'rma', lot_id: item.lot_id } })
        .filter((row) => row.reason === ledger.REASONS.RETURN_RESTOCK)
        .reduce((sum, row) => sum + Number(row.qty_delta || 0), 0);
      if (qty + alreadyReturned > shipped) return { ok: false, reason: 'return_exceeds_shipment_genealogy', sku: item.sku, lot_id: item.lot_id };
      const originalLot = db.get('lots', item.lot_id);
      if (!originalLot || originalLot.product_sku !== item.sku) return { ok: false, reason: 'return_lot_not_found', sku: item.sku };
      const inventory = db.list('inventory', { where: { sku: item.sku }, orderBy: 'on_hand', dir: 'desc' })[0];
      const warehouseId = originalLot.warehouse_id || inventory?.warehouse_id || order?.ship_from_warehouse || 'wh_atl';
      db.update('lots', originalLot.id, {
        qty_received: Number(originalLot.qty_received || 0) + qty,
        qty_remaining: Number(originalLot.qty_remaining || 0) + qty,
        last_returned_at: new Date().toISOString(),
      });
      ledger.post({
        sku: item.sku,
        warehouse_id: warehouseId,
        qty_delta: qty,
        reason: ledger.REASONS.RETURN_RESTOCK,
        ref_type: 'rma',
        ref_id: rmaId,
        lot_id: originalLot.id,
        actor_id: inspected_by,
        idempotency_key: `rma_restock:${rmaId}:${item.sku}:${originalLot.id}`,
        note: `RMA ${rmaId} inspected and released as sellable`,
      });
    }
  }

  const updated = db.update('rmas', rmaId, {
    status: 'refund_pending',
    disposition,
    accepted_items,
    inspected_by,
    inspected_at: new Date().toISOString(),
    released_by: releasesQuarantine ? released_by : null,
    release_role: releasesQuarantine ? releaseProfile.role : null,
    released_at: releasesQuarantine ? new Date().toISOString() : null,
    disposition_evidence: disposition_evidence || null,
    inventory_state: disposition === 'restock_sellable' ? 'sellable' : disposition,
    merchandise_value: merchandiseValue,
    restocking_fee_rate: feeRate,
    restocking_fee: restockingFee,
    refund_total: refundTotal,
  });
  db.insert('audit_log', {
    id: uid('aud'), kind: 'rma.inspected', ref_id: rmaId,
    payload: {
      inspected_by, released_by: releasesQuarantine ? released_by : null, disposition,
      disposition_evidence: disposition_evidence || null,
      merchandise_value: merchandiseValue, restocking_fee: restockingFee, refund_total: refundTotal,
    },
  });
  return { ok: true, rma: updated };
}

export async function issueReturnRefund(rmaId, { approved_by = 'finance' } = {}) {
  const rma = db.get('rmas', rmaId);
  if (!rma) return { ok: false, reason: 'rma_not_found' };
  if (rma.status !== 'refund_pending') return { ok: false, reason: `cannot_refund_${rma.status}` };
  const order = db.get('orders', rma.order_id);
  let credit = null;
  let refund = null;
  try {
    if (typeof qbo.createCreditMemo === 'function') {
      credit = await qbo.createCreditMemo({ order_id: rma.order_id, amount: rma.refund_total, rma: rmaId });
    }
  } catch { /* finance exception remains auditable */ }
  try {
    if (typeof stripe.createRefund === 'function') {
      refund = await stripe.createRefund({ amount: rma.refund_total, metadata: { order_id: rma.order_id, rma: rmaId } });
    }
  } catch { /* finance exception remains auditable */ }

  const updated = db.update('rmas', rmaId, {
    status: 'refunded', refund_approved_by: approved_by, refunded_at: new Date().toISOString(),
    credit_memo: credit, refund,
  });
  try {
    await gmail.send({
      to: order?.contact_email || rma.requested_by,
      subject: `Return ${rmaId} refund processed`,
      body: `Refund for ${rmaId}: $${Number(rma.refund_total || 0).toLocaleString()}.`,
      template_key: 'return_processed', drafted_by: approved_by,
    });
  } catch { /* outbox best effort */ }
  db.insert('audit_log', { id: uid('aud'), kind: 'rma.refunded', ref_id: rmaId, payload: { approved_by, refund_total: rma.refund_total } });
  return { ok: true, rma: updated };
}
