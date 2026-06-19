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

function num(v) { return Number(v) || 0; }

/** Owner-scoped lots, narrowed by sku and/or distributor_sku. */
export function lotsFor({ owner_type = 'distributor', owner_org_id = null, sku = null, distributor_sku = null } = {}) {
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

/**
 * Record a sell-through: Unite (or a Unite rep) sold the distributor's stock.
 * FEFO-decrements the distributor's lots and writes settlement movements —
 * never touches Unite-owned lots.
 */
export function recordSellThrough({ owner_org_id, order_id, sku = null, distributor_sku = null, qty, unit_cost = null }) {
  let need = qty;
  const movements = [];
  for (const lot of fefo(lotsFor({ owner_org_id, sku, distributor_sku }))) {
    if (need <= 0) break;
    const take = Math.min(num(lot.qty_on_hand), need);
    if (take > 0) {
      db.update('inventory_lots', lot.id, {
        qty_on_hand: num(lot.qty_on_hand) - take,
        qty_reserved: Math.max(0, num(lot.qty_reserved) - take),
      });
      movements.push(db.insert('consignment_movements', {
        id: uid('cm'), owner_org_id, inventory_lot_id: lot.id, order_id, qty: take,
        unit_cost, movement: 'sold_by_unite', settled: false, created_at: new Date().toISOString(),
      }));
      need -= take;
    }
  }
  return { moved: qty - need, shortfall: Math.max(0, need), movements };
}

/** Settlement summary for a distributor (owed vs settled). */
export function settlementFor(owner_org_id) {
  const moves = db.list('consignment_movements', { where: { owner_org_id } });
  const owed = moves.filter((m) => !m.settled).reduce((a, m) => a + num(m.unit_cost) * num(m.qty), 0);
  const settled = moves.filter((m) => m.settled).reduce((a, m) => a + num(m.unit_cost) * num(m.qty), 0);
  return { movements: moves, owed: +owed.toFixed(2), settled: +settled.toFixed(2), units: moves.reduce((a, m) => a + num(m.qty), 0) };
}

export const consignment = {
  lotsFor,
  availableFor,
  reserveConsignment,
  recordSellThrough,
  settlementFor,

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
    const open = db.list('consignment_movements', { where: { owner_org_id, settled: false } });
    for (const m of open) db.update('consignment_movements', m.id, { settled: true, settled_at: new Date().toISOString() });
    return { settled: open.length };
  },
};
