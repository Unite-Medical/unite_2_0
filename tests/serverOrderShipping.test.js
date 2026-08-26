import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLabelRequest, applyLabelEvidence } from '../api/_lib/orderShipping.js';

const order = {
  id: 'UM-SHIP-1', status: 'inventory_reserved', payment_status: 'paid',
  ship_to_address_id: 'addr_1', ship_method: 'fedex_ground', customer_name: 'Buyer ASC',
};
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
