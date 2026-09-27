import crypto from 'node:crypto';
import { readCommerce } from './commerceWorkspace.js';
import { normalizeAdminDraft } from './adminOrderDraft.js';
import { planReplenishmentPurchaseOrders } from '../vendor/purchase-orders/draft.js';
import { countPostingWrites } from './warehouseMobile.js';
import { atomicTransition, storedRow } from './atomicTransition.js';

export const OPERATION_COLLECTIONS = ['products', 'vendors', 'purchase_orders', 'inventory', 'lots', 'warehouse_counts'];
export async function readAssistantOperations(sql, { collection, id = '', page = 0 }) {
  if (!OPERATION_COLLECTIONS.includes(collection)) throw new Error('Choose an operational record collection.');
  if (id) return storedRow(sql, collection, id);
  const offset = Math.max(0, Math.min(1000, Math.floor(Number(page) || 0))) * 100;
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${collection} AND deleted=false ORDER BY id LIMIT 101 OFFSET ${offset}`;
  return { collection, rows: rows.slice(0, 100).map(r => r.data), has_more: rows.length > 100, page: offset / 100 };
}
async function allRows(sql, table) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false ORDER BY id LIMIT 5001`;
  if (rows.length > 5000) throw new Error('This operation requires a smaller reviewed dataset.');
  return rows.map(r => r.data);
}
const change = (kind, row, diff) => ({ kind, id: row.id, name: row.number || row.vendor_name || row.sku || row.id, diff });
export async function planAssistantBusinessAction(sql, action, input, actor, { id, now = new Date() } = {}) {
  if (actor?.role !== 'admin') throw new Error('Administrator access is required.');
  const writes = [], checks = [], changes = [];
  let explanation, link;
  if (action === 'sales_draft') {
    const customer = await readCommerce(sql, { kind: 'customers', id: String(input.customer_id || '') });
    if (!customer) throw new Error('Choose an existing customer first.');
    const products = await Promise.all([...new Set((input.lines || []).map(l => l.product_id))].map(id => readCommerce(sql, { kind: 'products', id })));
    const schedules = await Promise.all((customer.price_lists || []).map(id => readCommerce(sql, { kind: 'pricing', id })));
    const draft = normalizeAdminDraft({ input: { ...input, id }, customer, products: products.filter(Boolean), schedules: schedules.filter(Boolean), actor, now });
    if (!draft.lines.length) throw new Error('Add at least one verified product to the draft.');
    writes.push({ table: 'commerce_orders', before: null, data: draft });
    checks.push({ table: 'commerce_customers', id: customer.id, before: customer }, ...products.filter(Boolean).map(p => ({ table: 'commerce_products', id: p.id, before: p })), ...schedules.filter(Boolean).map(p => ({ table: 'commerce_price_lists', id: p.id, before: p })));
    changes.push(change('sales_draft', draft, [{ field: 'customer', before: null, after: draft.customer_name }, { field: 'items', before: null, after: draft.lines.map(l => ({ sku: l.sku, quantity: l.quantity, unit_price: l.unit_price, total: l.ext_price })) }, { field: 'total', before: null, after: draft.total }, { field: 'payment_terms', before: null, after: draft.payment_terms }, { field: 'shipping_address', before: null, after: draft.shipping_address }, { field: 'billing_address', before: null, after: draft.billing_address }, { field: 'shipping_and_tax', before: null, after: { shipping: draft.shipping, tax: draft.tax, shipping_confirmed: draft.shipping_confirmed, tax_confirmed: draft.tax_confirmed } }, { field: 'notes_and_references', before: null, after: { notes: draft.notes, tags: draft.tags, po_number: draft.po_number } }]));
    explanation = 'Creates a Unite sales draft for invoice preparation. Review shipping, tax and QuickBooks matches in the order editor before submitting. No QuickBooks invoice, charge, email or shipment is created by this action.';
    link = '/admin/orders/new?draft=' + draft.id;
  } else if (action === 'replenishment_purchase_orders') {
    const [products, inventory, vendors] = await Promise.all(['products', 'inventory', 'vendors'].map(t => allRows(sql, t)));
    const plan = planReplenishmentPurchaseOrders({ products, inventory, vendors, actorId: actor.user_id, idempotencyKey: id, now });
    if (!plan.ok) throw new Error('No approved replenishment purchase orders can be drafted from current stock, reorder rules, costs and vendors.');
    if (plan.purchase_orders.length > 25) throw new Error('Review a smaller replenishment batch in Purchase orders.');
    for (const po of plan.purchase_orders) {
      writes.push({ table: 'purchase_orders', before: null, data: po });
      changes.push(change('purchase_orders', po, [{ field: 'vendor', before: null, after: po.vendor_name }, { field: 'items', before: null, after: po.line_items }, { field: 'total_cost', before: null, after: po.total_cost }]));
    }
    const skus = new Set(plan.purchase_orders.flatMap(po => po.line_items.map(l => l.sku)));
    checks.push(...products.filter(p => skus.has(p.sku)).map(p => ({ table: 'products', id: p.id, before: p })), ...inventory.filter(i => skus.has(i.sku)).map(i => ({ table: 'inventory', id: i.id, before: i })), ...vendors.filter(v => plan.purchase_orders.some(po => po.vendor_id === v.id)).map(v => ({ table: 'vendors', id: v.id, before: v })));
    explanation = 'Creates draft purchase orders using current reorder settings and approved vendors. Sending to suppliers and posting to QuickBooks remain separate reviewed steps.';
    link = '/admin/purchase-orders';
  } else if (action === 'post_inventory_count') {
    const record = await storedRow(sql, 'warehouse_counts', input.count_id);
    if (!record) throw new Error('Choose an existing physically confirmed warehouse count.');
    const inventory = await storedRow(sql, 'inventory', record.inventory_id);
    const [lots, products, boxes] = await Promise.all(['lots', 'products', 'warehouse_containers'].map(t => allRows(sql, t)));
    const product = products.find(p => p.sku === record.sku);
    if (!inventory || !product) throw new Error('The inventory and catalog record must exist.');
    const plan = countPostingWrites(record, inventory, lots, actor, product);
    if (!plan.ok) throw new Error('Inventory count cannot be posted: ' + plan.reason);
    writes.push(...plan.writes, ...boxes.filter(b => b.lot_id === record.lot_id).map(b => ({ table: 'warehouse_containers', before: b, data: { ...b, needs_recount: true } })));
    checks.push(...plan.checks);
    changes.push(change('inventory', inventory, [{ field: 'on_hand', before: inventory.on_hand, after: Number(inventory.on_hand) + record.variance }, { field: 'count_reference', before: null, after: { id: record.id, counted_by: record.counted_by, counted_at: record.counted_at, reason: record.reason, bin_id: record.bin_id, lot_number: record.lot_number } }]));
    explanation = 'Posts an existing physical count to Unite inventory, lot balances and the stock movement ledger. Related case counts are marked for recount. This does not change Shopify inventory.';
    link = '/warehouse';
  } else throw new Error('This business action is not supported.');
  return { action, input, writes, checks, changes, explanation, link };
}

export async function applyAssistantBusinessAction(sql, card, actor) {
  if (actor?.role !== 'admin' || card.user_id !== actor.user_id) throw new Error('This action is unavailable to this user.');
  if (card.status !== 'pending') return card;
  if (Date.now() - Date.parse(card.created_at) > 15 * 60 * 1000) throw new Error('This preview expired. Ask Unite to prepare it again.');
  const plan = await planAssistantBusinessAction(sql, card.business_action, card.input, actor, { id: card.draft_id, now: new Date(card.created_at) });
  if (JSON.stringify(plan.changes) !== JSON.stringify(card.changes)) throw new Error('The source records changed. Ask Unite for a fresh preview.');
  const next = { ...card, status: 'applied', applied_at: new Date().toISOString(), results: plan.changes.map(c => ({ id: c.id, kind: c.kind, name: c.name, ok: true })), link: plan.link };
  const audit = { id: crypto.randomUUID(), kind: 'assistant.business_action_applied', actor_id: actor.user_id, ref_id: card.id, action: card.business_action, created_at: next.applied_at, changes: plan.changes };
  const result = await atomicTransition(sql, { checks: plan.checks, writes: [...plan.writes, { table: 'commerce_agent_cards', before: card, data: next }, { table: 'audit_log', before: null, data: audit }] });
  if (!result.ok) throw new Error('The source records changed or this action was already applied. Refresh before trying again.');
  return next;
}
