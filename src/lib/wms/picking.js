/** Owner-scoped, non-mutating FEFO pick preview. */
import { db } from '../db.js';

function num(value) { return Number(value) || 0; }
function ownerMatches(row, ownerType, ownerOrgId) {
  const rowType = row.inventory_owner_type || row.owner_type || 'unite';
  const rowOrg = row.inventory_owner_org_id || row.owner_org_id || null;
  return rowType === ownerType && (ownerType === 'unite' ? !rowOrg : rowOrg === ownerOrgId);
}
export function lotSellable(lot, now = new Date()) {
  if (!lot || num(lot.qty_remaining ?? lot.qty_on_hand) <= 0) return false;
  if (new Set(['quarantined', 'quality_hold', 'recalled', 'expired', 'disposed', 'returned_to_vendor']).has(String(lot.status || '').toLowerCase())) return false;
  if (lot.expiration_date) {
    const end = new Date(`${lot.expiration_date}T23:59:59.999Z`);
    if (Number.isNaN(end.getTime()) || end.getTime() <= now.getTime()) return false;
  }
  return true;
}
function fefoLots(sku, warehouseId, ownerType, ownerOrgId, now) {
  return db.list('lots', { where: { product_sku: sku, warehouse_id: warehouseId } })
    .filter((lot) => ownerMatches(lot, ownerType, ownerOrgId) && lotSellable(lot, now))
    .sort((a, b) => {
      const ax = a.expiration_date || '9999-12-31';
      const bx = b.expiration_date || '9999-12-31';
      if (ax !== bx) return ax < bx ? -1 : 1;
      return String(a.received_at || '').localeCompare(String(b.received_at || ''));
    });
}

export function buildPickList(orderId, { warehousePriority = ['wh_atl', 'wh_reno'], now = new Date() } = {}) {
  const items = db.list('order_items', { where: { order_id: orderId } });
  const lines = [];
  const short = [];
  for (const item of items) {
    const inventorySku = item.inventory_sku || item.sku;
    const ownerType = item.inventory_owner_type || 'unite';
    const ownerOrgId = item.inventory_owner_org_id || null;
    if (ownerType === 'distributor' && !ownerOrgId) {
      short.push({ sku: item.sku, shortfall: num(item.qty), reason: 'inventory_owner_required' });
      continue;
    }
    let need = num(item.qty);
    const picks = [];
    const pools = db.list('inventory', { where: { sku: inventorySku } })
      .filter((row) => ownerMatches(row, ownerType, ownerOrgId));
    const warehouses = [...new Set(pools.map((row) => row.warehouse_id))]
      .sort((a, b) => warehousePriority.indexOf(a) - warehousePriority.indexOf(b));
    const product = db.list('products').find((row) => row.sku === inventorySku || row.id === item.product_id);
    const lotTracked = ['required', 'actual_required'].includes(product?.lot_tracking);
    for (const warehouseId of warehouses) {
      if (need <= 0) break;
      for (const lot of fefoLots(inventorySku, warehouseId, ownerType, ownerOrgId, now)) {
        if (need <= 0) break;
        const take = Math.min(num(lot.qty_remaining ?? lot.qty_on_hand), need);
        if (take <= 0) continue;
        picks.push({
          warehouse_id: warehouseId, lot_id: lot.id, lot_number: lot.lot_number,
          bin_id: lot.bin_id || lot.bin_location || null, expiration_date: lot.expiration_date,
          owner_type: ownerType, owner_org_id: ownerOrgId, inventory_sku: inventorySku, ordered_sku: item.sku, qty: take,
        });
        need -= take;
      }
      if (need > 0 && !lotTracked) {
        const poolAvailable = pools.filter((row) => row.warehouse_id === warehouseId)
          .reduce((sum, row) => sum + Math.max(0, num(row.on_hand) - num(row.reserved)), 0);
        const already = picks.filter((pick) => pick.warehouse_id === warehouseId).reduce((sum, pick) => sum + pick.qty, 0);
        const take = Math.min(Math.max(0, poolAvailable - already), need);
        if (take > 0) {
          picks.push({ warehouse_id: warehouseId, lot_id: null, lot_number: null, bin_id: null, expiration_date: null, owner_type: ownerType, owner_org_id: ownerOrgId, inventory_sku: inventorySku, ordered_sku: item.sku, qty: take });
          need -= take;
        }
      }
    }
    const picked = picks.reduce((sum, pick) => sum + pick.qty, 0);
    lines.push({ sku: item.sku, inventory_sku: inventorySku, owner_type: ownerType, owner_org_id: ownerOrgId, name: item.name, requested: num(item.qty), picked, shortfall: Math.max(0, need), picks });
    if (need > 0) short.push({ sku: item.sku, shortfall: need });
  }
  return { order_id: orderId, lines, short, fully_pickable: short.length === 0 };
}

export function shortPick(orderId) { return buildPickList(orderId).short; }
export const picking = { buildPickList, shortPick };
