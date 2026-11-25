import process from 'node:process';
import {financialFingerprint} from '../api/_lib/financialDecisions.js';
process.env.UNITE_ASHLEY_EMAIL='accounting@unitemedical.net';
function reviewed(order){return {...order,finance_release:{actor_id:'ashley',actor_email:'accounting@unitemedical.net',reference:'verified-test-payment',fingerprint:financialFingerprint(order,'release')}};}
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLabelRequest, applyLabelEvidence, warehouseShipping } from '../api/_lib/orderShipping.js';

const order = reviewed({
  ship_from:{street1:'1 Test Warehouse',city:'Atlanta',state:'GA',postalCode:'30303',country:'US'},
  shipping_package:{weight:{value:5,units:'pounds'},dimensions:{length:10,width:8,height:6,units:'inches'}},
  id: 'UM-SHIP-1', status: 'inventory_reserved', payment_status: 'paid',
  ship_to_address_id: 'addr_1', ship_method: 'fedex_ground', customer_name: 'Buyer ASC',
});
const address = {
  id: 'addr_1', label: 'Main', recipient: 'Receiving', company: 'Buyer ASC',
  line1: '100 Medical Way', line2: 'Dock 2', city: 'Atlanta', state: 'GA', zip: '30303', country: 'US',
};
const items = [{ sku: 'SKU-A', qty: 2 }];

test('server label request uses the owned destination and a deterministic provider reference', () => {
  const result = buildLabelRequest({ order, address, items, now: new Date('2026-07-18T12:00:00.000Z') });
  assert.equal(result.ok, true);
  assert.equal(result.provider_reference, order.id);
  assert.equal(result.body.shipTo.street1, '100 Medical Way');
  assert.equal(result.body.shipTo.street2, 'Dock 2');
  assert.equal(result.body.shipTo.postalCode, '30303');
  assert.equal(result.body.serviceCode, 'fedex_ground');
  assert.equal(result.body.testLabel, false);
});

test('label evidence moves order only to ready-to-ship and never implies custody', () => {
  const request = buildLabelRequest({ order, address, items });
  const applied = applyLabelEvidence({
    order,
    request,
    provider: { shipmentId: 99, trackingNumber: '1ZREAL', labelData: 'BASE64', shipmentCost: 12.5 },
    now: new Date('2026-07-18T13:00:00.000Z'),
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.order.status, 'ready_to_ship');
  assert.equal(applied.order.shipped_at, undefined);
  assert.equal(applied.shipment.status, 'label_created');
  assert.equal(applied.shipment.tracking_number, '1ZREAL');
  assert.equal(applied.shipment.handoff_reference, undefined);
});

test('server label request rejects unpaid, unreserved, or missing-address orders', () => {
  assert.equal(buildLabelRequest({ order: { ...order, payment_status: 'pending' }, address, items }).reason, 'payment_not_released');
  assert.equal(buildLabelRequest({ order: { ...order, status: 'payment_released' }, address, items }).reason, 'inventory_not_reserved');
  assert.equal(buildLabelRequest({ order, address: null, items }).reason, 'shipping_address_not_found');
});

test('staff orders without a checkout rate ship the approved carton from the warehouse', () => {
  const env = { UNITE_SHIP_FROM_STREET: '1487 Trae Lane', UNITE_SHIP_FROM_CITY: 'Lithia Springs', UNITE_SHIP_FROM_STATE: 'GA', UNITE_SHIP_FROM_ZIP: '30122' };
  const products = [{ sku: 'P', variants: [{ sku: 'SKU-A', shipping_packages: [{ approved: true, quantity: 2, weight_lb: 1, length_in: 8, width_in: 6, height_in: 4 }] }] }];
  const staff = reviewed({ ...order, ship_from: undefined, shipping_package: undefined, ship_method: null });
  const fallback = warehouseShipping(staff, items, products, env);
  const request = buildLabelRequest({ order: staff, address, items, fallback });
  assert.equal(request.ok, true);
  assert.equal(request.body.shipFrom.postalCode, '30122');
  assert.deepEqual(request.body.dimensions, { length: 8, width: 6, height: 4, units: 'inches' });
  assert.equal(buildLabelRequest({ order: staff, address, items, fallback: warehouseShipping(staff, items, [], env) }).reason, 'verified_shipping_package_required');
  assert.equal(warehouseShipping(order, items, products, env), null);
  assert.equal(warehouseShipping({ ...staff, fulfillment_mode: 'distributor_pickup' }, items, products, env), null);
});

test('ready-to-ship list: released parcel orders only, with ship-to and lines', async () => {
  const { readyToShipOrders, LABEL_ROLES } = await import('../api/_lib/orderShipping.js');
  assert.ok(LABEL_ROLES.includes('warehouse_operator'));
  const rows = readyToShipOrders({
    orders: [
      { id: 'a', status: 'inventory_reserved', customer_name: 'Clinic', ship_to_address_id: 'ad1', inventory_reserved_at: '2026-01-02' },
      { id: 'b', status: 'ready_to_ship', tracking_number: '1Z', carrier: 'ups', inventory_reserved_at: '2026-01-01' },
      { id: 'c', status: 'payment_pending' },
      { id: 'd', status: 'inventory_reserved', fulfillment_mode: 'customer_pickup' },
      { id: 'e', status: 'inventory_reserved', shipment_plan: [{ id: 's1' }, { id: 's2' }] },
    ],
    items: [{ order_id: 'a', sku: 'X', name: 'X item', qty: 2 }, { order_id: 'a', sku: 'Y', removed: true, qty: 1 }],
    addresses: [{ id: 'ad1', recipient: 'Dock', city: 'Malibu', state: 'CA', zip: '90265' }],
  });
  assert.deepEqual(rows.map((r) => r.id), ['b', 'a']);
  assert.deepEqual(rows[1].ship_to, { name: 'Dock', city: 'Malibu', state: 'CA', zip: '90265' });
  assert.deepEqual(rows[1].items, [{ sku: 'X', name: 'X item', qty: 2 }]);
  const [labelled] = readyToShipOrders({
    orders: [{ id: 'b', status: 'ready_to_ship', tracking_number: '1Z', carrier: 'ups' }],
    shipments: [{ order_id: 'b', tracking_number: 'OLD', service: 'ups_2nd_day', label_cost: 30 }, { order_id: 'b', tracking_number: '1Z', service: 'ups_ground', label_cost: 9.5 }],
  });
  assert.equal(labelled.service, 'ups_ground');
  assert.equal(labelled.label_cost, 9.5);
});
