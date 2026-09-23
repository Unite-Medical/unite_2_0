import { test } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../src/lib/db.js';
import {
  createReturn,
  approveReturn,
  receiveReturn,
  inspectReturn,
  issueReturnRefund,
} from '../src/lib/fulfillment.js';

test('RMA request is system-numbered and does not restock or refund', async () => {
  const orderId = 'Unite-WMS-RMA-001';
  const sku = 'RMA-SKU-001';
  db.insert('organizations', {
    id: 'org_rma_checkpoint', name: 'RMA Buyer', account_owner_email: 'rep-rma@unitemedical.net',
  });
  db.insert('orders', {
    id: orderId, customer_id: 'org_rma_checkpoint', customer_name: 'RMA Buyer',
    contact_email: 'buyer@rma.test', payment_method: 'card', status: 'delivered',
  });
  db.insert('order_items', {
    id: 'rma_order_item', order_id: orderId, sku, name: 'Returnable item', qty: 2, unit_price: 100,
  });
  db.insert('inventory', {
    id: 'inventory_rma_checkpoint', sku, warehouse_id: 'wh_atl', on_hand: 0, reserved: 0,
  });
  const beforeMovements = db.list('stock_movements').length;
  const beforePayments = db.list('payments').length;

  const result = await createReturn(orderId, [
    { sku, qty: 2, unit_price: 100, opened: false },
  ], { reason: 'discretionary', requested_by: 'buyer@rma.test' });

  assert.equal(result.ok, true);
  assert.match(result.rma.id, /^RMA-/);
  assert.equal(result.rma.status, 'requested');
  assert.equal(result.rma.refund_total, null);
  assert.equal(db.list('stock_movements').length, beforeMovements);
  assert.equal(db.list('payments').length, beforePayments);
  assert.ok(db.list('tasks').some((task) => task.kind === 'rma_review' && task.ref_id === result.rma.id));
});

test('discretionary unopened return applies 15 percent restocking only after inspection', async () => {
  const orderId = 'Unite-WMS-RMA-002';
  const sku = 'RMA-SKU-002';
  db.insert('orders', {
    id: orderId, customer_id: 'org_rma_checkpoint', customer_name: 'RMA Buyer',
    contact_email: 'buyer@rma.test', payment_method: 'card', status: 'delivered',
  });
  db.insert('order_items', {
    id: 'rma_order_item_2', order_id: orderId, sku, name: 'Returnable item', qty: 2, unit_price: 100,
  });
  db.insert('inventory', {
    id: 'inventory_rma_checkpoint_2', sku, warehouse_id: 'wh_atl', on_hand: 0, reserved: 0,
  });
  db.insert('lots', {
    id: 'lot_rma_checkpoint_2', product_sku: sku, lot_number: 'RMA-LOT-2', expiration_date: '2028-12-31',
    warehouse_id: 'wh_atl', owner_type: 'unite', owner_org_id: null, qty_received: 2, qty_remaining: 0,
  });
  db.insert('lot_tracking', {
    id: 'lt_rma_checkpoint_2', lot_id: 'lot_rma_checkpoint_2', lot_number: 'RMA-LOT-2',
    product_sku: sku, order_id: orderId, customer_id: 'org_rma_checkpoint', qty: 2,
    expiration_date: '2028-12-31', shipped_at: new Date().toISOString(),
  });
  const requested = await createReturn(orderId, [
    { sku, qty: 2, unit_price: 100, opened: false },
  ], { reason: 'discretionary', requested_by: 'buyer@rma.test' });

  assert.equal(approveReturn(requested.rma.id, { approved_by: 'rep-rma' }).status, 'approved');
  assert.equal(receiveReturn(requested.rma.id, { received_by: 'darren' }).status, 'quarantined');
  assert.equal(db.list('inventory', { where: { sku } })[0].on_hand, 0);

  const inspected = inspectReturn(requested.rma.id, {
    inspected_by: 'darren',
    released_by: 'usr_admin',
    disposition: 'restock_sellable',
    accepted_items: [{ sku, lot_id: 'lot_rma_checkpoint_2', qty: 2, unit_price: 100 }],
  });
  assert.equal(inspected.ok, true);
  assert.equal(inspected.rma.status, 'refund_pending');
  assert.equal(inspected.rma.merchandise_value, 200);
  assert.equal(inspected.rma.restocking_fee, 30);
  assert.equal(inspected.rma.refund_total, 170);
  assert.equal(db.list('inventory', { where: { sku } })[0].on_hand, 2);

  const refunded = await issueReturnRefund(requested.rma.id, { approved_by: 'finance' });
  assert.equal(refunded.ok, true);
  assert.equal(refunded.rma.status, 'refunded');
});

test('opened sterile customer return is rejected before RMA creation', async () => {
  const orderId = 'Unite-WMS-RMA-003';
  db.insert('orders', { id: orderId, customer_id: 'org_rma_checkpoint', status: 'delivered' });
  const result = await createReturn(orderId, [
    { sku: 'STERILE-OPEN', qty: 1, unit_price: 50, opened: true, sterile: true },
  ], { reason: 'discretionary', requested_by: 'buyer@rma.test' });

  assert.deepEqual(result, { ok: false, reason: 'opened_sterile_non_returnable' });
});

test('quarantine release requires admin authority and expired disposal evidence', async () => {
  const orderId = 'Unite-WMS-RMA-004';
  const sku = 'RMA-SKU-004';
  db.insert('orders', { id: orderId, customer_id: 'org_rma_checkpoint', status: 'delivered' });
  const requested = await createReturn(orderId, [
    { sku, qty: 1, unit_price: 25, lot_number: 'LOT-EXPIRED', expiration_date: '2026-01-01' },
  ], { reason: 'expired', requested_by: 'buyer@rma.test' });
  approveReturn(requested.rma.id, { approved_by: 'rep-rma' });
  receiveReturn(requested.rma.id, { received_by: 'darren' });

  const warehouseOnly = inspectReturn(requested.rma.id, {
    inspected_by: 'darren', disposition: 'restock_sellable', accepted_items: requested.rma.items,
  });
  assert.deepEqual(warehouseOnly, { ok: false, reason: 'admin_release_required' });

  const destroy = inspectReturn(requested.rma.id, {
    inspected_by: 'darren', released_by: 'usr_admin',
    disposition: 'destroy', accepted_items: requested.rma.items,
  });
  assert.deepEqual(destroy, { ok: false, reason: 'invalid_disposition' });

  const noEvidence = inspectReturn(requested.rma.id, {
    inspected_by: 'darren', released_by: 'usr_admin',
    disposition: 'expired_disposal', accepted_items: requested.rma.items,
  });
  assert.deepEqual(noEvidence, { ok: false, reason: 'disposition_evidence_required' });

  const disposed = inspectReturn(requested.rma.id, {
    inspected_by: 'darren', released_by: 'usr_admin',
    disposition: 'expired_disposal', accepted_items: requested.rma.items,
    disposition_evidence: { reference: 'DISPOSAL-PHOTO-004', note: 'Expired product placed in approved disposal stream.' },
  });
  assert.equal(disposed.ok, true);
  assert.equal(disposed.rma.disposition, 'expired_disposal');
  assert.equal(disposed.rma.disposition_evidence.reference, 'DISPOSAL-PHOTO-004');
  assert.equal(disposed.rma.released_by, 'usr_admin');
});
