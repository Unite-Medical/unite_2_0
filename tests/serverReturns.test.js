import test from 'node:test';
import assert from 'node:assert/strict';
import { planRmaInspection, planRmaRefund, planRmaStateAction } from '../api/returns/action.js';
import { planReturnRequest } from '../api/returns/request.js';

const now = new Date('2026-07-19T12:00:00.000Z');
const rma = {
  id: 'RMA-1', order_id: 'order_1', customer_id: 'org_customer', status: 'quarantined',
  reason: 'discretionary', revision: 2,
  items: [{ order_item_id: 'line_1', sku: 'SKU-A', lot_id: 'lot_a', qty: 2, unit_price: 1 }],
};
const orderItems = [{ id: 'line_1', order_id: 'order_1', sku: 'SKU-A', inventory_sku: 'PARENT-A', qty: 2, unit_price: 100 }];
const genealogy = [{ id: 'gene_1', order_id: 'order_1', lot_id: 'lot_a', product_sku: 'PARENT-A', ordered_sku: 'SKU-A', owner_type: 'unite', owner_org_id: null, qty: 2 }];
const lots = [{ id: 'lot_a', product_sku: 'PARENT-A', warehouse_id: 'wh_atl', lot_number: 'LOT-A', expiration_date: '2027-01-01', qty_received: 4, qty_remaining: 2, owner_type: 'unite' }];
const inventory = [{ id: 'inv_a', sku: 'PARENT-A', warehouse_id: 'wh_atl', owner_type: 'unite', on_hand: 2, reserved: 0 }];

test('return request is idempotent and cannot exceed shipped or accept opened sterile goods', () => {
  const order = { id: 'order_1', customer_id: 'org_customer', status: 'delivered' };
  const line = { id: 'line_1', order_id: order.id, sku: 'SKU-A', qty: 2, shipped_qty: 2, sterile: true };
  const input = { order, orderItems: [line], items: [{ order_item_id: line.id, qty: 1 }], actorId: 'usr_customer', idempotencyKey: 'return-request-1', now };
  const first = planReturnRequest(input);
  const replay = planReturnRequest(input);
  assert.equal(first.ok, true);
  assert.equal(first.rma.id, replay.rma.id);
  assert.equal(planReturnRequest({ ...input, items: [{ order_item_id: line.id, qty: 1, opened: true, sterile: true }] }).reason, 'opened_sterile_non_returnable');
  assert.equal(planReturnRequest({ ...input, priorRmas: [{ status: 'approved', items: [{ order_item_id: line.id, qty: 2 }] }] }).reason, 'return_exceeds_shipped_quantity');
});

test('RMA approve and physical quarantine receipt are staged transitions', () => {
  const requested = { ...rma, status: 'requested', revision: 0 };
  const approved = planRmaStateAction(requested, { action: 'approve', actorId: 'usr_admin', now });
  assert.equal(approved.ok, true);
  assert.equal(approved.rma.status, 'approved');
  assert.equal(approved.rma.revision, 1);
  const received = planRmaStateAction(approved.rma, { action: 'receive', actorId: 'usr_warehouse', now });
  assert.equal(received.rma.status, 'quarantined');
  assert.equal(received.rma.inventory_state, 'quarantine');
});

test('sellable restock aggregates duplicate lines, uses authoritative price, and writes one exact movement', () => {
  const plan = planRmaInspection({
    rma, orderItems, genealogy, lots, ownerLots: [], inventory, movements: [],
    disposition: 'restock_sellable', actorId: 'usr_admin', actorRole: 'admin', now,
    acceptedItems: [
      { order_item_id: 'line_1', sku: 'SKU-A', lot_id: 'lot_a', qty: 1, unit_price: 1 },
      { order_item_id: 'line_1', sku: 'SKU-A', lot_id: 'lot_a', qty: 1, unit_price: 9999 },
    ],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.movements.length, 1);
  assert.equal(plan.movements[0].qty_delta, 2);
  assert.equal(plan.lots[0].qty_remaining, 4);
  assert.equal(plan.inventory[0].on_hand, 4);
  assert.equal(plan.rma.merchandise_value, 200);
  assert.equal(plan.rma.restocking_fee, 30);
  assert.equal(plan.rma.refund_total, 170);
});

test('restock fails closed on role, genealogy quantity, lot state, and owner mismatch', () => {
  const base = {
    rma, orderItems, genealogy, lots, ownerLots: [], inventory, movements: [],
    disposition: 'restock_sellable', acceptedItems: [{ order_item_id: 'line_1', sku: 'SKU-A', lot_id: 'lot_a', qty: 2 }], actorId: 'usr', now,
  };
  assert.equal(planRmaInspection({ ...base, actorRole: 'warehouse_manager' }).reason, 'admin_release_required');
  assert.equal(planRmaInspection({ ...base, actorRole: 'admin', acceptedItems: [{ order_item_id: 'line_1', sku: 'SKU-A', lot_id: 'lot_a', qty: 3 }] }).reason, 'return_exceeds_requested_quantity');
  assert.equal(planRmaInspection({ ...base, actorRole: 'admin', lots: [{ ...lots[0], status: 'recalled' }] }).reason, 'return_lot_not_sellable');
  for (const heldLot of [
    { ...lots[0], quality_status: 'quality_hold' },
    { ...lots[0], hold_status: 'quarantined' },
    { ...lots[0], recall_case_id: 'recall_1' },
    { ...lots[0], recalled: true },
  ]) {
    assert.equal(planRmaInspection({ ...base, actorRole: 'admin', lots: [heldLot] }).reason, 'return_lot_not_sellable');
  }
  assert.equal(planRmaInspection({ ...base, actorRole: 'admin', lots: [{ ...lots[0], owner_type: 'distributor', owner_org_id: 'org_dist' }] }).reason, 'return_owner_genealogy_mismatch');
});

test('refund cannot complete without matching provider evidence', () => {
  const pending = { ...rma, status: 'refund_pending', refund_total: 170 };
  assert.equal(planRmaRefund(pending, { evidence: {}, actorId: 'usr_finance', actorRole: 'finance', now }).reason, 'refund_provider_evidence_required');
  assert.equal(planRmaRefund(pending, { evidence: { provider: 'stripe', reference: 're_1', amount: 169 }, actorId: 'usr_finance', actorRole: 'finance', now }).reason, 'refund_amount_mismatch');
  const done = planRmaRefund(pending, { evidence: { provider: 'stripe', reference: 're_1', amount: 170 }, actorId: 'usr_finance', actorRole: 'finance', now });
  assert.equal(done.ok, true);
  assert.equal(done.rma.status, 'refunded');
  assert.equal(done.refund.provider_reference, 're_1');
});
