/**
 * Order orchestrator — the "enter data once, sync everything" demo.
 *
 *   placeOrder() →
 *     1. create order + line items in DB
 *     2. deduct inventory (FIFO across warehouses)
 *     3. our WMS: create label, get tracking #
 *     4. our billing system Online: create draft invoice
 *     5. Stripe: create payment intent (if card)
 *     6. write audit log entries
 *
 * Returns the created order so the UI can navigate to confirmation.
 */

import { db } from './db.js';
import { qbo, shipstation, stripe } from './services.js';
import { uid } from './format.js';

function pickWarehouse(sku, qty) {
  const rows = db.list('inventory', { where: { sku }, orderBy: 'on_hand', dir: 'desc' });
  for (const r of rows) if (r.on_hand >= qty) return r;
  return rows[0] || null;
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

  const invoice = await qbo.createInvoice({ order_id: id, customer_id: customer.org_id, amount: total, terms: payment_terms });
  db.insert('invoices', {
    id: invoice.doc_number,
    order_id: id,
    customer_id: customer.org_id,
    amount: total,
    terms: payment_terms,
    status: payment_method === 'card' ? 'pending' : 'open',
    due_date: invoice.due_date,
    qbo_id: invoice.id,
  });

  let paymentIntent = null;
  if (payment_method === 'card') {
    paymentIntent = await stripe.createPaymentIntent({ amount: Math.round(total * 100), currency: 'usd', metadata: { order_id: id } });
    await stripe.confirmPaymentIntent(paymentIntent.id);
    await qbo.recordPayment({ invoice_id: invoice.id, amount: total, method: 'card' });
  }

  db.insert('audit_log', { id: uid('aud'), kind: 'order.placed', ref_id: id, payload: { total, items: items.length, payment_method } });

  return { order: db.get('orders', id), shipment_id: `shp_${id}`, invoice_id: invoice.doc_number, payment_intent_id: paymentIntent?.id || null };
}
