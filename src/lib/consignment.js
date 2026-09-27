/**
 * Consignment inventory — PRD-27 §4.
 *
 * Inventory gains an OWNER. Unite-owned and distributor-owned stock of the
 * same physical product are tracked as separate pools (over `inventory_lots`)
 * and never summed together for availability. A distributor never sees Unite's
 * quantities as theirs, and vice-versa. When Unite sells a `unite_sellable`
 * distributor SKU, it draws down THAT distributor's lots and records a
 * `consignment_movements` row for settlement.
 */

import { db } from './db.js';
import { uid } from './format.js';
import { mailer } from './mailer.js';
import { purchaseOrders } from './wms/purchaseOrders.js';

function num(v) { return Number(v) || 0; }

/** Owner-scoped lots, narrowed by sku and/or distributor_sku. */
export function lotsFor({ owner_type = 'distributor', owner_org_id = null, sku = null, distributor_sku = null } = {}) {
  if (owner_type === 'distributor' && !owner_org_id) return [];
  return db.list('inventory_lots').filter((l) =>
    (!owner_type || l.owner_type === owner_type)
    && (owner_org_id == null || l.owner_org_id === owner_org_id)
    && (sku == null || l.product_sku === sku)
    && (distributor_sku == null || l.distributor_sku === distributor_sku));
}

/** Owner-scoped available-to-promise (on_hand − reserved). Always scoped. */
export function availableFor({ owner_type = 'distributor', owner_org_id = null, sku = null, distributor_sku = null } = {}) {
  return lotsFor({ owner_type, owner_org_id, sku, distributor_sku })
    .reduce((a, l) => a + num(l.qty_on_hand) - num(l.qty_reserved), 0);
}

/** FEFO-ordered lots with availability (earliest expiry first). */
function fefo(lots) {
  return lots.filter((l) => (num(l.qty_on_hand) - num(l.qty_reserved)) > 0)
    .sort((a, b) => ((a.expiration_date || '9999-12-31') < (b.expiration_date || '9999-12-31') ? -1 : 1));
}

/** Reserve an owner's lots FEFO. Returns { reserved, shortfall, lines }. */
export function reserveConsignment({ owner_org_id, sku = null, distributor_sku = null, qty }) {
  let need = qty;
  const lines = [];
  for (const lot of fefo(lotsFor({ owner_org_id, sku, distributor_sku }))) {
    if (need <= 0) break;
    const avail = num(lot.qty_on_hand) - num(lot.qty_reserved);
    const take = Math.min(avail, need);
    if (take > 0) {
      db.update('inventory_lots', lot.id, { qty_reserved: num(lot.qty_reserved) + take });
      lines.push({ lot_id: lot.id, lot_number: lot.lot_number, qty: take });
      need -= take;
    }
  }
  return { reserved: qty - need, shortfall: Math.max(0, need), lines };
}

export function reserveForOrder({ order_id, owner_org_id, sku, distributor_sku = null, qty }) {
  const requested = num(qty);
  const existing = db.list('reservations', { where: {
    order_id, status: 'held', inventory_owner_org_id: owner_org_id, product_sku: sku,
  } });
  const alreadyHeld = existing.reduce((sum, reservation) => sum + num(reservation.qty), 0);
  if (alreadyHeld >= requested) {
    return { ok: true, reserved: alreadyHeld, shortfall: 0, lines: existing, idempotent: true };
  }
  const allocation = reserveConsignment({
    owner_org_id, sku, distributor_sku, qty: requested - alreadyHeld,
  });
  if (allocation.shortfall > 0) {
    for (const line of allocation.lines) {
      const lot = db.get('inventory_lots', line.lot_id);
      if (lot) db.update('inventory_lots', lot.id, { qty_reserved: Math.max(0, num(lot.qty_reserved) - num(line.qty)) });
    }
    return { ok: false, reason: 'consignment_allocation_shortfall', reserved: alreadyHeld, shortfall: requested - alreadyHeld, lines: existing };
  }
  const lines = [...existing];
  for (const line of allocation.lines) {
    const lot = db.get('inventory_lots', line.lot_id);
    lines.push(db.insert('reservations', {
      id: uid('resv'), order_id, product_sku: sku, sku,
      warehouse_id: lot?.warehouse_id || 'wh_atl', qty: num(line.qty), status: 'held',
      inventory_owner_type: 'distributor', inventory_owner_org_id: owner_org_id,
      inventory_lot_id: line.lot_id, distributor_sku: distributor_sku || lot?.distributor_sku || null,
      created_at: new Date().toISOString(),
    }));
  }
  return { ok: true, reserved: requested, shortfall: 0, lines };
}

/** Active agreed settlement price for a distributor-owned product. */
function settlementAgreement({ owner_org_id, sku = null, distributor_sku = null, at = new Date() }) {
  const atMs = at.getTime();
  return db.list('distributor_products', { where: { owner_org_id } }).find((product) => {
    const matches = (distributor_sku && product.distributor_sku === distributor_sku)
      || (sku && product.mapped_unite_sku === sku);
    const starts = !product.settlement_effective_from || new Date(product.settlement_effective_from).getTime() <= atMs;
    const ends = !product.settlement_effective_until || new Date(product.settlement_effective_until).getTime() > atMs;
    return matches && product.unite_sellable === true && num(product.settlement_unit_cost) > 0 && starts && ends;
  }) || null;
}

/**
 * Record an owner-isolated sell-through and create a draft settlement PO.
 * Customer commerce data remains only in the internal settlement link.
 */
export function recordSellThrough({ owner_org_id, order_id, sku = null, distributor_sku = null, qty, sold_at = null, reservation_ids = [] }) {
  const soldAt = sold_at ? new Date(sold_at) : new Date();
  const agreement = settlementAgreement({ owner_org_id, sku, distributor_sku, at: soldAt });
  if (!agreement) return { ok: false, reason: 'active_settlement_price_required' };
  const requested = num(qty);
  if (requested <= 0) return { ok: false, reason: 'invalid_qty' };

  const heldReservations = reservation_ids
    .map((id) => db.get('reservations', id))
    .filter((reservation) => reservation
      && reservation.status === 'held'
      && reservation.inventory_owner_org_id === owner_org_id
      && reservation.product_sku === sku);
  const allocationPlan = [];
  if (reservation_ids.length) {
    const heldQty = heldReservations.reduce((sum, reservation) => sum + num(reservation.qty), 0);
    if (heldQty < requested) return { ok: false, reason: 'held_consignment_inventory_required' };
    let need = requested;
    for (const reservation of heldReservations) {
      if (need <= 0) break;
      const lot = db.get('inventory_lots', reservation.inventory_lot_id);
      if (!lot) return { ok: false, reason: 'reserved_consignment_lot_missing' };
      const take = Math.min(num(reservation.qty), need);
      allocationPlan.push({ lot, take, reservation });
      need -= take;
    }
  } else {
    if (availableFor({ owner_org_id, sku, distributor_sku }) < requested) {
      return { ok: false, reason: 'insufficient_distributor_inventory' };
    }
    let need = requested;
    for (const lot of fefo(lotsFor({ owner_org_id, sku, distributor_sku }))) {
      if (need <= 0) break;
      const take = Math.min(num(lot.qty_on_hand) - num(lot.qty_reserved), need);
      if (take > 0) allocationPlan.push({ lot, take, reservation: null });
      need -= take;
    }
  }

  const owner = db.get('organizations', owner_org_id);
  const settlementPo = purchaseOrders.create({
    vendor_name: owner?.name || owner_org_id,
    vendor_id: owner_org_id,
    line_items: [{
      sku: agreement.distributor_sku || agreement.mapped_unite_sku,
      name: agreement.name,
      qty: requested,
      cost: num(agreement.settlement_unit_cost),
    }],
    warehouse_id: 'wh_atl',
    created_by: 'consignment-sell-through',
  });
  const purchaseOrder = db.update('purchase_orders', settlementPo.id, {
    po_type: 'consignment_settlement',
    owner_org_id,
    settlement_currency: agreement.settlement_currency || 'USD',
    agreement_id: agreement.id,
    vendor_email: owner?.contact_email || null,
  });

  const movements = [];
  const allocations = [];
  for (const { lot, take, reservation } of allocationPlan) {
    if (take > 0) {
      const remaining = num(lot.qty_on_hand) - take;
      db.update('inventory_lots', lot.id, {
        qty_on_hand: remaining,
        qty_reserved: reservation ? Math.max(0, num(lot.qty_reserved) - take) : num(lot.qty_reserved),
      });
      allocations.push({
        inventory_lot_id: lot.id, lot_number: lot.lot_number,
        expiration_date: lot.expiration_date || null, qty: take,
      });
      movements.push(db.insert('consignment_movements', {
        id: uid('cm'), owner_org_id, inventory_lot_id: lot.id, order_id, qty: take,
        unit_cost: num(agreement.settlement_unit_cost), movement: 'sold_by_unite',
        settlement_po_id: purchaseOrder.id, settled: false, created_at: soldAt.toISOString(),
      }));
      if (reservation) {
        db.update('reservations', reservation.id, {
          status: 'committed', committed_at: soldAt.toISOString(), settlement_po_id: purchaseOrder.id,
        });
      }
    }
  }

  db.insert('consignment_settlement_links', {
    id: uid('csl'), owner_org_id, settlement_po_id: purchaseOrder.id,
    internal_order_id: order_id, movement_ids: movements.map((movement) => movement.id),
    created_at: soldAt.toISOString(),
  });
  const remainingInventory = availableFor({ owner_org_id, sku, distributor_sku });
  db.insert('distributor_notifications', {
    id: uid('dn'), owner_org_id, kind: 'stock_depletion', status: 'unread',
    payload: {
      distributor_sku: agreement.distributor_sku,
      unite_sku: agreement.mapped_unite_sku || null,
      quantity_sold: requested,
      remaining_inventory: remainingInventory,
      lot_allocations: allocations,
      settlement_po_id: purchaseOrder.id,
      warehouse_id: 'wh_atl',
      occurred_at: soldAt.toISOString(),
    },
    created_at: soldAt.toISOString(),
  });
  return { ok: true, moved: requested, shortfall: 0, movements, purchase_order: purchaseOrder };
}

/** Settlement summary for a distributor (owed vs settled). */
export function settlementFor(owner_org_id) {
  const moves = db.list('consignment_movements', { where: { owner_org_id } });
  const owed = moves.filter((m) => !m.settled).reduce((a, m) => a + num(m.unit_cost) * num(m.qty), 0);
  const settled = moves.filter((m) => m.settled).reduce((a, m) => a + num(m.unit_cost) * num(m.qty), 0);
  return { movements: moves, owed: +owed.toFixed(2), settled: +settled.toFixed(2), units: moves.reduce((a, m) => a + num(m.qty), 0) };
}

/** Distributor-safe settlement projection. Never serializes internal customer/order data. */
export function settlementForDistributor(owner_org_id) {
  const internal = settlementFor(owner_org_id);
  const movements = internal.movements.map((movement) => {
    const lot = db.get('inventory_lots', movement.inventory_lot_id);
    return {
      id: movement.id,
      settlement_po_id: movement.settlement_po_id,
      distributor_sku: lot?.distributor_sku || null,
      lot_number: lot?.lot_number || null,
      expiration_date: lot?.expiration_date || null,
      qty: num(movement.qty),
      agreed_unit_price: num(movement.unit_cost),
      amount: +(num(movement.unit_cost) * num(movement.qty)).toFixed(2),
      status: movement.settled ? 'settled' : 'open',
      occurred_at: movement.created_at,
    };
  });
  const openPurchaseOrders = db.list('purchase_orders', { where: { owner_org_id } })
    .filter((po) => po.po_type === 'consignment_settlement' && !['closed', 'cancelled'].includes(po.status))
    .map((po) => ({
      id: po.id,
      status: po.status,
      currency: po.settlement_currency || 'USD',
      total: num(po.total_cost),
      lines: (po.line_items || []).map((line) => ({
        sku: line.sku, name: line.name, qty: num(line.qty), agreed_unit_price: num(line.cost),
      })),
      created_at: po.created_at,
    }));
  return {
    owed: internal.owed,
    settled: internal.settled,
    units: internal.units,
    movements,
    open_purchase_orders: openPurchaseOrders,
  };
}

export function metricsFor(owner_org_id, { as_of = new Date(), window_days = 30 } = {}) {
  const asOf = as_of instanceof Date ? as_of : new Date(as_of);
  const fromMs = asOf.getTime() - Number(window_days) * 86400000;
  return db.list('distributor_products', { where: { owner_org_id } }).map((product) => {
    const matchedLots = lotsFor({
      owner_org_id,
      sku: product.mapped_unite_sku || null,
      distributor_sku: product.distributor_sku || null,
    });
    const lotIds = new Set(matchedLots.map((lot) => lot.id));
    const history = db.list('consignment_movements', { where: { owner_org_id } })
      .filter((movement) => lotIds.has(movement.inventory_lot_id))
      .filter((movement) => {
        const time = new Date(movement.created_at || 0).getTime();
        return time >= fromMs && time <= asOf.getTime();
      })
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const sold = history.filter((movement) => movement.movement === 'sold_by_unite')
      .reduce((sum, movement) => sum + num(movement.qty), 0);
    const runRate = sold / Number(window_days || 1);
    const onHand = matchedLots.reduce((sum, lot) => sum + num(lot.qty_on_hand), 0);
    const reserved = matchedLots.reduce((sum, lot) => sum + num(lot.qty_reserved), 0);
    const available = onHand - reserved;
    const threshold = product.low_stock_threshold != null
      ? num(product.low_stock_threshold)
      : Math.ceil(runRate * (num(product.replenishment_lead_days) + num(product.safety_stock_days)));
    return {
      product_id: product.id,
      distributor_sku: product.distributor_sku,
      unite_sku: product.mapped_unite_sku || null,
      name: product.name,
      on_hand: onHand,
      reserved,
      available,
      units_sold_window: sold,
      run_rate: +runRate.toFixed(3),
      days_cover: runRate > 0 ? Math.round(available / runRate) : null,
      low_stock_threshold: threshold,
      low_stock: available <= threshold,
      service_history: history.map((movement) => ({
        id: movement.id,
        kind: movement.movement === 'sold_by_unite' ? 'sell_through' : movement.movement,
        qty: num(movement.qty),
        settlement_po_id: movement.settlement_po_id || null,
        occurred_at: movement.created_at,
      })),
    };
  });
}

export async function notifyLowStock(owner_org_id, options = {}) {
  const owner = db.get('organizations', owner_org_id);
  const at = options.as_of instanceof Date ? options.as_of : new Date(options.as_of || Date.now());
  let sent = 0;
  const notifications = [];
  for (const metric of metricsFor(owner_org_id, options).filter((row) => row.low_stock)) {
    const duplicate = db.list('distributor_notifications', { where: {
      owner_org_id, kind: 'low_stock', product_id: metric.product_id, status: 'unread',
    } })[0];
    if (duplicate) continue;
    const notification = db.insert('distributor_notifications', {
      id: uid('dn'), owner_org_id, product_id: metric.product_id,
      kind: 'low_stock', status: 'unread', payload: {
        distributor_sku: metric.distributor_sku,
        on_hand: metric.on_hand,
        available: metric.available,
        run_rate: metric.run_rate,
        days_cover: metric.days_cover,
        low_stock_threshold: metric.low_stock_threshold,
      },
      created_at: at.toISOString(),
    });
    notifications.push(notification);
    if (owner?.contact_email) {
      await mailer.send({
        to: owner.contact_email,
        subject: `Low stock: ${metric.distributor_sku}`,
        body: `${metric.distributor_sku} has ${metric.available} available unit(s), ${metric.days_cover ?? 'unknown'} days of cover, and a ${metric.run_rate}/day trailing run rate.`,
        template_key: 'distributor/low_stock', drafted_by: 'consignment-run-rate',
      });
    }
    sent += 1;
  }
  return { sent, notifications };
}

export const consignment = {
  lotsFor,
  availableFor,
  reserveConsignment,
  reserveForOrder,
  recordSellThrough,
  settlementFor,
  settlementForDistributor,
  metricsFor,
  notifyLowStock,

  productsFor(owner_org_id) { return db.list('distributor_products', { where: { owner_org_id } }); },

  /** Per-product inventory rollup for the distributor inventory view. */
  inventoryFor(owner_org_id) {
    const prods = db.list('distributor_products', { where: { owner_org_id } });
    return prods.map((p) => {
      const matched = db.list('inventory_lots').filter((l) => l.owner_org_id === owner_org_id
        && (l.distributor_sku === p.distributor_sku || (p.mapped_unite_sku && l.product_sku === p.mapped_unite_sku)));
      const on_hand = matched.reduce((a, l) => a + num(l.qty_on_hand), 0);
      const reserved = matched.reduce((a, l) => a + num(l.qty_reserved), 0);
      const nearest = matched.map((l) => l.expiration_date).filter(Boolean).sort()[0] || null;
      return { ...p, on_hand, reserved, available: on_hand - reserved, lot_count: matched.length, nearest_expiry: nearest };
    });
  },

  /** Admin: Unite vs distributor pools for a Unite SKU, side by side. */
  poolsForSku(sku) {
    const lots = db.list('inventory_lots', { where: { product_sku: sku } });
    const unite = lots.filter((l) => l.owner_type === 'unite').reduce((a, l) => a + num(l.qty_on_hand), 0);
    const distributors = {};
    for (const l of lots.filter((x) => x.owner_type === 'distributor')) {
      distributors[l.owner_org_id] = (distributors[l.owner_org_id] || 0) + num(l.qty_on_hand);
    }
    return { unite, distributors };
  },

  /** Mark sell-through movements settled (settlement run). */
  settle(owner_org_id) {
    return { settled: 0, owner_org_id, reason: 'payment_evidence_required' };
  },
};
