import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planReplenishmentPurchaseOrders,
  planSourcingOfferPurchaseOrder,
} from '../api/vendor/purchase-orders/draft.js';

const now = new Date('2026-07-19T12:00:00.000Z');

test('replenishment drafts derive from Unite-owned pools and approved vendor data', () => {
  const plan = planReplenishmentPurchaseOrders({
    products: [{ sku: 'SKU-1', name: 'Product', vendor: 'Vendor One', cogs: 10, reorder_qty: 6 }],
    inventory: [
      { sku: 'SKU-1', owner_type: 'unite', on_hand: 2, reserved: 1, reorder_at: 3, reorder_qty: 5 },
      { sku: 'SKU-1', owner_type: 'distributor', owner_org_id: 'org_dist', on_hand: 100, reserved: 0, reorder_at: 0 },
    ],
    vendors: [{ id: 'vendor_1', name: 'Vendor One', status: 'approved', contact_email: 'vendor@example.test' }],
    actorId: 'usr_admin', idempotencyKey: 'batch-replenishment-1', now,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.purchase_orders.length, 1);
  assert.equal(plan.purchase_orders[0].line_items[0].qty, 5);
  assert.equal(plan.purchase_orders[0].total_cost, 50);
  const replay = planReplenishmentPurchaseOrders({
    products: [{ sku: 'SKU-1', name: 'Product', vendor: 'Vendor One', cogs: 10, reorder_qty: 6 }],
    inventory: [{ sku: 'SKU-1', owner_type: 'unite', on_hand: 2, reserved: 1, reorder_at: 3, reorder_qty: 5 }],
    vendors: [{ id: 'vendor_1', name: 'Vendor One', status: 'approved' }],
    actorId: 'usr_admin', idempotencyKey: 'batch-replenishment-1', now,
  });
  assert.equal(plan.purchase_orders[0].id, replay.purchase_orders[0].id);
});

test('sourcing approval creates a draft only from a current reviewable approved-vendor offer', () => {
  const offer = {
    id: 'offer_1', revision: 2, status: 'reviewable', vendor_id: 'vendor_1', vendor_name: 'Vendor One',
    sourcing_request_id: 'request_1',
    line_items: [{ sku: 'SKU-1', name: 'Product', qty: 4, unit_price: 11, valid_until: '2026-08-19T00:00:00.000Z' }],
  };
  const vendor = { id: 'vendor_1', name: 'Vendor One', status: 'approved', contact_email: 'vendor@example.test' };
  const request = { id: 'request_1', status: 'sourcing' };
  const plan = planSourcingOfferPurchaseOrder({ offer, vendor, request, actorId: 'usr_admin', expectedRevision: 2, now });
  assert.equal(plan.ok, true);
  assert.equal(plan.purchase_order.status, 'draft');
  assert.equal(plan.purchase_order.total_cost, 44);
  assert.equal(plan.offer.status, 'approved');
  assert.equal(plan.request.status, 'po_draft');
  assert.equal(planSourcingOfferPurchaseOrder({ offer, vendor, request, actorId: 'usr_admin', expectedRevision: 1, now }).reason, 'offer_revision_changed');
  assert.equal(planSourcingOfferPurchaseOrder({ offer, vendor: { ...vendor, status: 'pending' }, request, actorId: 'usr_admin', expectedRevision: 2, now }).reason, 'vendor_not_approved');
  assert.equal(planSourcingOfferPurchaseOrder({ offer: { ...offer, line_items: [{ ...offer.line_items[0], valid_until: '2026-01-01' }] }, vendor, request, actorId: 'usr_admin', expectedRevision: 2, now }).reason, 'vendor_price_expired');
});
