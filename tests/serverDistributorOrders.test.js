import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDistributorBlindOrderDraft, planDistributorReadiness } from '../api/_lib/distributorOrders.js';
import { planPaidOrderRelease, planOrderHandoff } from '../api/_lib/orderLifecycle.js';

const context = {
  ok: true,
  session: { user_id: 'usr_dist', role: 'distributor', org_id: 'org_dist', email: 'ops@dist.org' },
  profile: { id: 'usr_dist', role: 'distributor', org_id: 'org_dist', status: 'active' },
  organization: { id: 'org_dist', name: 'Regional Distributor', tier: 'distributor', approval_status: 'approved', status: 'active' },
  membership: { user_id: 'usr_dist', org_id: 'org_dist', role: 'owner', status: 'active' },
};
const request = {
  external_reference: 'DIST-ORDER-44',
  fulfillment_mode: 'third_party_carrier',
  payment_method: 'net30',
  carrier_name: 'FedEx', carrier_service: 'ground', carrier_account_ref: 'acct-4421',
  destination: {
    recipient: 'Receiving Team', company: 'End Facility', line1: '100 Care Way', line2: 'Dock 4',
    city: 'Savannah', state: 'GA', zip: '31401', country: 'US', email: 'receiving@end-facility.org', phone: '555-0100',
  },
  lines: [{ sku: 'DIST-A', qty: 2, source: 'owner' }, { sku: 'UNITE-A', qty: 1, source: 'unite' }],
};
const distributorProducts = [{
  id: 'dp_a', owner_org_id: 'org_dist', distributor_sku: 'DIST-A', mapped_unite_sku: 'SHARED-A',
  name: 'Owned Device', unite_sellable: true,
}];
const ownerLots = [{
  id: 'ilot_a', owner_type: 'distributor', owner_org_id: 'org_dist', distributor_sku: 'DIST-A',
  product_sku: 'SHARED-A', lot_number: 'DIST-LOT-A', expiration_date: '2028-12-31',
  qty_on_hand: 5, qty_reserved: 1, warehouse_id: 'wh_atl',
}];
const products = [{ id: 'UNITE-A', sku: 'UNITE-A', name: 'Unite Device', price: 20 }];
const inventory = [{ id: 'inv_unite_a', sku: 'UNITE-A', warehouse_id: 'wh_atl', on_hand: 3, reserved: 0 }];

test('distributor blind-order draft preserves destination and carrier while separating owner and Unite stock', () => {
  const result = buildDistributorBlindOrderDraft({
    context, request, distributorProducts, ownerLots, products, inventory,
    paymentMethods: [{ org_id: 'org_dist', method: 'net30', status: 'active', credit_limit: 1000 }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.order.distributor_flow, 'blind_ship');
  assert.equal(result.order.blind_ship, true);
  assert.equal(result.order.public_order_reference, 'DIST-ORDER-44');
  assert.equal(result.order.customer_po, undefined);
  assert.equal(result.order.destination.line1, '100 Care Way');
  assert.equal(result.order.destination.line2, 'Dock 4');
  assert.equal(result.order.destination.email, 'receiving@end-facility.org');
  assert.equal(result.order.carrier_name, 'FedEx');
  assert.equal(result.order.carrier_account_ref, 'acct-4421');
  assert.equal(result.lines[0].inventory_owner_org_id, 'org_dist');
  assert.equal(result.lines[0].unit_price, 0);
  assert.equal(result.lines[0].settlement_eligible, false);
  assert.equal(result.lines[1].inventory_owner_type, 'unite');
  assert.equal(result.lines[1].unit_price, 17.6);
  assert.equal(result.order.total, 17.6);
  assert.equal(result.order.payment_status, 'pending');
});

test('owner-only blind order needs no product payment but still requires explicit source and fulfillment details', () => {
  const ownerOnly = buildDistributorBlindOrderDraft({
    context,
    request: { ...request, lines: [{ sku: 'DIST-A', qty: 2, source: 'owner' }] },
    distributorProducts, ownerLots, products, inventory,
  });
  assert.equal(ownerOnly.ok, true);
  assert.equal(ownerOnly.order.total, 0);
  assert.equal(ownerOnly.order.payment_status, 'not_required');
  assert.equal(ownerOnly.order.status, 'payment_released');

  assert.equal(buildDistributorBlindOrderDraft({
    context, request: { ...request, lines: [{ sku: 'DIST-A', qty: 1 }] }, distributorProducts, ownerLots,
  }).reason, 'inventory_source_required');
  assert.equal(buildDistributorBlindOrderDraft({
    context, request: { ...request, destination: { city: 'Savannah' } }, distributorProducts, ownerLots,
  }).reason, 'complete_destination_required');
  assert.equal(buildDistributorBlindOrderDraft({
    context, request: { ...request, carrier_account_ref: '' }, distributorProducts, ownerLots,
  }).reason, 'carrier_account_required');
});

test('Flow 1 reserves and hands off owner stock without settlement liability', () => {
  const draft = buildDistributorBlindOrderDraft({
    context,
    request: { ...request, fulfillment_mode: 'distributor_pickup', lines: [{ sku: 'DIST-A', qty: 2, source: 'owner' }] },
    distributorProducts, ownerLots, products, inventory,
  });
  const order = { id: 'DIST-FLOW1-1', ...draft.order };
  const lines = draft.lines.map((line, index) => ({ id: `flow1_line_${index}`, order_id: order.id, ...line }));
  const released = planPaidOrderRelease({ order, items: lines, inventory: [], ownerLots });
  assert.equal(released.ok, true);
  assert.equal(released.owner_lots[0].qty_on_hand, 5);
  assert.equal(released.owner_lots[0].qty_reserved, 3);
  assert.equal(released.reservations[0].inventory_owner_org_id, 'org_dist');

  const handed = planOrderHandoff({
    order: { ...released.order, status: 'ready_for_pickup' },
    shipment: { id: 'pickup_shipment_1', order_id: order.id, status: 'pickup_ready', mode: 'distributor_pickup' },
    reservations: released.reservations,
    inventory: [], lots: [], ownerLots: released.owner_lots,
    actorId: 'dock_user', handoffReference: 'BOL-1',
  });
  assert.equal(handed.ok, true);
  assert.equal(handed.owner_lots[0].qty_on_hand, 3);
  assert.equal(handed.owner_lots[0].qty_reserved, 1);
  assert.equal(handed.consignment_movements[0].movement, 'fulfilled_for_owner');
  assert.equal(handed.consignment_movements[0].settlement_eligible, false);
  assert.equal(handed.settlement_candidates.length, 0);
  assert.deepEqual(handed.genealogy.map((row) => [row.lot_number, row.owner_org_id, row.qty]), [['DIST-LOT-A', 'org_dist', 2]]);
});

test('owner stock on recall or quality hold cannot be reserved', () => {
  const order = { id: 'DIST-HELD-1', customer_id: 'org_dist', distributor_flow: 'blind_ship', payment_status: 'not_required', total: 0 };
  const items = [{ id: 'held_line', sku: 'SHARED-A', distributor_sku: 'DIST-A', qty: 1, inventory_owner_type: 'distributor', inventory_owner_org_id: 'org_dist', distributor_flow: 'blind_ship' }];
  const result = planPaidOrderRelease({ order, items, inventory: [], ownerLots: [{ ...ownerLots[0], status: 'quarantined', recall_case_id: 'recall_1' }] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'owner_allocation_shortfall');
});

test('Flow 2 owner-stock handoff emits one settlement candidate at agreed owner identity', () => {
  const flow2Order = {
    id: 'CUSTOMER-FLOW2-1', customer_id: 'secret_customer', payment_status: 'paid',
    status: 'payment_released', distributor_flow: 'unite_sell_through', fulfillment_revision: 0,
  };
  const flow2Items = [{
    id: 'flow2_line', order_id: flow2Order.id, sku: 'SHARED-A-VARIANT', inventory_sku: 'SHARED-A', distributor_sku: 'DIST-A', qty: 2,
    inventory_owner_type: 'distributor', inventory_owner_org_id: 'org_dist',
    distributor_flow: 'unite_sell_through', settlement_eligible: true,
  }];
  const released = planPaidOrderRelease({ order: flow2Order, items: flow2Items, inventory: [], ownerLots });
  const handed = planOrderHandoff({
    order: { ...released.order, status: 'ready_to_ship' },
    shipment: { id: 'shipment_flow2', order_id: flow2Order.id, status: 'label_created' },
    reservations: released.reservations,
    inventory: [], lots: [], ownerLots: released.owner_lots,
    actorId: 'dock_user', handoffReference: 'SCAN-FLOW2',
  });
  assert.equal(handed.ok, true);
  assert.equal(handed.consignment_movements[0].movement, 'sold_by_unite');
  assert.equal(handed.settlement_candidates.length, 1);
  assert.equal(handed.settlement_candidates[0].owner_org_id, 'org_dist');
  assert.equal(handed.settlement_candidates[0].qty, 2);
  assert.equal(handed.genealogy[0].product_sku, 'SHARED-A');
  assert.equal(handed.genealogy[0].ordered_sku, 'SHARED-A-VARIANT');
  assert.equal(handed.consignment_movements[0].product_sku, 'SHARED-A');
  assert.equal(handed.consignment_movements[0].ordered_sku, 'SHARED-A-VARIANT');
});

test('warehouse readiness is explicit and preserves the distributor carrier workflow', () => {
  const base = {
    id: 'DIST-READY-1', distributor_flow: 'blind_ship', blind_ship: true,
    status: 'inventory_reserved', fulfillment_revision: 1,
  };
  const pickup = planDistributorReadiness({
    order: { ...base, fulfillment_mode: 'distributor_pickup', carrier_name: 'Courier Co' },
    actorId: 'warehouse_manager', evidence: { provider_reference: 'PICK-44', document_type: 'booking' },
  });
  assert.equal(pickup.ok, true);
  assert.equal(pickup.order.status, 'ready_for_pickup');
  assert.equal(pickup.shipment.status, 'pickup_ready');

  const thirdParty = planDistributorReadiness({
    order: { ...base, fulfillment_mode: 'third_party_carrier', carrier_name: 'FedEx' },
    actorId: 'warehouse_manager', evidence: { provider_reference: '794644790132', document_type: 'label' },
  });
  assert.equal(thirdParty.order.status, 'ready_to_ship');
  assert.equal(thirdParty.shipment.status, 'label_created');
  assert.equal(thirdParty.shipment.tracking_number, '794644790132');

  assert.equal(planDistributorReadiness({
    order: { ...base, status: 'payment_pending' }, actorId: 'warehouse_manager',
    evidence: { provider_reference: 'X', document_type: 'label' },
  }).reason, 'inventory_not_reserved');
  assert.equal(planDistributorReadiness({
    order: { ...base, fulfillment_mode: 'third_party_carrier' }, actorId: 'warehouse_manager', evidence: {},
  }).reason, 'carrier_evidence_required');
});
