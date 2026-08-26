import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  planPaidOrderRelease,
  planOrderHandoff,
  orderPaymentFromStripeEvent,
  planOrderPaymentApplication,
  buildHandoffNotification,
} from '../api/_lib/orderLifecycle.js';

const order = {
  id: 'UM-SERVER-ORDER-1', customer_id: 'org_customer', status: 'payment_pending',
  payment_status: 'pending', fulfillment_revision: 0,
};
const items = [{ id: 'line_1', order_id: order.id, sku: 'SKU-A', qty: 2, unit_price: 10 }];
const inventory = [{ id: 'inv_a', sku: 'SKU-A', warehouse_id: 'wh_atl', on_hand: 5, reserved: 1 }];
const lots = [{ id: 'lot_a', product_sku: 'SKU-A', warehouse_id: 'wh_atl', lot_number: 'LOT-A', expiration_date: '2027-01-31', qty_remaining: 5 }];

test('server fulfillment cannot reserve an unpaid order', () => {
  const result = planPaidOrderRelease({ order, items, inventory });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'payment_not_released');
  assert.equal(result.reservations, undefined);
});

test('ordinary customer release never consumes a distributor-owned inventory pool', () => {
  const result = planPaidOrderRelease({
    order: { ...order, payment_status: 'paid' },
    items,
    inventory: [{ id: 'inv_owner_only', sku: 'SKU-A', warehouse_id: 'wh_atl', owner_type: 'distributor', owner_org_id: 'org_dist', on_hand: 100, reserved: 0 }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'allocation_shortfall');
});

test('paid order release creates stable holds without decrementing on-hand', () => {
  const result = planPaidOrderRelease({
    order: { ...order, payment_status: 'paid', paid_at: '2026-07-18T12:00:00.000Z' },
    items,
    inventory,
    now: new Date('2026-07-18T12:01:00.000Z'),
  });
  assert.equal(result.ok, true);
  assert.equal(result.order.status, 'inventory_reserved');
  assert.equal(result.order.fulfillment_revision, 1);
  assert.deepEqual(result.reservations.map((row) => [row.sku, row.qty, row.status]), [['SKU-A', 2, 'held']]);
  assert.equal(result.inventory[0].on_hand, 5);
  assert.equal(result.inventory[0].reserved, 3);
});

test('documented handoff commits held stock once and rejects label-only shipping', () => {
  const released = planPaidOrderRelease({
    order: { ...order, payment_status: 'paid' }, items, inventory,
    now: new Date('2026-07-18T12:01:00.000Z'),
  });
  const noLabel = planOrderHandoff({
    order: released.order,
    shipment: { id: 'shipment_1', order_id: order.id, status: 'pending_label' },
    reservations: released.reservations,
    inventory: released.inventory,
    lots,
    actorId: 'warehouse_user', handoffReference: 'SCAN-1',
  });
  assert.equal(noLabel.reason, 'shipment_not_ready');

  const handed = planOrderHandoff({
    order: { ...released.order, status: 'ready_to_ship' },
    shipment: { id: 'shipment_1', order_id: order.id, status: 'label_created', tracking_number: '1Z123' },
    reservations: released.reservations,
    inventory: released.inventory,
    lots,
    actorId: 'warehouse_user', handoffReference: 'SCAN-1',
    now: new Date('2026-07-18T13:00:00.000Z'),
  });
  assert.equal(handed.ok, true);
  assert.equal(handed.order.status, 'shipped');
  assert.equal(handed.shipment.status, 'shipped');
  assert.equal(handed.reservations[0].status, 'committed');
  assert.equal(handed.inventory[0].on_hand, 3);
  assert.equal(handed.inventory[0].reserved, 1);
  assert.equal(handed.movements[0].qty_delta, -2);
  assert.equal(handed.movements[0].lot_id, 'lot_a');
  assert.equal(handed.movements[0].actor_id, 'warehouse_user');
  assert.equal(handed.lots[0].qty_remaining, 3);
  assert.deepEqual(handed.genealogy.map((row) => [row.lot_number, row.customer_id, row.qty]), [['LOT-A', 'org_customer', 2]]);

  const replay = planOrderHandoff({
    order: handed.order, shipment: handed.shipment,
    reservations: handed.reservations, inventory: handed.inventory,
    lots: handed.lots,
    actorId: 'warehouse_user', handoffReference: 'SCAN-1',
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.inventory[0].on_hand, 3);
});

test('a Unite reservation cannot hand off from a distributor-owned lot', () => {
  const released = planPaidOrderRelease({
    order: { ...order, payment_status: 'paid' }, items, inventory,
  });
  assert.throws(() => planOrderHandoff({
    order: { ...released.order, status: 'ready_to_ship' },
    shipment: { id: 'shipment_owner_guard', order_id: order.id, status: 'label_created' },
    reservations: released.reservations,
    inventory: released.inventory,
    lots: [{
      id: 'lot_distributor', product_sku: 'SKU-A', warehouse_id: 'wh_atl',
      owner_type: 'distributor', owner_org_id: 'org_dist', lot_number: 'DIST-LOT',
      expiration_date: '2027-01-31', qty_remaining: 50,
    }],
    actorId: 'warehouse_user', handoffReference: 'SCAN-OWNER-GUARD',
  }), /lot_allocation_shortfall/);
});

test('verified Stripe paid events resolve the authoritative order reference and amount', () => {
  const invoice = orderPaymentFromStripeEvent({
    id: 'evt_1', type: 'invoice.paid',
    data: { object: { id: 'in_1', amount_paid: 4200, currency: 'usd', metadata: { order_id: order.id }, payment_intent: 'pi_1' } },
  });
  assert.deepEqual(invoice, {
    ok: true, event_id: 'evt_1', order_id: order.id, provider_object_id: 'in_1',
    payment_intent_id: 'pi_1', canonical_payment_id: 'stripe:payment_intent:pi_1',
    amount: 42, currency: 'usd', kind: 'invoice.paid',
  });
  assert.equal(orderPaymentFromStripeEvent({ id: 'evt_2', type: 'invoice.payment_failed', data: { object: {} } }).reason, 'event_not_paid');
});

test('payment application releases only a fully paid order and preserves provider evidence', () => {
  const payment = {
    ok: true, event_id: 'evt_paid', order_id: order.id, provider_object_id: 'in_paid',
    payment_intent_id: 'pi_paid', canonical_payment_id: 'stripe:payment_intent:pi_paid',
    amount: 42, currency: 'usd', kind: 'invoice.paid',
  };
  const applied = planOrderPaymentApplication({ order: { ...order, total: 42 }, payment, now: new Date('2026-07-18T12:00:00.000Z') });
  assert.equal(applied.ok, true);
  assert.equal(applied.order.payment_status, 'paid');
  assert.equal(applied.order.status, 'payment_released');
  assert.equal(applied.payment.provider_event_id, 'evt_paid');
  assert.equal(applied.payment.provider_object_id, 'in_paid');

  const partial = planOrderPaymentApplication({ order: { ...order, total: 50 }, payment });
  assert.equal(partial.order.payment_status, 'partial');
  assert.equal(partial.order.status, 'payment_pending');
});

test('invoice and payment-intent events share one canonical payment and cannot overpay the order', () => {
  const invoice = orderPaymentFromStripeEvent({
    id: 'evt_invoice', type: 'invoice.paid',
    data: { object: { id: 'in_shared', amount_paid: 10000, currency: 'usd', payment_intent: 'pi_shared', metadata: { order_id: order.id } } },
  });
  const intent = orderPaymentFromStripeEvent({
    id: 'evt_intent', type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_shared', amount_received: 10000, currency: 'usd', metadata: { order_id: order.id } } },
  });
  assert.equal(invoice.canonical_payment_id, intent.canonical_payment_id);
  const first = planOrderPaymentApplication({ order: { ...order, total: 100 }, payment: invoice });
  assert.equal(first.ok, true);
  assert.equal(first.order.paid_amount, 100);
  const duplicateAmount = planOrderPaymentApplication({ order: first.order, payment: intent });
  assert.equal(duplicateAmount.ok, false);
  assert.equal(duplicateAmount.reason, 'payment_exceeds_balance');
});

test('handoff notification respects customer and blind-shipment recipient boundaries', () => {
  const shipment = { id: 'ship_1', handoff_reference: 'BOL-1', tracking_number: 'TRACK-1', carrier: 'FedEx Freight' };
  const organizations = [
    { id: 'org_customer', contact_email: 'buyer@customer.test' },
    { id: 'org_distributor', contact_email: 'tracking@distributor.test' },
    { id: 'org_end_customer', contact_email: 'end-customer@example.test' },
  ];
  const notificationRecipients = [
    { org_id: 'org_customer', email: 'ap@customer.test', events: ['invoice', 'shipped'] },
    { org_id: 'org_distributor', email: 'ops@distributor.test', events: ['shipped'] },
    { org_id: 'org_end_customer', email: 'other@end-customer.test', events: ['shipped'] },
  ];
  const customer = buildHandoffNotification({ order: { id: 'order_customer', customer_id: 'org_customer' }, shipment, organizations, notificationRecipients });
  assert.equal(customer.to, 'buyer@customer.test');
  assert.equal(customer.outbox.status, 'queued');
  assert.deepEqual(customer.deliveries.map((row) => row.to), ['buyer@customer.test', 'ap@customer.test']);

  const blind = buildHandoffNotification({
    order: { id: 'order_blind', customer_id: 'org_end_customer', blind_ship: true, on_behalf_of_org_id: 'org_distributor' },
    shipment, organizations, notificationRecipients,
  });
  assert.equal(blind.to, 'tracking@distributor.test');
  assert.deepEqual(blind.deliveries.map((row) => row.to), ['tracking@distributor.test', 'ops@distributor.test']);
  assert.doesNotMatch(JSON.stringify(blind), /end-customer@example\.test/);
  assert.doesNotMatch(JSON.stringify(blind), /other@end-customer\.test/);
});
