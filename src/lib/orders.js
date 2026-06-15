/**
 * Order orchestrator — the "enter data once, sync everything" demo.
 *
 *   placeOrder() →
 *     1. create order + line items in DB
 *     2. deduct inventory (FIFO across warehouses)
 *     3. our WMS: create label, get tracking #
 *     4. QBO: create invoice (books) + canonical AR row
 *     5. Stripe: hosted invoice for net-terms/ACH (collection rail),
 *        or PaymentIntent + QBO payment for card (paid up front)
 *     6. CRM sync + write audit log entries
 *
 * Returns the created order so the UI can navigate to confirmation.
 */

import { db } from './db.js';
import { hubspot, qbo, shipstation, stripe } from './services.js';
import { uid } from './format.js';

function pickWarehouse(sku, qty) {
  const rows = db.list('inventory', { where: { sku }, orderBy: 'on_hand', dir: 'desc' });
  for (const r of rows) if (r.on_hand >= qty) return r;
  return rows[0] || null;
}

const TERMS_DAYS = { net30: 30, net60: 60, ach: 7, card: 0, wire: 7, mspv: 30 };
function dueDateFor(terms) {
  return new Date(Date.now() + (TERMS_DAYS[terms] ?? 30) * 86400000).toISOString().slice(0, 10);
}

/**
 * Resolve (and cache) the QBO Customer id for an org so we don't create
 * a duplicate QBO customer on every order. Caches onto the org row.
 */
async function resolveQboCustomerId(customer) {
  const org = db.get('organizations', customer.org_id);
  if (org?.qbo_customer_id) return org.qbo_customer_id;
  const result = await qbo.upsertCustomer({
    org: { id: customer.org_id, name: customer.org_name, segment: customer.segment, tier: org?.tier },
  });
  if (org && result?.id) db.update('organizations', org.id, { qbo_customer_id: result.id });
  return result?.id;
}

export async function placeOrder({ customer, address, items, payment_terms = 'net30', payment_method = 'ach', po_number = null, ship_method = 'fedex_ground', notes = '' }) {
  if (!items?.length) throw new Error('No items to order.');

  const subtotal = items.reduce((a, b) => a + b.qty * b.unit_price, 0);
  const freight = subtotal > 500 ? 0 : 42;
  const total = +(subtotal + freight).toFixed(2);

  const id = `UM-${new Date().getFullYear()}-${String(4900 + db.count('orders')).padStart(5, '0')}`;
  db.insert('orders', {
    id,
    customer_id: customer.org_id,
    customer_name: customer.org_name,
    placed_by: customer.user_id,
    placed_at: new Date().toISOString(),
    subtotal: +subtotal.toFixed(2),
    freight,
    tax: 0,
    total,
    payment_terms,
    payment_method,
    payment_status: payment_method === 'card' ? 'pending' : 'invoiced',
    po_number,
    notes,
    status: 'processing',
    ship_to_address_id: address?.id || null,
    ship_method,
    segment: customer.segment || 'asc',
  });

  let primaryWarehouse = 'wh_atl';
  for (const it of items) {
    const inv = pickWarehouse(it.sku, it.qty);
    if (inv) {
      primaryWarehouse = inv.warehouse_id;
      db.update('inventory', inv.id, { on_hand: Math.max(0, inv.on_hand - it.qty) });
    }
    db.insert('order_items', { id: uid('oi'), order_id: id, sku: it.sku, name: it.name, qty: it.qty, unit_price: it.unit_price, ext_price: +(it.qty * it.unit_price).toFixed(2) });
  }

  const totalWeight = items.reduce((a, b) => a + b.qty * 0.6, 0);
  const label = await shipstation.createLabel({ order_id: id, carrier: ship_method, warehouse_id: primaryWarehouse, weight_lbs: Math.max(2, +totalWeight.toFixed(1)) });

  db.insert('shipments', {
    id: `shp_${id}`,
    order_id: id,
    carrier: label.carrier,
    tracking_number: label.tracking_number,
    label_url: label.label_url,
    status: 'label_created',
    weight_lbs: Math.max(2, +totalWeight.toFixed(1)),
    cartons: Math.max(1, Math.ceil(items.length / 4)),
    eta: new Date(Date.now() + 4 * 86400000).toISOString(),
    warehouse_id: primaryWarehouse,
    events: [{ ts: new Date().toISOString(), label: 'Label created (our WMS)' }],
  });

  db.update('orders', id, { tracking_number: label.tracking_number, carrier: label.carrier, ship_from_warehouse: primaryWarehouse });

  // Line items in the shape both QBO + Stripe clients expect.
  const lineItems = items.map((it) => ({ qty: it.qty, unit_price: it.unit_price, name: it.name, product_sku: it.sku }));
  const dueDate = dueDateFor(payment_terms);

  // 1) Books: QBO invoice (CFO's accounting source of truth).
  const qboCustomerId = await resolveQboCustomerId(customer);
  const qboInvoice = await qbo.createInvoice({
    order_id: id,
    qbo_customer_id: qboCustomerId,
    items: lineItems,
    terms: payment_terms,
    due_date: new Date(dueDate),
  });

  // 2) Collection rail: Stripe invoice (send_invoice) for net-terms / ACH.
  //    Card pays up front via PaymentIntent below; wire is collected
  //    out-of-band, so neither needs a Stripe hosted invoice.
  let stripeInvoice = null;
  if (payment_method !== 'card' && payment_method !== 'wire') {
    try {
      const stripeCustomer = await stripe.upsertCustomer({
        org: { id: customer.org_id, name: customer.org_name, billing_email: customer.email, segment: customer.segment },
      });
      stripeInvoice = await stripe.createInvoice({
        stripe_customer_id: stripeCustomer.id,
        line_items: lineItems,
        terms: payment_terms,
        order_id: id,
      });
    } catch (err) {
      db.insert('audit_log', { id: uid('aud'), kind: 'order.stripe_invoice_failed', ref_id: id, payload: { error: err.message } });
    }
  }

  // 3) Canonical AR record the portal + finance dashboard read from.
  const invoiceRow = db.insert('invoices', {
    id: qboInvoice.doc_number,
    order_id: id,
    customer_id: customer.org_id,
    amount: total,
    terms: payment_terms,
    status: payment_method === 'card' ? 'pending' : 'open',
    due_date: qboInvoice.due_date || dueDate,
    qbo_id: qboInvoice.qbo_invoice_id,
    stripe_invoice_id: stripeInvoice?.stripe_invoice_id || null,
    hosted_invoice_url: stripeInvoice?.hosted_invoice_url || null,
  });

  let paymentIntent = null;
  if (payment_method === 'card') {
    paymentIntent = await stripe.createPaymentIntent({ amount: total, currency: 'usd', metadata: { order_id: id } });
    await stripe.confirmPaymentIntent(paymentIntent.id);
    await qbo.recordPayment({ qbo_invoice_id: qboInvoice.qbo_invoice_id, amount: total, method: 'card' });
    db.update('invoices', invoiceRow.id, { status: 'paid', balance: 0, paid_at: new Date().toISOString(), payment_method: 'card' });
    db.update('orders', id, { payment_status: 'paid' });
    db.insert('payments', { id: uid('pmt'), invoice_id: invoiceRow.id, order_id: id, amount: total, method: 'card', source: 'stripe', received_at: new Date().toISOString() });
  }

  // CRM sync (brief §6: order data flows bidirectionally with the CRM).
  // Never let a CRM hiccup fail the order.
  try {
    const contact = await hubspot.upsertContact({
      email: customer.email,
      firstname: customer.name?.split(' ')[0],
      lastname: customer.name?.split(' ').slice(1).join(' '),
      company: customer.org_name,
      lifecyclestage: 'customer',
    });
    await hubspot.createDeal({
      dealname: `Order ${id} · ${customer.org_name}`,
      amount: total,
      stage: 'closedwon',
      contact_id: contact?.id,
      unite_order_id: id,
      unite_segment: customer.segment || 'asc',
      close_date: new Date().toISOString(),
    });
    db.insert('audit_log', { id: uid('aud'), kind: 'order.crm_synced', ref_id: id, payload: { contact_id: contact?.id } });
  } catch (err) {
    db.insert('audit_log', { id: uid('aud'), kind: 'order.crm_sync_failed', ref_id: id, payload: { error: err.message } });
  }

  db.insert('audit_log', { id: uid('aud'), kind: 'order.placed', ref_id: id, payload: { total, items: items.length, payment_method } });

  return { order: db.get('orders', id), shipment_id: `shp_${id}`, invoice_id: invoiceRow.id, payment_intent_id: paymentIntent?.id || null };
}
