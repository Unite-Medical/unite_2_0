import { test } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../src/lib/db.js';
import { receiving } from '../src/lib/wms/receiving.js';
import { purchaseOrders } from '../src/lib/wms/purchaseOrders.js';
import { lots } from '../src/lib/wms/lots.js';
import { availability } from '../src/lib/wms/availability.js';
import { shipping } from '../src/lib/wms/shipping.js';
import { planPurchaseOrderReceipt, validateReceiveAgainstPurchaseOrder, validateReceiveBody } from '../api/wms/receive.js';

function product(sku, policy = {}) {
  db.insert('products', {
    id: `product_${sku}`,
    sku,
    name: `Product ${sku}`,
    price: 20,
    cogs: 5,
    lot_tracking: policy.lot_tracking || 'optional',
    expiration_tracking: policy.expiration_tracking || 'optional',
  });
}

function sentPo(sku, qty = 10, cost = 5) {
  const po = purchaseOrders.create({
    vendor_name: 'Receiving Test Vendor',
    vendor_id: 'vendor_receiving_test',
    line_items: [{ sku, name: `Product ${sku}`, qty, cost }],
    created_by: 'test',
  });
  db.update('purchase_orders', po.id, { status: 'sent', vendor_email: 'vendor@example.test' });
  return db.get('purchase_orders', po.id);
}

test('every receipt captures lot and expiration as an actual value or explicit N/A', async () => {
  const sku = 'TRACE-CAPTURE-CHECKPOINT';
  product(sku, { lot_tracking: 'optional', expiration_tracking: 'optional' });
  const po = sentPo(sku, 1);

  const missingLot = await purchaseOrders.receive(po.id, [{ sku, qty: 1, expiration_date: '2028-10-31' }]);
  assert.equal(missingLot.ok, false);
  assert.equal(missingLot.reason, 'lot_capture_required');
  assert.equal(missingLot.sku, sku);

  const missingExpiration = await purchaseOrders.receive(po.id, [{ sku, qty: 1, lot_number: 'LOT-TRACE' }]);
  assert.equal(missingExpiration.ok, false);
  assert.equal(missingExpiration.reason, 'expiration_capture_required');
  assert.equal(missingExpiration.sku, sku);
});

test('explicit N/A requires attributable attestation and is stored as evidence', async () => {
  const sku = 'TRACE-NA-CHECKPOINT';
  product(sku, { lot_tracking: 'optional', expiration_tracking: 'optional' });
  const po = sentPo(sku, 1);

  const unverified = await purchaseOrders.receive(po.id, [{
    sku, qty: 1, lot_number: 'N/A', expiration_date: 'N/A',
  }]);
  assert.equal(unverified.ok, false);
  assert.equal(unverified.reason, 'traceability_na_attestation_required');

  const verified = await purchaseOrders.receive(po.id, [{
    sku, qty: 1, lot_number: 'N/A', expiration_date: 'N/A',
    capture_method: 'manual_attestation',
    not_applicable_reason: 'manufacturer_does_not_assign',
  }], { received_by: 'warehouse-operator-17' });
  assert.equal(verified.ok, true);
  assert.equal(verified.lots[0].lot_number, 'N/A');
  assert.equal(verified.lots[0].expiration_date, null);
  assert.equal(verified.lots[0].expiration_not_applicable, true);
  assert.equal(verified.lots[0].traceability_attestation.actor_id, 'warehouse-operator-17');
  assert.equal(verified.lots[0].traceability_attestation.reason, 'manufacturer_does_not_assign');
});

test('required actual tracking values reject N/A attestations', async () => {
  const sku = 'TRACE-ACTUAL-CHECKPOINT';
  product(sku, { lot_tracking: 'required', expiration_tracking: 'required' });
  const po = sentPo(sku, 1);
  const result = await purchaseOrders.receive(po.id, [{
    sku, qty: 1, lot_number: 'N/A', expiration_date: 'N/A',
    capture_method: 'manual_attestation', not_applicable_reason: 'not_found',
  }], { received_by: 'warehouse-manager' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'lot_actual_value_required');
});

test('one SKU retains multiple lot and expiration allocations through shipment', async () => {
  const sku = 'TRACE-MULTILOT-CHECKPOINT';
  const orderId = 'order_trace_multilot';
  product(sku, { lot_tracking: 'required', expiration_tracking: 'required' });
  const po = sentPo(sku, 6);
  const received = await purchaseOrders.receive(po.id, [
    { sku, qty: 2, lot_number: 'LOT-A', expiration_date: '2027-01-31' },
    { sku, qty: 2, lot_number: 'LOT-B', expiration_date: '2027-02-28' },
    { sku, qty: 2, lot_number: 'LOT-C', expiration_date: '2027-03-31' },
  ], { received_by: 'warehouse-operator' });
  assert.equal(received.ok, true);
  assert.deepEqual(received.lots.map((lot) => [lot.lot_number, lot.expiration_date]), [
    ['LOT-A', '2027-01-31'], ['LOT-B', '2027-02-28'], ['LOT-C', '2027-03-31'],
  ]);

  db.insert('orders', { id: orderId, customer_id: 'org_trace_customer', status: 'ready_to_ship' });
  db.insert('reservations', {
    id: 'reservation_trace_multilot', order_id: orderId, sku, warehouse_id: 'wh_atl', qty: 5, status: 'held',
  });
  const inventory = db.list('inventory', { where: { sku, warehouse_id: 'wh_atl' } })[0];
  db.update('inventory', inventory.id, { reserved: 5 });

  const shipped = shipping.confirmShip(orderId, { actor_id: 'warehouse-operator' });
  assert.equal(shipped.ok, true);
  const genealogy = db.list('lot_tracking', { where: { order_id: orderId } });
  assert.deepEqual(genealogy.map((row) => [row.lot_number, row.qty, row.expiration_date]), [
    ['LOT-A', 2, '2027-01-31'], ['LOT-B', 2, '2027-02-28'], ['LOT-C', 1, '2027-03-31'],
  ]);
});

test('receiving rejects every receipt without a purchase order', async () => {
  const sku = 'NO-PO-CHECKPOINT';
  product(sku);
  const before = db.list('stock_movements').length;
  const result = await receiving.receiveScans([
    { sku, qty: 1, lot_number: 'LOT-1', expiration_date: '2028-01-01' },
  ], { po_id: null, warehouse_id: 'wh_atl', received_by: 'darren' });

  assert.deepEqual(result, {
    ok: false, mode: 'po', received: 0, events: 0, reason: 'po_required',
  });
  assert.equal(db.list('stock_movements').length, before);
});

test('server receive contract requires a purchase-order reference', () => {
  assert.deepEqual(validateReceiveBody({ sku: 'API-SKU', warehouse_id: 'wh_atl', qty: 1 }), {
    ok: false, reason: 'po_required',
  });
  assert.deepEqual(validateReceiveBody({
    sku: 'API-SKU', warehouse_id: 'wh_atl', qty: 1,
    ref_type: 'manual', ref_id: 'manual-receipt',
  }), { ok: false, reason: 'po_required' });
  assert.equal(validateReceiveBody({
    sku: 'API-SKU', warehouse_id: 'wh_atl', qty: 1,
    ref_type: 'purchase_order', ref_id: 'po_api_test',
  }).ok, true);
});

test('server receive validates open PO line and required product fields', () => {
  const po = { status: 'sent', line_items: [{ sku: 'API-SKU', qty: 3, received_qty: 0 }] };
  assert.deepEqual(
    validateReceiveAgainstPurchaseOrder(po, { sku: 'WRONG', qty: 1 }, {}),
    { ok: false, reason: 'sku_not_on_po', sku: 'WRONG' },
  );
  assert.deepEqual(
    validateReceiveAgainstPurchaseOrder({ ...po, status: 'draft' }, { sku: 'API-SKU', qty: 1 }, {}),
    { ok: false, reason: 'po_not_receivable' },
  );
  assert.equal(
    validateReceiveAgainstPurchaseOrder(po, { sku: 'API-SKU', qty: 1 }, { lot_tracking: 'required' }).reason,
    'lot_required',
  );
  assert.equal(
    validateReceiveAgainstPurchaseOrder(po, {
      sku: 'API-SKU', qty: 1, lot_number: 'L1', expiration_date: 'N/A',
      capture_method: 'manual_attestation', not_applicable_reason: 'manufacturer_does_not_assign', actor_id: 'warehouse-operator',
    }, { lot_tracking: 'required', expiration_tracking: 'optional' }).ok,
    true,
  );
});

test('server receipt plan advances PO and retains authoritative traceability, cost, and actor evidence', () => {
  const po = {
    id: 'po_server_plan', status: 'sent', po_type: 'inventory', receiving_revision: 0,
    line_items: [{ sku: 'API-PLAN', name: 'Planned item', qty: 3, cost: 5, accepted_qty: 0, received_qty: 0 }],
  };
  const products = [{ sku: 'API-PLAN', name: 'Planned item', lot_tracking: 'optional', expiration_tracking: 'optional' }];
  const body = {
    ref_type: 'purchase_order', ref_id: po.id, warehouse_id: 'wh_atl', idempotency_key: 'receipt-plan-0001',
    actor_id: 'attacker-supplied', unit_cost: 999,
    lines: [{
      sku: 'API-PLAN', qty: 2, lot_number: 'N/A', expiration_date: 'N/A',
      capture_method: 'manual_attestation', not_applicable_reason: 'manufacturer_does_not_assign',
      raw_barcode: ']d2010000000000000010NA',
    }],
  };
  const planned = planPurchaseOrderReceipt({ po, products, body, session: { user_id: 'warehouse-operator-17', role: 'warehouse_operator' } });
  assert.equal(planned.ok, true);
  assert.equal(planned.updated_po.line_items[0].accepted_qty, 2);
  assert.equal(planned.updated_po.line_items[0].vendor_backorder_qty, 1);
  assert.equal(planned.movements[0].unit_cost, 5);
  assert.equal(planned.movements[0].actor_id, 'warehouse-operator-17');
  assert.equal(planned.lots[0].traceability_attestation.actor_id, 'warehouse-operator-17');
  assert.equal(planned.scan_events[0].scanned_by, 'warehouse-operator-17');

  const over = planPurchaseOrderReceipt({
    po: planned.updated_po, products,
    body: { ...body, idempotency_key: 'receipt-plan-0002', lines: [{ ...body.lines[0], qty: 2 }] },
    session: { user_id: 'warehouse-operator-17', role: 'warehouse_operator' },
  });
  assert.equal(over.ok, false);
  assert.equal(over.reason, 'overage_requires_manager');
  assert.equal(over.remaining, 1);

  const blank = planPurchaseOrderReceipt({
    po, products,
    body: { ...body, idempotency_key: 'receipt-plan-0003', lines: [{ sku: 'API-PLAN', qty: 1 }] },
    session: { user_id: 'warehouse-operator-17', role: 'warehouse_operator' },
  });
  assert.equal(blank.reason, 'lot_capture_required');
  assert.equal(planPurchaseOrderReceipt({
    po: { ...po, po_type: 'consignment_settlement' }, products, body,
    session: { user_id: 'warehouse-operator-17', role: 'warehouse_operator' },
  }).reason, 'po_not_receivable');
});

test('PO receiving stops when a scanned SKU is not on the PO', async () => {
  product('PO-LINE-ONLY');
  product('WRONG-PO-LINE');
  const po = sentPo('PO-LINE-ONLY');
  const before = db.list('stock_movements').length;

  const result = await purchaseOrders.receive(po.id, [
    { sku: 'WRONG-PO-LINE', qty: 1, lot_number: 'WRONG-LOT' },
  ], { received_by: 'darren' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'sku_not_on_po');
  assert.equal(result.sku, 'WRONG-PO-LINE');
  assert.equal(db.list('stock_movements').length, before);
});

test('required lot and expiration block receipt until both values are present', async () => {
  const sku = 'TRACKED-CHECKPOINT';
  product(sku, { lot_tracking: 'required', expiration_tracking: 'required' });
  const po = sentPo(sku);
  const before = db.list('stock_movements').length;

  const missingLot = await purchaseOrders.receive(po.id, [
    { sku, qty: 2, expiration_date: '2028-01-01' },
  ], { received_by: 'darren' });
  assert.equal(missingLot.reason, 'lot_required');

  const missingExpiration = await purchaseOrders.receive(po.id, [
    { sku, qty: 2, lot_number: 'LOT-TRACKED' },
  ], { received_by: 'darren' });
  assert.equal(missingExpiration.reason, 'expiration_required');
  assert.equal(db.list('stock_movements').length, before);

  const accepted = await purchaseOrders.receive(po.id, [
    { sku, qty: 2, lot_number: 'LOT-TRACKED', expiration_date: '2028-01-01' },
  ], { received_by: 'darren' });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.received, 2);
  assert.equal(db.list('stock_movements').length, before + 1);
});

test('lot primitive cannot bypass required product tracking fields', () => {
  const sku = 'TRACKED-PRIMITIVE-CHECKPOINT';
  product(sku, { lot_tracking: 'required', expiration_tracking: 'required' });
  const before = db.list('stock_movements').length;

  const result = lots.receiveLot({
    sku,
    warehouse_id: 'wh_atl',
    qty: 1,
    ref_type: 'purchase_order',
    ref_id: 'po_direct_bypass',
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'lot_required');
  assert.equal(db.list('stock_movements').length, before);
});

test('ship confirmation blocks required-tracking stock without complete lot data', () => {
  const sku = 'SHIP-TRACKING-CHECKPOINT';
  const orderId = 'order_ship_tracking_checkpoint';
  product(sku, { lot_tracking: 'required', expiration_tracking: 'required' });
  db.insert('orders', { id: orderId, customer_id: 'org_ship_checkpoint', status: 'packing' });
  db.insert('inventory', {
    id: `inventory_${sku}`, sku, warehouse_id: 'wh_atl', on_hand: 1, reserved: 1,
  });
  db.insert('reservations', {
    id: 'reservation_ship_tracking_checkpoint', order_id: orderId, product_sku: sku,
    sku, warehouse_id: 'wh_atl', qty: 1, status: 'held',
  });
  const before = db.list('stock_movements').length;

  const result = shipping.confirmShip(orderId, { actor_id: 'darren' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'required_tracking_missing');
  assert.equal(result.sku, sku);
  assert.equal(db.list('stock_movements').length, before);
  assert.equal(db.get('reservations', 'reservation_ship_tracking_checkpoint').status, 'held');
});

test('new purchase order preserves the supplier email required for explicit send', () => {
  const sku = 'PO-SUPPLIER-EMAIL-CHECKPOINT';
  product(sku);
  const po = purchaseOrders.create({
    vendor_name: 'Email Vendor',
    vendor_email: 'orders@email-vendor.example',
    line_items: [{ sku, name: 'Email product', qty: 1, cost: 5 }],
  });

  assert.equal(po.vendor_email, 'orders@email-vendor.example');
});

test('partial receipt records vendor backorder and caps finance payable amount', async () => {
  const sku = 'SHORT-PAY-CHECKPOINT';
  product(sku, { lot_tracking: 'required' });
  const po = sentPo(sku, 10, 5);
  db.insert('backorders', {
    id: 'backorder_receipt_checkpoint',
    order_id: 'Unite-WMS-123-456',
    order_item_id: 'order_item_checkpoint',
    customer_id: 'org_checkpoint_customer',
    assigned_owner_email: 'rep@unitemedical.net',
    sku,
    product_name: `Product ${sku}`,
    quantity: 3,
    status: 'pending',
  });

  const result = await purchaseOrders.receive(po.id, [
    { sku, qty: 8, lot_number: 'LOT-SHORT', expiration_date: '2027-12-31' },
  ], { received_by: 'darren' });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'partial');
  const updated = db.get('purchase_orders', po.id);
  assert.equal(updated.line_items[0].received_qty, 8);
  assert.equal(updated.line_items[0].accepted_qty, 8);
  assert.equal(updated.line_items[0].vendor_backorder_qty, 2);
  assert.equal(updated.line_items[0].billable_qty, 8);

  const payable = purchaseOrders.payableSummary(po.id, {
    vendor_bill_lines: [{ sku, qty: 10, unit_cost: 5 }],
  });
  assert.equal(payable.approved_amount, 40);
  assert.equal(payable.held_amount, 10);
  assert.equal(payable.can_approve_full_bill, false);
  assert.equal(payable.lines[0].vendor_backorder_qty, 2);

  assert.ok(db.list('tasks').some((task) => task.kind === 'po_shortage' && task.ref_id === po.id));
  assert.ok(db.list('tasks').some((task) => task.kind === 'backorder_stock_arrived' && task.ref_id === 'backorder_receipt_checkpoint'));
  assert.ok(db.list('audit_log').some((row) => row.kind === 'backorder.stock_arrived' && row.ref_id === 'backorder_receipt_checkpoint'));
});

test('same lot number with different expirations and owners remains separate', () => {
  const sku = 'LOT-IDENTITY-CHECKPOINT';
  product(sku);
  const first = lots.receiveLot({ sku, lot_number: 'LOT-42', expiration_date: '2028-01-31', warehouse_id: 'wh_atl', qty: 2, received_by: 'operator', capture_method: 'scan', ref_id: 'po_lot_identity_1', idempotency_key: 'lot-identity-1' });
  const second = lots.receiveLot({ sku, lot_number: 'LOT-42', expiration_date: '2029-01-31', warehouse_id: 'wh_atl', qty: 3, received_by: 'operator', capture_method: 'scan', ref_id: 'po_lot_identity_2', idempotency_key: 'lot-identity-2' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  const rows = db.list('lots', { where: { product_sku: sku, lot_number: 'LOT-42', warehouse_id: 'wh_atl' } });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.expiration_date).sort(), ['2028-01-31', '2029-01-31']);
});

test('quarantined lot is removed from ATP and FEFO allocation', () => {
  const sku = 'RECALL-HOLD-CHECKPOINT';
  product(sku);
  const held = lots.receiveLot({ sku, lot_number: 'RECALLED-LOT', expiration_date: '2028-01-31', warehouse_id: 'wh_atl', qty: 3, received_by: 'operator', capture_method: 'scan', ref_id: 'po_recall_hold_1', idempotency_key: 'recall-hold-1' });
  const clear = lots.receiveLot({ sku, lot_number: 'CLEAR-LOT', expiration_date: '2029-01-31', warehouse_id: 'wh_atl', qty: 2, received_by: 'operator', capture_method: 'scan', ref_id: 'po_recall_hold_2', idempotency_key: 'recall-hold-2' });
  db.update('lots', held.lot.id, { status: 'quarantined', recall_case_id: 'recall_case_1' });
  assert.equal(availability.availableToPromise(sku, 'wh_atl'), 2);
  const picked = lots.pickFEFO(sku, 'wh_atl', 3);
  assert.deepEqual(picked.allocations.map((row) => row.lot_id), [clear.lot.id]);
  assert.equal(picked.allocations[0].qty, 2);
  assert.equal(picked.shortfall, 1);
});

test('server receipt derives owner identity from the PO and rejects browser owner authority', () => {
  const po = {
    id: 'po_owner_receipt', status: 'sent', po_type: 'consignment_inbound',
    inventory_owner_type: 'distributor', inventory_owner_org_id: 'org_owner_a', receiving_revision: 0,
    line_items: [{ sku: 'OWNER-RECEIPT-SKU', qty: 2, cost: 4, received_qty: 0, accepted_qty: 0 }],
  };
  const base = {
    ref_type: 'purchase_order', ref_id: po.id, warehouse_id: 'wh_atl', idempotency_key: 'owner-receipt-0001',
    lines: [{ sku: 'OWNER-RECEIPT-SKU', qty: 2, lot_number: 'OWNER-LOT', expiration_date: '2029-01-31', capture_method: 'scan' }],
  };
  const session = { user_id: 'warehouse-operator', role: 'warehouse_operator' };
  const products = [{ id: 'OWNER-RECEIPT-SKU', sku: 'OWNER-RECEIPT-SKU', lot_tracking: 'required', expiration_tracking: 'required' }];
  const plan = planPurchaseOrderReceipt({ po, products, body: base, session, now: new Date('2026-07-19T12:00:00.000Z') });
  assert.equal(plan.ok, true);
  assert.equal(plan.lots[0].owner_type, 'distributor');
  assert.equal(plan.lots[0].owner_org_id, 'org_owner_a');
  assert.equal(plan.movements[0].owner_org_id, 'org_owner_a');
  assert.match(plan.lots[0].id, /^lot_/);

  const forged = planPurchaseOrderReceipt({
    po, products, session,
    body: { ...base, owner_type: 'unite', owner_org_id: 'org_attacker' },
  });
  assert.equal(forged.ok, false);
  assert.equal(forged.reason, 'inventory_owner_mismatch');
});
