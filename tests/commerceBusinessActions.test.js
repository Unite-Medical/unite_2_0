import test from 'node:test';
import assert from 'node:assert/strict';
import { planAssistantBusinessAction, applyAssistantBusinessAction, readAssistantOperations } from '../api/_lib/commerceBusinessActions.js';
import { planMobileCount, inventorySnapshot } from '../api/_lib/warehouseMobile.js';
const actor = { user_id: 'test-admin', role: 'admin', email: 'other@example.com' };
const id = '12345678-1234-1234-1234-123456789abc';
function database(tables) {
  let transactions = 0; const commands = [];
  const sql = async (strings, ...values) => {
    const query = strings.join('?');
    if (!query.startsWith('SELECT data FROM um_rows')) throw new Error('Unexpected write during preview');
    let rows = tables[values[0]] || [];
    if (query.includes('AND id=')) rows = rows.filter(r => r.id === values[1]);
    return rows.map(data => ({ data: structuredClone(data) }));
  };
  sql.transaction = async callback => { transactions++; return Promise.all(callback((strings, ...values) => { commands.push({ query: strings.join('?'), values }); return Promise.resolve([]); })); };
  return { sql, tables, commands, get transactions() { return transactions; } };
}
const sales = () => database({ commerce_customers: [{ id: 'c', name: 'Customer', status: 'active', price_lists: ['p'] }], commerce_products: [{ id: 'sku', sku: 'TEST', name: 'Product', status: 'active', retail: 100, cost: 50, variant_id: 'v' }], commerce_price_lists: [{ id: 'p', customer_id: 'c', status: 'active', rows: [{ id: 'price', variant_id: 'v', sku: 'TEST', unit_price: 75, minimum_quantity: 1, status: 'active' }] }] });
test('sales draft uses established pricing, creates no accounting job, and does not write during preview', async () => {
  const db = sales(), plan = await planAssistantBusinessAction(db.sql, 'sales_draft', { customer_id: 'c', lines: [{ product_id: 'sku', quantity: 2 }] }, actor, { id });
  assert.equal(plan.writes.length, 1); assert.equal(plan.writes[0].table, 'commerce_orders'); assert.equal(plan.writes[0].data.draft, true); assert.equal(plan.writes[0].data.total, 150); assert.equal(db.transactions, 0); assert.match(plan.link, /\?draft=/);
});
test('business drafts enforce permissions, active products and existing price-change authority', async () => {
  const db = sales(), input = { customer_id: 'c', lines: [{ product_id: 'sku', quantity: 2 }] };
  await assert.rejects(planAssistantBusinessAction(db.sql, 'sales_draft', input, { ...actor, role: 'sales' }, { id }), /Administrator/);
  await assert.rejects(planAssistantBusinessAction(db.sql, 'sales_draft', { ...input, lines: [{ product_id: 'sku', quantity: 2, manual_price: true, unit_price: 10 }] }, actor, { id }), /approval/);
  db.tables.commerce_products[0].status = 'archived';
  await assert.rejects(planAssistantBusinessAction(db.sql, 'sales_draft', input, actor, { id }), /active catalog/);
});
test('replenishment only drafts from approved vendors and valid reorder/cost rules', async () => {
  const db = database({ products: [{ id: 'p', sku: 'SKU', name: 'Product', vendor: 'Vendor', cost: 25 }], inventory: [{ id: 'i', sku: 'SKU', on_hand: 1, reserved: 0, reorder_at: 4, reorder_qty: 10 }], vendors: [{ id: 'v', name: 'Vendor', status: 'approved' }] });
  const plan = await planAssistantBusinessAction(db.sql, 'replenishment_purchase_orders', {}, actor, { id });
  assert.equal(plan.writes[0].data.status, 'draft'); assert.equal(plan.writes[0].data.total_cost, 250); assert.equal(db.transactions, 0);
  db.tables.vendors[0].status = 'pending';
  await assert.rejects(planAssistantBusinessAction(db.sql, 'replenishment_purchase_orders', {}, actor, { id }), /No approved/);
});
test('inventory action requires a real recorded count, preserves ledger and marks related cases for recount', async () => {
  const product = { id: 'p', sku: 'TEST', units_per_case: 12, pack_verified: true, lot_tracking: 'required', expiration_tracking: 'required' };
  const inventory = { id: 'inv', sku: 'TEST', warehouse_id: 'wh', on_hand: 30, reserved: 0 };
  const lot = { id: 'lot', product_sku: 'TEST', warehouse_id: 'wh', bin_id: 'bin', lot_number: 'BATCH', expiration_date: '2028-06-30', qty_remaining: 30 };
  const count = planMobileCount({ body: { idempotency_key: 'count-test', lot_id: 'lot', lot_number: 'BATCH', expiration_date: '2028-06-30', cases: 2, eaches: 3, units_per_case: 12, confirmed: true, reason: 'Physical count', snapshot: inventorySnapshot(inventory, [lot]) }, session: actor, product, inventory, lots: [lot], bin: { id: 'bin', warehouse_id: 'wh' } }).record;
  assert.ok(count);
  const db = database({ products: [product], inventory: [inventory], lots: [lot], warehouse_counts: [count], warehouse_containers: [{ id: 'box', lot_id: 'lot', units_remaining: 12 }] });
  const plan = await planAssistantBusinessAction(db.sql, 'post_inventory_count', { count_id: count.id }, actor, { id });
  assert.equal(plan.writes.find(w => w.table === 'inventory').data.on_hand, 27); assert.equal(plan.writes.find(w => w.table === 'stock_movements').data.qty_delta, -3); assert.equal(plan.writes.find(w => w.table === 'warehouse_containers').data.needs_recount, true); assert.equal(db.transactions, 0);
  inventory.reserved = 1;
  await assert.rejects(planAssistantBusinessAction(db.sql, 'post_inventory_count', { count_id: count.id }, actor, { id }), /reserved/);
  await assert.rejects(planAssistantBusinessAction(db.sql, 'post_inventory_count', { count_id: 'fabricated' }, actor, { id }), /existing physically/);
});
test('apply refuses expired previews, other actors and price drift before committing', async () => {
  const db = sales(), input = { customer_id: 'c', lines: [{ product_id: 'sku', quantity: 2 }] }, created_at = new Date().toISOString();
  const plan = await planAssistantBusinessAction(db.sql, 'sales_draft', input, actor, { id, now: new Date(created_at) });
  const card = { id: 'card', type: 'business_action', status: 'pending', user_id: actor.user_id, business_action: 'sales_draft', input, draft_id: id, created_at, changes: plan.changes };
  await assert.rejects(applyAssistantBusinessAction(db.sql, { ...card, created_at: '2000-01-01' }, actor), /expired/);
  await assert.rejects(applyAssistantBusinessAction(db.sql, card, { ...actor, user_id: 'someone-else' }), /unavailable/);
  db.tables.commerce_price_lists[0].rows[0].unit_price = 80;
  await assert.rejects(applyAssistantBusinessAction(db.sql, card, actor), /changed/);
  assert.equal(db.transactions, 0);
});
test('applying an unchanged preview commits the draft, receipt and audit together', async () => {
  const db = sales(), input = { customer_id: 'c', lines: [{ product_id: 'sku', quantity: 2 }] }, created_at = new Date().toISOString();
  const plan = await planAssistantBusinessAction(db.sql, 'sales_draft', input, actor, { id, now: new Date(created_at) });
  const card = { id: 'card', type: 'business_action', status: 'pending', user_id: actor.user_id, business_action: 'sales_draft', input, draft_id: id, created_at, changes: plan.changes };
  const result = await applyAssistantBusinessAction(db.sql, card, actor);
  assert.equal(result.status, 'applied'); assert.equal(db.transactions, 1);
  for (const table of ['commerce_orders', 'commerce_agent_cards', 'audit_log']) assert.ok(db.commands.some(c => c.values.includes(table)));
  await applyAssistantBusinessAction(db.sql, result, actor); assert.equal(db.transactions, 1);
});
test('operational reader never accepts credential or identity tables', async () => {
  for (const collection of ['service_credentials', 'profiles', 'auth_login_limits']) await assert.rejects(readAssistantOperations(database({}).sql, { collection }), /Choose/);
});
