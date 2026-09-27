/** Chargeable shipment batches and linked backorder suborders. */

import { db } from './db.js';
import { uid } from './format.js';

function money(value) {
  return +Number(value || 0).toFixed(2);
}

export function planFulfillableBatch({ order = {}, items = [], availableBySku = {}, availableForItem = null }) {
  const remaining = new Map();
  const keyFor = (item) => `${item.inventory_owner_type || 'unite'}:${item.inventory_owner_org_id || 'unite'}:${item.sku}`;
  const available = (item) => {
    const key = keyFor(item);
    if (!remaining.has(key)) {
      const value = typeof availableForItem === 'function'
        ? availableForItem(item)
        : typeof availableBySku === 'function' ? availableBySku(item.sku) : availableBySku[item.sku];
      remaining.set(key, Math.max(0, Number(value) || 0));
    }
    return remaining.get(key);
  };
  const shipLines = [];
  const backorderLines = [];

  for (const item of items) {
    const requested = Math.max(0, Number(item.qty) || 0);
    const key = keyFor(item);
    const shipQty = Math.min(requested, available(item));
    remaining.set(key, available(item) - shipQty);
    if (shipQty > 0) shipLines.push({ ...item, qty: shipQty });
    const short = requested - shipQty;
    if (short > 0) backorderLines.push({ ...item, qty: short });
  }

  const merchandiseTotal = money(shipLines.reduce((sum, line) => sum + line.qty * Number(line.unit_price || 0), 0));
  const backorderValue = money(backorderLines.reduce((sum, line) => sum + line.qty * Number(line.unit_price || 0), 0));
  const shippingTotal = shipLines.length ? money(order.shipping_cost || 0) : 0;
  return {
    order_id: order.id,
    ship_lines: shipLines,
    backorder_lines: backorderLines,
    merchandise_total: merchandiseTotal,
    shipping_total: shippingTotal,
    charge_total: money(merchandiseTotal + shippingTotal),
    backorder_value: backorderValue,
  };
}

export function nextSuborderId(parentOrderId, existingOrders = db.list('orders')) {
  let maxSequence = 1;
  for (const order of existingOrders) {
    if (order.parent_order_id !== parentOrderId && !String(order.id || '').startsWith(`${parentOrderId}-`)) continue;
    const suffix = Number(String(order.id).slice(parentOrderId.length + 1));
    if (Number.isInteger(suffix) && suffix > maxSequence) maxSequence = suffix;
  }
  return `${parentOrderId}-${maxSequence + 1}`;
}

export function createBackorderSuborder({
  parent_order_id,
  backorder_ids = [],
  lines = [],
  shipping_cost = 0,
  created_by = 'backorder-release',
}) {
  const parent = db.get('orders', parent_order_id);
  if (!parent) throw new Error(`Parent order ${parent_order_id} not found`);
  if (!lines.length) throw new Error('Suborder requires at least one line');
  const id = nextSuborderId(parent_order_id);
  const merchandiseTotal = money(lines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.unit_price || 0), 0));
  const freight = money(shipping_cost);
  const order = db.insert('orders', {
    id,
    parent_order_id,
    suborder_sequence: Number(id.slice(parent_order_id.length + 1)),
    customer_id: parent.customer_id,
    customer_name: parent.customer_name,
    contact_email: parent.contact_email,
    shipping_address: parent.shipping_address || null,
    billing_address: parent.billing_address || null,
    payment_method: parent.payment_method,
    payment_terms: parent.payment_terms,
    po_number: parent.po_number,
    order_source: 'backorder_release',
    created_by,
    status: 'payment_pending',
    payment_status: 'pending',
    merchandise_total: merchandiseTotal,
    shipping_cost: freight,
    total: money(merchandiseTotal + freight),
    backorder_ids,
  });
  for (const line of lines) {
    db.insert('order_items', {
      id: uid('oi'),
      order_id: id,
      parent_order_id,
      backorder_id: line.backorder_id || null,
      sku: line.sku,
      name: line.name || line.sku,
      qty: Number(line.qty) || 0,
      unit_price: Number(line.unit_price) || 0,
      ext_price: money(Number(line.qty || 0) * Number(line.unit_price || 0)),
      inventory_owner_type: line.inventory_owner_type || null,
      inventory_owner_org_id: line.inventory_owner_org_id || null,
      distributor_sku: line.distributor_sku || null,
    });
  }
  for (const backorderId of backorder_ids) {
    const backorder = db.get('backorders', backorderId);
    if (backorder) db.update('backorders', backorderId, { status: 'suborder_created', suborder_id: id });
  }
  db.insert('audit_log', {
    id: uid('aud'), kind: 'backorder.suborder_created', ref_id: id,
    payload: { parent_order_id, backorder_ids, merchandise_total: merchandiseTotal, shipping_cost: freight },
  });
  return order;
}
