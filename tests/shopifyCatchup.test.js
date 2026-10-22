import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShopifyId, planShopifyCatchup, planShopifyCatchupRollback, shopifyCatchupHash } from '../api/_lib/shopifyCatchup.js';

const at = '2026-10-22T12:00:00Z';
function source(id = '1001', patch = {}) {
  return { id, name: '#501', customer: { id: '2001', first_name: 'Example' }, created_at: '2026-10-01T12:00:00Z', updated_at: at,
    financial_status: 'paid', fulfillment_status: null, cancelled_at: null, closed_at: null, currency: 'USD',
    current_total_price: '45.00', current_subtotal_price: '40.00', current_total_tax: '0.00', total_outstanding: '0.00',
    total_discounts: '10.00', total_shipping_price_set: { shop_money: { amount: '5.00', currency_code: 'USD' } },
    line_items: [{ id: '3001', variant_id: '4001', product_id: '5001', sku: 'HISTORIC-SKU', name: 'Synthetic item',
      price: '25.00', quantity: 2, current_quantity: 2, fulfillable_quantity: 2, total_discount: '10.00', discount_allocations: [{ amount: '10.00' }], fulfillment_status: null }],
    fulfillments: [], refunds: [], ...patch };
}
function options(patch = {}) {
  return { allowedIds: ['1001'], sourceOrders: [source()], existingOrders: [],
    customers: [{ id: '2001', name: 'Existing example' }],
    products: [{ id: '4001', variant_id: 'gid://shopify/ProductVariant/4001', product_id: 'gid://shopify/Product/5001', sku: 'CURRENT-SKU', retail: 999 }],
    runId: 'synthetic-run', retrievedAt: at, actor: { user_id: 'synthetic-actor' }, baselinePlanHash: 'a'.repeat(64),
    scope: { kind: 'test', expectedCount: 1 }, ...patch };
}
function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }

test('production requires exactly 48 explicit distinct stable IDs and complete matching source', () => {
  const small = options(); delete small.scope;
  assert.throws(() => planShopifyCatchup(small), /scope_count/);
  assert.throws(() => planShopifyCatchup(options({ allowedIds: ['1001', 'gid://shopify/Order/1001'] })), /duplicate/);
  assert.throws(() => planShopifyCatchup(options({ sourceOrders: [] })), /source_ids/);
  assert.throws(() => planShopifyCatchup(options({ sourceOrders: [source(), source('1002')] })), /source_ids/);
  assert.throws(() => planShopifyCatchup(options({ sourceOrders: [source(), source()] })), /duplicate/);
  assert.throws(() => planShopifyCatchup(options({ scope: { kind: 'production', expectedCount: 1 } })), /invalid_catchup_scope/);
  const allowedIds = Array.from({ length: 48 }, (_, i) => String(1001 + i));
  const plan = planShopifyCatchup(options({ scope: undefined, allowedIds, sourceOrders: allowedIds.map((id, i) => source(id, { name: '#' + (501 + i) })) }));
  assert.equal(plan.counts.insert, 48);
});

test('stable resource IDs reject unsafe numbers, wrong resource and decorated names', () => {
  assert.equal(normalizeShopifyId('gid://shopify/Order/123'), '123');
  for (const value of ['#501', '001', '0', 'gid://shopify/Customer/123', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => normalizeShopifyId(value));
});

test('historical insert preserves source, current totals, exact identities, quantities and price evidence without side effects', () => {
  const input = freeze(options()), before = JSON.stringify(input), plan = planShopifyCatchup(input), row = plan.inserts[0];
  assert.equal(JSON.stringify(input), before);
  assert.equal(plan.ok, true); assert.equal(row.table, 'commerce_orders'); assert.equal(row.id, '1001');
  const order = row.data, line = order.lines[0];
  assert.equal(order.historical, true); assert.equal(order.draft, false); assert.equal(order.workflow_state, 'needs_review');
  assert.equal(order.total, 45); assert.equal(order.subtotal, 40); assert.equal(order.total_outstanding, 0);
  assert.equal(order.financial_status, 'paid'); assert.equal(order.source_fulfillment_status, null);
  assert.equal(line.id, '3001'); assert.equal(line.sku, 'HISTORIC-SKU'); assert.equal(line.catalog_sku, 'CURRENT-SKU');
  assert.equal(line.variant_id, 'gid://shopify/ProductVariant/4001'); assert.equal(line.source_product_id, '5001');
  assert.equal(line.original_quantity, 2); assert.equal(line.current_quantity, 2); assert.equal(line.unfulfilled_quantity, 2);
  assert.equal(line.retail, 25); assert.equal(line.unit_price, 20); assert.equal(line.original_net_line_total, 40);
  assert.deepEqual(order.source, input.sourceOrders[0]); assert.notEqual(order.source, input.sourceOrders[0]);
  assert.equal(order.catchup_import.source_payload_sha256, shopifyCatchupHash(input.sourceOrders[0]));
  assert.equal(order.catchup_import.source_retrieved_at, at); assert.equal(order.catchup_import.baseline_plan_sha256, 'a'.repeat(64));
  for (const key of ['paid_amount', 'balance', 'qbo_balance', 'operational_order_id', 'accounting_status', 'inventory_movements', 'jobs']) assert.equal(Object.hasOwn(order, key), false);
  assert.equal(order.refund_liability, null);
});

test('newer fulfillment and all tracking evidence survive and only fulfilled orders complete', () => {
  const f = { id: '6001', created_at: at, updated_at: at, status: 'success', tracking_company: 'Synthetic Carrier',
    tracking_number: 'A', tracking_numbers: ['A', 'B'], tracking_urls: ['https://example.test/A', 'https://example.test/B', 'https://example.test/C'], receipt: { evidence: true }, line_items: [{ id: '3001' }] };
  const order = planShopifyCatchup(options({ sourceOrders: [source('1001', { fulfillment_status: 'fulfilled', fulfillments: [f] })] })).inserts[0].data;
  assert.equal(order.workflow_state, 'complete'); assert.equal(order.fulfillments[0].trackingInfo.length, 3);
  assert.deepEqual(order.fulfillments[0].tracking_numbers, f.tracking_numbers);
  assert.deepEqual(order.fulfillments[0].receipt, f.receipt); assert.equal(order.fulfillments[0].updatedAt, at);
  assert.equal(order.fulfillments[0].trackingInfo[2].url, 'https://example.test/C');
  for (const status of [null, 'partial', 'unfulfilled']) assert.equal(planShopifyCatchup(options({ sourceOrders: [source('1001', { fulfillment_status: status })] })).inserts[0].data.workflow_state, 'needs_review');
});

test('canceled/restocked orders and removed lines remain historical without implied payment/refund amounts', () => {
  const original = source(); original.line_items[0].current_quantity = 0; original.line_items[0].fulfillable_quantity = 0;
  original.fulfillment_status = 'restocked'; original.cancelled_at = at; original.cancel_reason = 'customer'; original.refunds = [{ id: '7001', restock: true }];
  const order = planShopifyCatchup(options({ sourceOrders: [original] })).inserts[0].data;
  assert.equal(order.workflow_state, 'archived'); assert.equal(order.fulfillment_status, 'restocked');
  assert.equal(order.cancelled_at, at); assert.deepEqual(order.refunds, original.refunds);
  assert.equal(order.lines[0].quantity, 0); assert.equal(order.lines[0].original_quantity, 2); assert.equal(order.lines[0].removed, true);
  assert.equal(order.lines[0].current_net_line_total, null); assert.match(order.review_note, /Historical canceled/);
});

test('missing customer requires exact scoped approval and never falls back to names or email', () => {
  const missing = options({ customers: [{ id: '9999', name: 'Example' }] });
  assert.equal(planShopifyCatchup(missing).conflicts[0].reason, 'missing_customer_mapping');
  const plan = planShopifyCatchup({ ...missing, pendingCustomerOrderIds: ['gid://shopify/Order/1001'] });
  const order = plan.inserts[0].data;
  assert.equal(order.customer_id, ''); assert.equal(order.source_customer_id, '2001'); assert.equal(order.customer_mapping_status, 'pending');
  assert.match(order.review_note, /No customer profile was created/); assert.equal(order.source.customer.first_name, 'Example');
  assert.throws(() => planShopifyCatchup({ ...missing, pendingCustomerOrderIds: ['1002'] }), /outside_scope/);
});

test('ambiguous or absent product and customer identities block, same SKU never maps another variant', () => {
  assert.equal(planShopifyCatchup(options({ products: [{ id: '999', sku: 'HISTORIC-SKU' }] })).conflicts[0].reason, 'missing_variant_mapping');
  const input = options(); input.products.push({ ...input.products[0] });
  assert.equal(planShopifyCatchup(input).conflicts[0].reason, 'ambiguous_variant_mapping');
  assert.equal(planShopifyCatchup(options({ customers: [{ id: '2001' }, { id: '2001' }] })).conflicts[0].reason, 'ambiguous_customer_mapping');
  assert.equal(planShopifyCatchup(options({ products: [{ ...options().products[0], variant_id: 'gid://shopify/ProductVariant/999' }] })).conflicts[0].reason, 'conflicting_variant_identity');
  assert.equal(planShopifyCatchup(options({ products: [{ ...options().products[0], product_id: 'gid://shopify/Product/999' }] })).conflicts[0].reason, 'conflicting_product_identity');
});

test('same unchanged import skips on retry but changed source, staff edits and other existing rows block', () => {
  const input = options(), first = planShopifyCatchup(input), stored = first.inserts[0];
  const retry = planShopifyCatchup({ ...input, runId: 'retry-run', retrievedAt: '2026-10-22T13:00:00Z', existingOrders: [stored] });
  assert.equal(retry.counts.insert, 0); assert.equal(retry.counts.skipped, 1);
  const edited = structuredClone(stored); edited.data.notes = 'Staff correction';
  assert.equal(planShopifyCatchup({ ...input, existingOrders: [edited] }).ok, false);
  const changed = source('1001', { updated_at: '2026-10-22T14:00:00Z', fulfillment_status: 'fulfilled' });
  assert.equal(planShopifyCatchup({ ...input, sourceOrders: [changed], existingOrders: [stored] }).counts.blocked, 1);
  for (const existing of [{ id: '1001', number: '#501' }, { id: 'different', number: '#501' }, { ...stored, deleted: true }]) {
    const plan = planShopifyCatchup({ ...input, existingOrders: [existing] });
    assert.equal(plan.ok, false); assert.equal(plan.inserts.length, 0);
  }
});

test('idempotence survives JSONB key order; changed catalog mapping is a conflict', () => {
  const input = options(), row = planShopifyCatchup(input).inserts[0];
  const reverse = value => Array.isArray(value) ? value.map(reverse) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, v]) => [key, reverse(v)])) : value;
  assert.equal(planShopifyCatchup({ ...input, existingOrders: [reverse(row)] }).counts.skipped, 1);
  assert.equal(planShopifyCatchup({ ...input, products: [{ ...input.products[0], sku: 'CHANGED' }], existingOrders: [row] }).counts.blocked, 1);
});

test('bad monetary, missing quantities, duplicate lines, and conflicting discount evidence block safely', () => {
  for (const patch of [{ price: '' }, { current_quantity: null }, { fulfillable_quantity: 3 }, { total_discount: '12.00' }]) {
    const original = source(); Object.assign(original.line_items[0], patch);
    assert.equal(planShopifyCatchup(options({ sourceOrders: [original] })).ok, false);
  }
  const duplicated = source(); duplicated.line_items.push({ ...duplicated.line_items[0] });
  assert.equal(planShopifyCatchup(options({ sourceOrders: [duplicated] })).conflicts[0].reason, 'duplicate_source_line_id');
  const absent = source(); delete absent.current_total_price;
  assert.equal(planShopifyCatchup(options({ sourceOrders: [absent] })).ok, false);
});

test('plan order and hashes are deterministic and audit metadata is required', () => {
  assert.deepEqual(planShopifyCatchup(options()), planShopifyCatchup(options()));
  assert.equal(shopifyCatchupHash({ a: 1, b: 2 }), shopifyCatchupHash({ b: 2, a: 1 }));
  for (const patch of [{ actor: null }, { runId: '' }, { retrievedAt: '' }, { baselinePlanHash: '' }]) assert.throws(() => planShopifyCatchup(options(patch)));
});

test('rollback only plans exact run-created unchanged rows and emits optimistic guards', () => {
  const createdRows = planShopifyCatchup(options()).inserts;
  const input = { runId: 'synthetic-run', createdRows, existingOrders: createdRows };
  const rollback = planShopifyCatchupRollback(input);
  assert.equal(rollback.ok, true); assert.equal(rollback.softDeletes.length, 1);
  assert.equal(rollback.softDeletes[0].expected_data_sha256, shopifyCatchupHash(createdRows[0].data));
  const edited = structuredClone(createdRows); edited[0].data.revision = 1;
  for (const patch of [{ runId: 'other-run' }, { existingOrders: edited }, { existingOrders: [] }, { existingOrders: [{ ...createdRows[0], deleted: true }] }]) {
    const plan = planShopifyCatchupRollback({ ...input, ...patch }); assert.equal(plan.ok, false); assert.equal(plan.softDeletes.length, 0);
  }
});
