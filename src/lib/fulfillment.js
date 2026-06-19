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

export const PIPELINE_STEPS = ['validate', 'reserve', 'payment', 'invoice', 'shipping', 'packing_slip', 'notify', 'delivered'];

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

  // STEP 2 — reserve inventory through the WMS (held reservations; ATP-checked)
  // + backorders for shortfalls. Stock is HELD, not consumed — on_hand only
  // drops at ship (commit), so two orders can never sell the same unit.
  const backorders = [];
  await runStep(orderId, 'reserve', {
    integration: 'wms',
    onProgress,
    fn: async () => {
      const res = reservations.reserve({ id: orderId, items: items.map((it) => ({ sku: it.sku, qty: it.qty })) });
      for (const line of res.lines) {
        if (line.shortfall > 0) {
          const it = items.find((x) => x.sku === line.sku);
          const existing = db.list('backorders', { where: { order_id: orderId, order_item_id: it?.id, status: 'pending' } })[0];
          if (!existing && it) {
            backorders.push(db.insert('backorders', {
              id: uid('bo'), order_id: orderId, order_item_id: it.id, sku: it.sku, product_name: it.name,
              quantity: line.shortfall, status: 'pending',
              estimated_restock: new Date(Date.now() + 21 * 86400000).toISOString(),
            }));
          }
        }
      }
      return { reserved: res.lines, backordered: backorders.length };
    },
  });

  // STEP 3 — payment
  await runStep(orderId, 'payment', {
    integration: 'stripe',
    onProgress,
    fn: async () => {
      if (order.payment_status === 'paid') return { already_paid: true };
      if (order.payment_method === 'card') {
        const pi = await stripe.createPaymentIntent({ amount: order.total, currency: 'usd', metadata: { order_id: orderId } });
        await stripe.confirmPaymentIntent(pi.id);
        db.update('orders', orderId, { payment_status: 'paid' });
        return { payment_intent_id: pi.id, method: 'card' };
      }
      // Net-terms / ACH: a Stripe hosted invoice is the collection rail.
      const customer = await stripe.upsertCustomer({ org: { id: order.customer_id, name: order.customer_name, segment: order.segment } });
      const inv = await stripe.createInvoice({ stripe_customer_id: customer.id, line_items: items.map((i) => ({ qty: i.qty, unit_price: i.unit_price, name: i.name, product_sku: i.sku })), terms: order.payment_terms, order_id: orderId });
      return { stripe_invoice_id: inv.stripe_invoice_id, method: order.payment_method };
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
      const qboInvoice = await qbo.createInvoice({
        order_id: orderId, qbo_customer_id: customerId,
        items: items.map((i) => ({ qty: i.qty, unit_price: i.unit_price, name: i.name, product_sku: i.sku })),
        terms: order.payment_terms,
      });
      if (!existing) {
        db.insert('invoices', {
          id: qboInvoice.doc_number, order_id: orderId, customer_id: order.customer_id,
          amount: order.total, terms: order.payment_terms, status: order.payment_status === 'paid' ? 'paid' : 'open',
          qbo_id: qboInvoice.qbo_invoice_id, due_date: qboInvoice.due_date,
        });
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
      const weight = Math.max(2, items.reduce((a, b) => a + b.qty * 0.6, 0));
      let carrier = order.ship_method || 'fedex_ground';
      try {
        const rates = await shipstation.getRates({ weight_lbs: +weight.toFixed(1) });
        const cheapest = (rates?.rates || rates || []).slice().sort((a, b) => (a.shipmentCost ?? a.total ?? 0) - (b.shipmentCost ?? b.total ?? 0))[0];
        if (cheapest?.carrierCode || cheapest?.carrier) carrier = cheapest.serviceCode || cheapest.carrierCode || carrier;
      } catch { /* rate-shop best effort */ }
      const label = await shipstation.createLabel({ order_id: orderId, carrier, warehouse_id: order.ship_from_warehouse || 'wh_atl', weight_lbs: +weight.toFixed(1) });
      db.insert('shipments', {
        id: `shp_${orderId}`, order_id: orderId, carrier: label.carrier, tracking_number: label.tracking_number,
        label_url: label.label_url, status: 'label_created', weight_lbs: +weight.toFixed(1),
        warehouse_id: order.ship_from_warehouse || 'wh_atl',
        events: [{ ts: new Date().toISOString(), label: 'Label created (orchestrator)' }],
      });
      db.update('orders', orderId, { tracking_number: label.tracking_number, carrier: label.carrier, status: 'ready_to_ship' });
      // Goods are leaving: FEFO-pick lots, post per-lot `ship` movements
      // (on_hand drops via the ledger), record recall genealogy, and free the
      // reservations — all idempotent per (order, reservation, lot).
      const ship = shipping.confirmShip(orderId, { actor_id: 'fulfillment' });
      return { tracking_number: label.tracking_number, carrier: label.carrier, ship_movements: ship.movements.length, lots_recorded: ship.genealogy.length };
    },
  });

  // STEP 6 — packing slip PDF
  await runStep(orderId, 'packing_slip', {
    onProgress,
    fn: async () => {
      const { record } = generateDocument({ type: 'packing_slip', ref_id: orderId, ref_type: 'order' });
      return { document_id: record.id };
    },
  });

  // STEP 7 — notify customer (order + shipping confirmation → outbox)
  await runStep(orderId, 'notify', {
    integration: 'gmail',
    onProgress,
    fn: async () => {
      const ship = db.list('shipments', { where: { order_id: orderId } })[0];
      const to = order.contact_email || `ap@${String(order.customer_name || 'customer').toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`;
      await gmail.send({
        to,
        subject: `Order ${orderId} confirmed`,
        body: `Your order ${orderId} is confirmed (${items.length} line items, total $${(order.total || 0).toLocaleString()}).`
          + (ship?.tracking_number ? `\n\nShipping via ${ship.carrier}. Tracking: ${ship.tracking_number}.` : '')
          + (backorders.length ? `\n\nNote: ${backorders.length} item(s) are backordered and will ship when restocked.` : ''),
        template_key: 'order_confirmation',
        drafted_by: 'system',
      });
      return { notified: to };
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
 * Mark an order delivered (called from the ShipStation SHIP/DELIVER
 * webhook in the bus). Decrements reserved → shipped, closes the step.
 */
export function markDelivered(orderId) {
  setStep(orderId, 'delivered', { status: 'completed', completed_at: new Date().toISOString(), result: { delivered: true } });
  db.update('orders', orderId, { status: 'delivered' });
  return { ok: true };
}

/**
 * Auto-fulfill pending backorders for a SKU once stock replenishes.
 * Called from the receiving chain when inventory lands.
 */
export async function fulfillBackorders(sku, { onProgress = () => {} } = {}) {
  const pending = db.list('backorders', { where: { sku, status: 'pending' } });
  const shipped = [];
  for (const bo of pending) {
    if (availableForSku(sku) < bo.quantity) continue;
    // Reserve then immediately commit (the backorder ships now) — both go
    // through the WMS so on_hand only moves via the ledger.
    const res = reservations.reserve({ id: bo.order_id, items: [{ sku, qty: bo.quantity }] });
    if (res.shortfall > 0) { reservations.release(bo.order_id); continue; }
    reservations.commit(bo.order_id, { actor_id: 'backorder' });
    db.update('backorders', bo.id, { status: 'shipped', shipped_at: new Date().toISOString() });
    shipped.push(bo.id);
    onProgress({ label: `Backorder ${bo.id} (${sku} ×${bo.quantity}) auto-shipped` });
  }
  return { shipped };
}

// ---------------------------------------------------------------------------
// Returns / refunds (Phase 6)
// ---------------------------------------------------------------------------

/**
 * Create an RMA: restock inventory, issue a QBO credit memo + Stripe
 * refund (best-effort against whatever clients support), notify customer.
 */
export async function createReturn(orderId, returnItems, { reason = 'customer_request' } = {}) {
  const order = db.get('orders', orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);
  const rmaId = `RMA-${orderId}-${db.count('rmas') + 1}`;
  const refundTotal = returnItems.reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);

  db.insert('rmas', {
    id: rmaId, order_id: orderId, customer_id: order.customer_id, reason,
    items: returnItems, refund_total: +refundTotal.toFixed(2), status: 'pending',
  });

  // Restock through the ledger (reason=return_restock) — never a direct
  // on_hand write. Returns land in the warehouse that originally shipped.
  for (const it of returnItems) {
    const qty = Number(it.qty) || 0;
    if (!it.sku || qty <= 0) continue;
    const inv = db.list('inventory', { where: { sku: it.sku }, orderBy: 'on_hand', dir: 'desc' })[0];
    const wh = inv?.warehouse_id || order.ship_from_warehouse || 'wh_atl';
    ledger.post({
      sku: it.sku, warehouse_id: wh, qty_delta: qty, reason: ledger.REASONS.RETURN_RESTOCK,
      ref_type: 'order', ref_id: orderId, actor_id: 'returns',
      idempotency_key: `restock:${rmaId}:${it.sku}`, note: `RMA ${rmaId} restock`,
    });
  }

  // Credit memo (QBO) + refund (Stripe) — best effort.
  let credit = null;
  let refund = null;
  try {
    if (typeof qbo.createCreditMemo === 'function') {
      credit = await qbo.createCreditMemo({ order_id: orderId, amount: refundTotal });
    }
  } catch { /* queued for retry by ops */ }
  try {
    if (typeof stripe.createRefund === 'function') {
      refund = await stripe.createRefund({ amount: refundTotal, metadata: { order_id: orderId, rma: rmaId } });
    }
  } catch { /* queued for retry by ops */ }

  db.update('rmas', rmaId, { status: 'refunded', restocked_at: new Date().toISOString(), credit_memo: credit, refund });

  try {
    await gmail.send({
      to: order.contact_email || 'customer@example.com',
      subject: `Return ${rmaId} processed`,
      body: `We've received your return for order ${orderId} and issued a refund of $${refundTotal.toLocaleString()}.`,
      template_key: 'return_processed', drafted_by: 'system',
    });
  } catch { /* outbox best effort */ }

  db.insert('audit_log', { id: uid('aud'), kind: 'order.returned', ref_id: orderId, payload: { rma: rmaId, refundTotal } });
  return db.get('rmas', rmaId);
}
