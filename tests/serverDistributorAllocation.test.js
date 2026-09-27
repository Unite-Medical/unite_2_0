import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planDistributorOwnerAllocation } from '../api/_lib/distributorAllocation.js';

const order = { id: 'UM-CUSTOMER-1', customer_id: 'org_customer', status: 'payment_pending', payment_status: 'pending', fulfillment_revision: 0 };
const item = { id: 'line_1', order_id: order.id, sku: 'SHARED-A', name: 'Device', qty: 2, unit_price: 30 };
const products = [{
  id: 'dp_a', owner_org_id: 'org_dist_a', distributor_sku: 'DIST-A', mapped_unite_sku: 'SHARED-A',
  unite_sellable: true, settlement_unit_cost: 12, settlement_effective_from: '2026-01-01T00:00:00Z',
}];
const ownerLots = [{ id: 'lot_a', owner_org_id: 'org_dist_a', product_sku: 'SHARED-A', distributor_sku: 'DIST-A', qty_on_hand: 4, qty_reserved: 1 }];

test('staff owner allocation marks an ordinary customer line as Flow 2 without moving stock', () => {
  const result = planDistributorOwnerAllocation({
    order, item, ownerOrgId: 'org_dist_a', distributorProducts: products, ownerLots,
    actorId: 'sales_user', now: new Date('2026-07-18T12:00:00Z'),
  });
  assert.equal(result.ok, true);
  assert.equal(result.item.inventory_owner_type, 'distributor');
  assert.equal(result.item.inventory_owner_org_id, 'org_dist_a');
  assert.equal(result.item.distributor_flow, 'unite_sell_through');
  assert.equal(result.item.settlement_eligible, true);
  assert.equal(result.item.distributor_sku, 'DIST-A');
  assert.equal(result.order.fulfillment_revision, 1);
  assert.equal(result.owner_lots[0].qty_on_hand, 4);
  assert.equal(result.owner_lots[0].qty_reserved, 1);
});

test('owner allocation fails closed on payment release, inactive agreement, wrong owner, or short stock', () => {
  const args = { order, item, ownerOrgId: 'org_dist_a', distributorProducts: products, ownerLots, actorId: 'sales_user' };
  assert.equal(planDistributorOwnerAllocation({ ...args, order: { ...order, payment_status: 'paid' } }).reason, 'allocation_window_closed');
  assert.equal(planDistributorOwnerAllocation({ ...args, ownerOrgId: 'org_dist_b' }).reason, 'owner_product_not_sellable');
  assert.equal(planDistributorOwnerAllocation({ ...args, distributorProducts: [{ ...products[0], settlement_unit_cost: 0 }] }).reason, 'active_settlement_price_required');
  assert.equal(planDistributorOwnerAllocation({ ...args, ownerLots: [{ ...ownerLots[0], qty_on_hand: 2, qty_reserved: 1 }] }).reason, 'insufficient_owner_inventory');
});
