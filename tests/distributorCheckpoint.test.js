import { test } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../src/lib/db.js';
import { consignment } from '../src/lib/consignment.js';
import { distributorPickups } from '../src/lib/distributorPickups.js';
import { confirmShipmentHandoff, runFulfillment } from '../src/lib/fulfillment.js';

function seedDistributorSale({ suffix, settlementPrice = 12.5, onHand = 10 } = {}) {
  const ownerOrgId = `org_distributor_${suffix}`;
  const sku = `DIST-SKU-${suffix}`;
  const distributorSku = `OWNER-SKU-${suffix}`;
  const orderId = `Unite-WMS-CUSTOMER-${suffix}`;
  db.insert('organizations', {
    id: ownerOrgId, name: `Distributor ${suffix}`, segment: 'distributors',
    contact_email: `ops-${suffix}@distributor.test`,
  });
  db.insert('distributor_products', {
    id: `dprod_${suffix}`, owner_org_id: ownerOrgId, distributor_sku: distributorSku,
    mapped_unite_sku: sku, name: `Distributor product ${suffix}`, unite_sellable: true,
    settlement_unit_cost: settlementPrice, settlement_currency: 'USD',
    settlement_effective_from: '2026-01-01T00:00:00.000Z',
    settlement_effective_until: '2027-01-01T00:00:00.000Z',
    low_stock_threshold: 4,
  });
  db.insert('inventory_lots', {
    id: `ilot_${suffix}`, owner_type: 'distributor', owner_org_id: ownerOrgId,
    product_sku: sku, distributor_sku: distributorSku, lot_number: `LOT-${suffix}`,
    expiration_date: '2028-12-31', qty_on_hand: onHand, qty_reserved: 0,
    warehouse_id: 'wh_atl', created_at: '2026-01-01T00:00:00.000Z',
  });
  db.insert('orders', {
    id: orderId, customer_id: `secret_customer_${suffix}`, customer_name: 'Hidden Hospital',
    po_number: `SECRET-CUSTOMER-PO-${suffix}`, total: 200, status: 'ready_to_ship',
  });
  return { ownerOrgId, sku, distributorSku, orderId };
}

test('Unite sell-through creates a draft settlement PO without exposing customer commerce data', () => {
  const fixture = seedDistributorSale({ suffix: 'SETTLEMENT' });
  const result = consignment.recordSellThrough({
    owner_org_id: fixture.ownerOrgId,
    order_id: fixture.orderId,
    sku: fixture.sku,
    qty: 5,
    sold_at: '2026-07-17T12:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.moved, 5);
  assert.equal(result.purchase_order.status, 'draft');
  assert.equal(result.purchase_order.po_type, 'consignment_settlement');
  assert.equal(result.purchase_order.owner_org_id, fixture.ownerOrgId);
  assert.equal(result.purchase_order.total_cost, 62.5);
  assert.equal(result.purchase_order.line_items[0].cost, 12.5);

  const notice = db.list('distributor_notifications', { where: { owner_org_id: fixture.ownerOrgId } })[0];
  assert.equal(notice.kind, 'stock_depletion');
  assert.equal(notice.payload.quantity_sold, 5);
  assert.equal(notice.payload.remaining_inventory, 5);
  const serializedNotice = JSON.stringify(notice);
  assert.doesNotMatch(serializedNotice, /SECRET-CUSTOMER-PO|Hidden Hospital|secret_customer|Unite-WMS-CUSTOMER/);

  const view = consignment.settlementForDistributor(fixture.ownerOrgId);
  assert.equal(view.open_purchase_orders.length, 1);
  assert.equal(view.open_purchase_orders[0].id, result.purchase_order.id);
  const serializedView = JSON.stringify(view);
  assert.doesNotMatch(serializedView, /SECRET-CUSTOMER-PO|Hidden Hospital|secret_customer|Unite-WMS-CUSTOMER/);
  assert.ok(view.movements.every((movement) => !('order_id' in movement) && !('customer_id' in movement)));
});

test('owner-scoped run rates produce dashboard and email low-stock alerts without auto-replenishment', async () => {
  const fixture = seedDistributorSale({ suffix: 'RUN-RATE', onHand: 3 });
  db.insert('consignment_movements', {
    id: 'cm_run_rate_1', owner_org_id: fixture.ownerOrgId, inventory_lot_id: 'ilot_RUN-RATE',
    qty: 9, unit_cost: 12.5, movement: 'sold_by_unite', settled: false,
    created_at: '2026-07-05T12:00:00.000Z',
  });
  db.insert('consignment_movements', {
    id: 'cm_run_rate_other_owner', owner_org_id: 'org_someone_else', inventory_lot_id: 'ilot_other',
    qty: 1000, unit_cost: 1, movement: 'sold_by_unite', settled: false,
    created_at: '2026-07-05T12:00:00.000Z',
  });
  const beforePos = db.list('purchase_orders').length;

  const metrics = consignment.metricsFor(fixture.ownerOrgId, {
    as_of: new Date('2026-07-17T12:00:00.000Z'), window_days: 30,
  });
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].units_sold_window, 9);
  assert.equal(metrics[0].run_rate, 0.3);
  assert.equal(metrics[0].available, 3);
  assert.equal(metrics[0].days_cover, 10);
  assert.equal(metrics[0].low_stock, true);
  assert.equal(metrics[0].service_history[0].kind, 'sell_through');

  const alert = await consignment.notifyLowStock(fixture.ownerOrgId, {
    as_of: new Date('2026-07-17T12:00:00.000Z'), window_days: 30,
  });
  assert.equal(alert.sent, 1);
  assert.ok(db.list('distributor_notifications').some((row) => row.owner_org_id === fixture.ownerOrgId && row.kind === 'low_stock'));
  assert.ok(db.list('gmail_outbox').some((row) => row.to_address === 'ops-RUN-RATE@distributor.test' && /low stock/i.test(row.subject)));
  assert.equal(db.list('purchase_orders').length, beforePos);

  const repeated = await consignment.notifyLowStock(fixture.ownerOrgId, {
    as_of: new Date('2026-07-17T13:00:00.000Z'), window_days: 30,
  });
  assert.equal(repeated.sent, 0);
});

test('distributor pickup request alerts Unite and cannot ship before custody handoff', async () => {
  const ownerOrgId = 'org_distributor_PICKUP';
  const orderId = 'order_distributor_PICKUP';
  const sku = 'DIST-PICKUP-SKU';
  db.insert('organizations', {
    id: ownerOrgId, name: 'Pickup Distributor', segment: 'distributors',
    contact_email: 'pickup@distributor.test',
  });
  db.insert('products', {
    id: 'product_distributor_pickup', sku, name: 'Pickup product',
    lot_tracking: 'required', expiration_tracking: 'required',
  });
  db.insert('orders', {
    id: orderId, customer_id: ownerOrgId, on_behalf_of_org_id: ownerOrgId,
    blind_ship: true, status: 'ready_for_pickup', po_number: 'DISTRIBUTOR-OWN-PO',
  });
  db.insert('inventory', {
    id: 'inventory_distributor_pickup', sku, warehouse_id: 'wh_atl', on_hand: 1, reserved: 1,
  });
  db.insert('lots', {
    id: 'lot_distributor_pickup', product_sku: sku, lot_number: 'PICKUP-LOT',
    expiration_date: '2028-12-31', warehouse_id: 'wh_atl', qty_received: 1, qty_remaining: 1,
  });
  db.insert('reservations', {
    id: 'reservation_distributor_pickup', order_id: orderId, sku,
    warehouse_id: 'wh_atl', qty: 1, status: 'held',
  });

  const requested = await distributorPickups.request({
    owner_org_id: ownerOrgId,
    order_id: orderId,
    carrier_name: 'Local Courier LLC',
    third_party_account_ref: 'acct-ending-4421',
    booking_reference: 'BOOK-77',
    dispatch_contact: { name: 'Dispatch', phone: '555-0100' },
    requested_start: '2026-07-20T10:00:00-04:00',
    requested_end: '2026-07-20T12:00:00-04:00',
    requested_by: 'pickup@distributor.test',
  });
  assert.equal(requested.ok, true);
  assert.equal(requested.pickup.status, 'requested');
  assert.equal(db.get('orders', orderId).status, 'ready_for_pickup');
  assert.ok(db.list('tasks').some((task) => task.kind === 'distributor_pickup_requested' && task.ref_id === requested.pickup.id));
  assert.ok(db.list('gmail_outbox').some((row) => row.to_address === 'warehouse@unitemedical.net' && /pickup requested/i.test(row.subject)));

  const confirmed = distributorPickups.confirm(requested.pickup.id, {
    confirmed_by: 'warehouse-manager',
    confirmed_start: '2026-07-20T10:00:00-04:00',
    confirmed_end: '2026-07-20T12:00:00-04:00',
  });
  assert.equal(confirmed.status, 'confirmed');
  const arrived = distributorPickups.recordArrival(requested.pickup.id, {
    recorded_by: 'dock-operator', driver_name: 'Jordan Driver', vehicle_id: 'VAN-12',
  });
  assert.equal(arrived.status, 'arrived');
  assert.equal(db.get('orders', orderId).status, 'ready_for_pickup');

  const handedOff = distributorPickups.recordHandoff(requested.pickup.id, {
    recorded_by: 'dock-operator', custody_signature: 'Jordan Driver',
  });
  assert.equal(handedOff.ok, true);
  assert.equal(handedOff.pickup.status, 'handed_off');
  assert.equal(db.get('orders', orderId).status, 'shipped');
  assert.equal(db.get('reservations', 'reservation_distributor_pickup').status, 'committed');
});

test('distributor cannot request pickup for another owner organization order', async () => {
  db.insert('orders', {
    id: 'order_other_distributor', customer_id: 'org_rightful_owner',
    on_behalf_of_org_id: 'org_rightful_owner', blind_ship: true, status: 'ready_for_pickup',
  });
  const result = await distributorPickups.request({
    owner_org_id: 'org_wrong_owner', order_id: 'order_other_distributor',
    carrier_name: 'Courier', booking_reference: 'BOOK-X',
    requested_start: '2026-07-20T10:00:00-04:00', requested_end: '2026-07-20T11:00:00-04:00',
    requested_by: 'wrong@owner.test',
  });
  assert.deepEqual(result, { ok: false, reason: 'order_not_owned_by_distributor' });
});

test('explicit distributor-owned order line does not decrement Unite-owned inventory', async () => {
  const fixture = seedDistributorSale({ suffix: 'OWNER-POOL', onHand: 10 });
  db.insert('products', {
    id: 'product_owner_pool', sku: fixture.sku, name: 'Owner pool product',
    price: 30, cogs: 10, lot_tracking: 'optional', expiration_tracking: 'optional',
  });
  db.insert('inventory', {
    id: 'inventory_owner_pool_unite', sku: fixture.sku, warehouse_id: 'wh_atl',
    on_hand: 100, reserved: 0,
  });
  db.update('orders', fixture.orderId, {
    customer_id: 'secret_customer_OWNER-POOL', customer_name: 'Hidden Hospital',
    contact_email: 'hidden@hospital.test', payment_method: 'card', payment_terms: 'prepaid',
    payment_status: 'pending', status: 'payment_pending', subtotal: 60, shipping_cost: 8, total: 68,
    distributor_flow: 'unite_sell_through',
  });
  db.insert('order_items', {
    id: 'order_item_owner_pool', order_id: fixture.orderId, sku: fixture.sku,
    name: 'Owner pool product', qty: 2, unit_price: 30,
    inventory_owner_type: 'distributor', inventory_owner_org_id: fixture.ownerOrgId,
    distributor_flow: 'unite_sell_through', settlement_eligible: true,
  });

  await runFulfillment(fixture.orderId);

  const reservedLot = db.get('inventory_lots', 'ilot_OWNER-POOL');
  assert.equal(reservedLot.qty_on_hand, 10);
  assert.equal(reservedLot.qty_reserved, 2);
  assert.equal(consignment.availableFor({ owner_org_id: fixture.ownerOrgId, sku: fixture.sku }), 8);
  assert.equal(db.get('inventory', 'inventory_owner_pool_unite').on_hand, 100);
  assert.equal(db.list('purchase_orders').some((po) => po.po_type === 'consignment_settlement' && po.owner_org_id === fixture.ownerOrgId), false);

  const handoff = await confirmShipmentHandoff(fixture.orderId, {
    actor_id: 'warehouse-operator', handoff_reference: 'DIST-CUSTODY-OWNER-POOL',
  });
  assert.equal(handoff.ok, true);

  assert.equal(consignment.availableFor({ owner_org_id: fixture.ownerOrgId, sku: fixture.sku }), 8);
  assert.equal(db.get('inventory', 'inventory_owner_pool_unite').on_hand, 100);
  assert.ok(db.list('purchase_orders').some((po) => po.po_type === 'consignment_settlement' && po.owner_org_id === fixture.ownerOrgId));
});

test('sell-through stops before inventory movement when no active agreed price exists', () => {
  const fixture = seedDistributorSale({ suffix: 'NO-PRICE', settlementPrice: 0 });
  const before = consignment.availableFor({ owner_org_id: fixture.ownerOrgId, sku: fixture.sku });

  const result = consignment.recordSellThrough({
    owner_org_id: fixture.ownerOrgId,
    order_id: fixture.orderId,
    sku: fixture.sku,
    qty: 2,
    sold_at: '2026-07-17T12:00:00.000Z',
  });

  assert.deepEqual(result, { ok: false, reason: 'active_settlement_price_required' });
  assert.equal(consignment.availableFor({ owner_org_id: fixture.ownerOrgId, sku: fixture.sku }), before);
  assert.equal(db.list('consignment_movements', { where: { owner_org_id: fixture.ownerOrgId } }).length, 0);
});
