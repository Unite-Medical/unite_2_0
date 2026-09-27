import { test } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../src/lib/db.js';
import {
  planFulfillableBatch,
  nextSuborderId,
  createBackorderSuborder,
} from '../src/lib/orderBatches.js';
import { confirmShipmentHandoff, fulfillBackorders, runFulfillment } from '../src/lib/fulfillment.js';

test('initial fulfillment charges only available quantities and current shipment freight', () => {
  const plan = planFulfillableBatch({
    order: { id: 'Unite-WMS-000-000', shipping_cost: 12 },
    items: [
      { id: 'line_a', sku: 'A', name: 'A', qty: 5, unit_price: 10 },
      { id: 'line_b', sku: 'B', name: 'B', qty: 2, unit_price: 5 },
    ],
    availableBySku: { A: 3, B: 0 },
  });

  assert.deepEqual(plan.ship_lines.map((line) => [line.sku, line.qty]), [['A', 3]]);
  assert.deepEqual(plan.backorder_lines.map((line) => [line.sku, line.qty]), [['A', 2], ['B', 2]]);
  assert.equal(plan.merchandise_total, 30);
  assert.equal(plan.shipping_total, 12);
  assert.equal(plan.charge_total, 42);
  assert.equal(plan.backorder_value, 30);
});

test('suborder numbering increments from the parent order', () => {
  assert.equal(nextSuborderId('Unite-WMS-000-000', []), 'Unite-WMS-000-000-2');
  assert.equal(nextSuborderId('Unite-WMS-000-000', [
    { id: 'Unite-WMS-000-000-2', parent_order_id: 'Unite-WMS-000-000' },
    { id: 'Unite-WMS-000-000-3', parent_order_id: 'Unite-WMS-000-000' },
  ]), 'Unite-WMS-000-000-4');
});

test('stock-arrived release creates a new unpaid suborder with its own freight', () => {
  const parentId = 'Unite-WMS-321-654';
  db.insert('orders', {
    id: parentId,
    customer_id: 'org_suborder_test',
    customer_name: 'Suborder Test Buyer',
    contact_email: 'buyer@suborder.test',
    payment_method: 'card',
    payment_terms: 'prepaid',
    status: 'partially_backordered',
  });
  const suborder = createBackorderSuborder({
    parent_order_id: parentId,
    backorder_ids: ['bo_suborder_test'],
    lines: [{
      sku: 'A', name: 'A', qty: 2, unit_price: 10,
      inventory_owner_type: 'distributor', inventory_owner_org_id: 'org_inventory_owner',
      distributor_sku: 'OWNER-A',
    }],
    shipping_cost: 8,
  });

  assert.equal(suborder.id, 'Unite-WMS-321-654-2');
  assert.equal(suborder.parent_order_id, parentId);
  assert.equal(suborder.payment_status, 'pending');
  assert.equal(suborder.status, 'payment_pending');
  assert.equal(suborder.merchandise_total, 20);
  assert.equal(suborder.shipping_cost, 8);
  assert.equal(suborder.total, 28);
  const createdLine = db.list('order_items', { where: { order_id: suborder.id } })[0];
  assert.equal(createdLine.qty, 2);
  assert.equal(createdLine.inventory_owner_type, 'distributor');
  assert.equal(createdLine.inventory_owner_org_id, 'org_inventory_owner');
  assert.equal(createdLine.distributor_sku, 'OWNER-A');
  assert.equal(db.list('invoices', { where: { order_id: suborder.id } }).length, 0);
});

test('fulfillment payment and invoice exclude every backordered unit', async () => {
  const orderId = 'Unite-WMS-999-001';
  db.insert('organizations', {
    id: 'org_fulfillment_batch_test', name: 'Batch Test Buyer', terms: 'card', credit_limit: 0,
  });
  db.insert('products', { id: 'product_batch_a', sku: 'BATCH-A', name: 'Batch A', price: 20, lot_tracking: 'optional' });
  db.insert('products', { id: 'product_batch_b', sku: 'BATCH-B', name: 'Batch B', price: 40, lot_tracking: 'optional' });
  db.insert('inventory', {
    id: 'inventory_batch_a', sku: 'BATCH-A', warehouse_id: 'wh_atl', on_hand: 2, reserved: 0,
  });
  db.insert('orders', {
    id: orderId,
    customer_id: 'org_fulfillment_batch_test',
    customer_name: 'Batch Test Buyer',
    contact_email: 'buyer@batch.test',
    payment_method: 'card',
    payment_terms: 'prepaid',
    payment_status: 'pending',
    shipping_cost: 10,
    total: 110,
    status: 'payment_pending',
  });
  db.insert('order_items', { id: 'batch_line_a', order_id: orderId, sku: 'BATCH-A', name: 'Batch A', qty: 3, unit_price: 20 });
  db.insert('order_items', { id: 'batch_line_b', order_id: orderId, sku: 'BATCH-B', name: 'Batch B', qty: 1, unit_price: 40 });

  await runFulfillment(orderId);

  const updated = db.get('orders', orderId);
  assert.equal(updated.chargeable_total, 50);
  assert.equal(updated.backorder_value, 60);
  const invoice = db.list('invoices', { where: { order_id: orderId } })[0];
  assert.equal(invoice.amount, 50);
  const payment = db.list('payments', { where: { order_id: orderId } })[0];
  assert.equal(payment.amount, 50);
  const backorders = db.list('backorders', { where: { order_id: orderId } });
  assert.deepEqual(backorders.map((row) => [row.sku, row.quantity]).sort(), [['BATCH-A', 1], ['BATCH-B', 1]]);
  assert.ok(backorders.every((row) => row.estimated_restock == null && row.eta_status === 'date_pending'));
});

test('hosted invoice payment resumes the same order after the initial payment hold', async () => {
  const orderId = 'Unite-WMS-999-002';
  const sku = 'HOSTED-INVOICE-RESUME';
  db.insert('organizations', {
    id: 'org_hosted_invoice_resume', name: 'Hosted Invoice Buyer', terms: 'prepaid', credit_limit: 0,
  });
  db.insert('products', { id: 'product_hosted_invoice_resume', sku, name: 'Resume Product', price: 25, lot_tracking: 'optional', expiration_tracking: 'optional' });
  db.insert('inventory', { id: 'inventory_hosted_invoice_resume', sku, warehouse_id: 'wh_atl', on_hand: 2, reserved: 0 });
  db.insert('orders', {
    id: orderId, customer_id: 'org_hosted_invoice_resume', customer_name: 'Hosted Invoice Buyer',
    contact_email: 'buyer@hosted-invoice.test', payment_method: 'ach', payment_terms: 'prepaid',
    payment_status: 'pending', shipping_cost: 0, total: 25, status: 'payment_pending',
  });
  db.insert('order_items', { id: 'hosted_invoice_resume_line', order_id: orderId, sku, name: 'Resume Product', qty: 1, unit_price: 25 });

  const held = await runFulfillment(orderId);
  assert.equal(held.payment_pending, true);
  assert.equal(db.list('reservations', { where: { order_id: orderId } }).length, 0);
  assert.equal(db.list('shipments', { where: { order_id: orderId } }).length, 0);

  db.update('orders', orderId, { payment_status: 'paid', paid_at: new Date().toISOString() });
  const resumed = await runFulfillment(orderId);

  assert.equal(resumed.payment_pending, undefined);
  assert.equal(db.list('shipments', { where: { order_id: orderId } }).length, 1);
  assert.equal(db.list('shipments', { where: { order_id: orderId } })[0].status, 'label_created');
  assert.equal(db.get('inventory', 'inventory_hosted_invoice_resume').on_hand, 2);
  assert.equal(db.list('reservations', { where: { order_id: orderId } })[0].status, 'held');
  assert.equal(db.list('stock_movements', { where: { ref_id: orderId, reason: 'ship' } }).length, 0);
  assert.equal(db.list('audit_log', { where: { kind: 'notify.shipped', ref_id: orderId } }).length, 0);

  const handoff = await confirmShipmentHandoff(orderId, {
    actor_id: 'warehouse-operator', handoff_reference: 'CARRIER-SCAN-1001',
  });
  assert.equal(handoff.ok, true);
  assert.equal(db.get('inventory', 'inventory_hosted_invoice_resume').on_hand, 1);
  assert.equal(db.list('reservations', { where: { order_id: orderId } })[0].status, 'committed');
  assert.equal(db.list('shipments', { where: { order_id: orderId } })[0].status, 'shipped');
  assert.equal(db.get('orders', orderId).status, 'shipped');
  assert.equal(db.list('audit_log', { where: { kind: 'notify.shipped', ref_id: orderId } }).length, 1);

  const replay = await confirmShipmentHandoff(orderId, {
    actor_id: 'warehouse-operator', handoff_reference: 'CARRIER-SCAN-1001',
  });
  assert.equal(replay.idempotent, true);
  assert.equal(db.get('inventory', 'inventory_hosted_invoice_resume').on_hand, 1);
  assert.equal(db.list('audit_log', { where: { kind: 'notify.shipped', ref_id: orderId } }).length, 1);
  assert.equal(db.list('orders', { where: { id: orderId } }).length, 1);
  assert.equal(db.list('fulfillment_pipeline', { where: { order_id: orderId, step: 'payment' } })[0].result.released, true);
});

test('stock-arrived backorder becomes an unpaid suborder instead of auto-shipping', async () => {
  const parentId = 'Unite-WMS-777-888';
  const sku = 'BACKORDER-RELEASE-SKU';
  db.insert('orders', {
    id: parentId, customer_id: 'org_backorder_release', customer_name: 'Release Buyer',
    contact_email: 'buyer@release.test', payment_method: 'card', payment_terms: 'prepaid',
    po_number: 'PO-RELEASE', status: 'partially_backordered',
  });
  db.insert('inventory', {
    id: 'inventory_backorder_release', sku, warehouse_id: 'wh_atl', on_hand: 2, reserved: 0,
  });
  db.insert('backorders', {
    id: 'bo_release_checkpoint', order_id: parentId, parent_order_id: parentId,
    sku, product_name: 'Release Product', quantity: 2, unit_price: 15,
    status: 'stock_arrived', stock_arrived_qty: 2,
  });
  const beforeMovements = db.list('stock_movements').length;

  const result = await fulfillBackorders(sku, { shipping_cost: 9 });

  assert.deepEqual(result.shipped, []);
  assert.equal(result.suborders.length, 1);
  assert.equal(result.suborders[0].id, `${parentId}-2`);
  assert.equal(result.suborders[0].total, 39);
  assert.equal(result.suborders[0].payment_status, 'pending');
  assert.equal(db.get('backorders', 'bo_release_checkpoint').status, 'suborder_created');
  assert.equal(db.list('invoices', { where: { order_id: `${parentId}-2` } }).length, 0);
  assert.equal(db.list('stock_movements').length, beforeMovements);
});

test('backorder release waits for a newly calculated freight amount', async () => {
  const parentId = 'Unite-WMS-777-999';
  const sku = 'BACKORDER-RATE-SKU';
  db.insert('orders', {
    id: parentId, customer_id: 'org_backorder_rate', customer_name: 'Rate Buyer',
    payment_method: 'card', payment_terms: 'prepaid', status: 'partially_backordered',
  });
  db.insert('inventory', {
    id: 'inventory_backorder_rate', sku, warehouse_id: 'wh_atl', on_hand: 1, reserved: 0,
  });
  db.insert('backorders', {
    id: 'bo_rate_checkpoint', order_id: parentId, parent_order_id: parentId,
    sku, product_name: 'Rate Product', quantity: 1, unit_price: 20,
    status: 'stock_arrived', stock_arrived_qty: 1,
  });

  const result = await fulfillBackorders(sku);

  assert.equal(result.suborders.length, 0);
  assert.deepEqual(result.ready, ['bo_rate_checkpoint']);
  assert.ok(db.list('tasks').some((task) => task.kind === 'backorder_rate_required' && task.ref_id === parentId));
});
