import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDistributorOverview, validateDistributorPickupRequest } from '../api/_lib/distributorProjection.js';

test('distributor overview isolates owner inventory and recursively excludes customer commerce', () => {
  const tables = {
    organizations: [
      { id: 'org_a', name: 'Distributor A', segment: 'distributors', contact_email: 'a@test' },
      { id: 'org_b', name: 'Distributor B', segment: 'distributors', contact_email: 'b@test' },
    ],
    distributor_products: [
      { id: 'dp_a', owner_org_id: 'org_a', mapped_unite_sku: 'SHARED', distributor_sku: 'A-SKU', settlement_unit_cost: 12, low_stock_threshold: 5 },
      { id: 'dp_b', owner_org_id: 'org_b', mapped_unite_sku: 'SHARED', distributor_sku: 'B-SKU', settlement_unit_cost: 20, low_stock_threshold: 7 },
    ],
    inventory_lots: [
      { id: 'lot_a', owner_type: 'distributor', owner_org_id: 'org_a', product_sku: 'SHARED', distributor_sku: 'A-SKU', lot_number: 'LOT-A', expiration_date: '2027-01-01', qty_on_hand: 4, qty_reserved: 1, warehouse_id: 'wh_atl' },
      { id: 'lot_b', owner_type: 'distributor', owner_org_id: 'org_b', product_sku: 'SHARED', distributor_sku: 'B-SKU', lot_number: 'LOT-B', expiration_date: '2027-02-01', qty_on_hand: 99, qty_reserved: 0, warehouse_id: 'wh_atl' },
    ],
    consignment_movements: [
      { id: 'move_a', owner_org_id: 'org_a', inventory_lot_id: 'lot_a', movement: 'sold_by_unite', qty: 3, unit_cost: 12, order_id: 'SECRET-ORDER', customer_po: 'SECRET-PO', customer_name: 'Secret Hospital', settlement_po_id: 'po_a', created_at: '2026-07-17T12:00:00Z' },
      { id: 'move_b', owner_org_id: 'org_b', inventory_lot_id: 'lot_b', movement: 'sold_by_unite', qty: 50, unit_cost: 20, order_id: 'OTHER-SECRET', created_at: '2026-07-17T12:00:00Z' },
    ],
    purchase_orders: [
      { id: 'po_a', owner_org_id: 'org_a', po_type: 'consignment_settlement', status: 'draft', total_cost: 36, customer_po: 'SECRET-PO', internal_source_order_id: 'SECRET-ORDER', line_items: [{ sku: 'A-SKU', qty: 3, cost: 12 }] },
      { id: 'po_b', owner_org_id: 'org_b', po_type: 'consignment_settlement', status: 'draft', total_cost: 1000, line_items: [] },
    ],
    distributor_notifications: [{ id: 'note_a', owner_org_id: 'org_a', kind: 'low_stock', title: 'Low stock', message: 'A-SKU low', payload: { distributor_sku: 'A-SKU', remaining_inventory: 3, days_cover: 10 }, created_at: '2026-07-18T12:00:00Z' }],
    distributor_pickups: [{ id: 'pickup_a', owner_org_id: 'org_a', status: 'requested', public_order_reference: 'DIST-A-44', requested_start: '2026-07-20T10:00:00Z' }],
    distributor_pickup_events: [],
  };

  const view = buildDistributorOverview({ session: { role: 'distributor', org_id: 'org_a' }, tables, as_of: new Date('2026-07-18T12:00:00Z'), window_days: 30 });

  assert.equal(view.organization.id, 'org_a');
  assert.equal(view.inventory.length, 1);
  assert.equal(view.inventory[0].lot_number, 'LOT-A');
  assert.equal(view.inventory[0].available, 3);
  assert.equal(view.settlement_purchase_orders.length, 1);
  assert.equal(view.settlement_purchase_orders[0].id, 'po_a');
  assert.equal(view.service_history.length, 1);
  assert.equal(view.service_history[0].quantity, 3);
  assert.equal(view.notifications[0].distributor_sku, 'A-SKU');
  assert.equal(view.notifications[0].remaining_inventory, 3);
  const serialized = JSON.stringify(view);
  assert.doesNotMatch(serialized, /org_b|LOT-B|B-SKU|SECRET-ORDER|SECRET-PO|Secret Hospital|OTHER-SECRET|customer_po|customer_name|order_id|internal_source/i);
});

test('server pickup request requires the owning distributor and a ready blind-ship order', () => {
  const order = { id: 'DIST-ORDER-1', on_behalf_of_org_id: 'org_a', blind_ship: true, status: 'ready_for_pickup' };
  const input = {
    carrier_name: 'Courier Co', booking_reference: 'BOOK-1',
    requested_start: '2026-07-20T10:00:00-04:00', requested_end: '2026-07-20T12:00:00-04:00',
    dispatch_contact: { name: 'Dispatcher', phone: '555-0101' },
  };
  assert.equal(validateDistributorPickupRequest({ session: { role: 'distributor', org_id: 'org_a' }, order, input }).ok, true);
  assert.equal(validateDistributorPickupRequest({ session: { role: 'distributor', org_id: 'org_b' }, order, input }).reason, 'order_not_owned');
  assert.equal(validateDistributorPickupRequest({ session: { role: 'distributor', org_id: 'org_a' }, order: { ...order, status: 'processing' }, input }).reason, 'order_not_ready');
  assert.equal(validateDistributorPickupRequest({ session: { role: 'sales', org_id: 'org_a' }, order, input }).reason, 'distributor_access_required');
  assert.equal(validateDistributorPickupRequest({
    session: { role: 'distributor', org_id: 'org_a' }, order,
    input: { ...input, requested_start: '2026-07-20T06:00:00-04:00', requested_end: '2026-07-20T08:00:00-04:00' },
  }).reason, 'pickup_outside_warehouse_hours');
  assert.equal(validateDistributorPickupRequest({
    session: { role: 'distributor', org_id: 'org_a' }, order,
    input: { ...input, requested_start: '2026-07-20T15:00:00-04:00', requested_end: '2026-07-20T16:01:00-04:00' },
  }).reason, 'pickup_outside_warehouse_hours');
});

test('distributor overview rejects non-distributor and missing owner sessions', () => {
  assert.equal(buildDistributorOverview({ session: { role: 'sales', org_id: 'org_a' }, tables: {} }), null);
  assert.equal(buildDistributorOverview({ session: { role: 'distributor' }, tables: {} }), null);
});
