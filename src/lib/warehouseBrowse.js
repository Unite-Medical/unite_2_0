import { containerMapStatus } from './warehouseSpatial.js';
const owner = r => `${r.owner_type || 'unite'}:${r.owner_org_id || ''}`;
export const locationLabel = r => r?.code || r?.name || 'Unassigned';
export function warehouseRows(data) {
  const rows = [];
  for (const inv of data.inventory) {
    const product = data.products.find(p => p.sku === inv.sku);
    const lots = data.lots.filter(l => l.product_sku === inv.sku && l.warehouse_id === inv.warehouse_id && owner(l) === owner(inv));
    for (const lot of lots.length ? lots : [null]) {
      const containers = lot ? data.containers.filter(c => c.lot_id === lot.id).map(c => containerMapStatus(c, data)) : [];
      const bin = data.bins.find(b => b.id === lot?.bin_id);
      const counts = data.counts.filter(c => c.inventory_id === inv.id && ((c.lot_id || c.posted_lot_id || null) === (lot?.id || null) || c.posted_lot_ids?.includes(lot?.id)));
      const latest = counts.sort((a,b) => String(b.counted_at).localeCompare(String(a.counted_at)))[0];
      const status = latest?.status === 'pending' ? 'review' : latest?.status === 'posted' ? 'counted' : 'uncounted';
      rows.push({ id: `${inv.id}:${lot?.id || 'opening'}`, inventory: inv, product, lot, bin, containers, latest, status, sku: inv.sku, name: product?.name || inv.sku, warehouse_id: inv.warehouse_id, units: lot ? Number(lot.qty_remaining) : Number(inv.on_hand), search: [inv.sku, product?.name, bin?.code, bin?.name, lot?.lot_number, ...containers.map(c=>c.id)].filter(Boolean).join(' ').toLowerCase() });
    }
  }
  return rows;
}
export function filterWarehouseRows(rows, {warehouse = '', query = '', status = 'all'} = {}) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(r => (!warehouse || r.warehouse_id === warehouse) && (status === 'all' || r.status === status || (status === 'attention' && (!r.bin || r.containers.some(c => c.issues.length)))) && words.every(w => r.search.includes(w)));
}
// Ambiguous location labels across warehouses must be explicitly disambiguated.
export function resolveLocation(raw, bins, warehouse = '') {
  const value = String(raw).trim().toUpperCase();
  const matches = bins.filter(b => (!warehouse || b.warehouse_id === warehouse) && [b.id, b.code, b.name].some(v => String(v || '').toUpperCase() === value));
  return matches.length === 1 ? { bin: matches[0] } : { error: matches.length ? 'This label exists in more than one warehouse. Choose a warehouse first.' : 'Location label not found. Choose or register the location.' };
}
export function countFormForRow(row, initial) {
  return { ...initial, inventory_id: row.inventory.id, sku: row.sku, warehouse_id: row.warehouse_id, bin_id: row.bin?.id || '', lot_id: row.lot?.id || '', lot_number: row.lot?.lot_number || '', expiration_date: row.lot?.expiration_date || (row.lot?.expiration_not_applicable ? 'N/A' : ''), serial_number: row.lot?.serial_number || '', udi: row.lot?.udi || '', not_applicable_reason: row.lot?.not_applicable_reason || '', units_per_case: row.product?.pack_verified ? String(row.product.units_per_case || '') : '', reason: row.lot ? 'Physical warehouse count' : 'Initial warehouse inventory', capture_method: 'manual' };
}
export function manualArea(name, warehouse_id, width, depth) {
  const w = Number(width), d = Number(depth);
  if (!name.trim() || !warehouse_id || !Number.isFinite(w) || !Number.isFinite(d) || w < 1 || d < 1 || w > 100 || d > 100) return null;
  return { name: name.trim(), warehouse_id, source: 'manual_layout', surfaces: [{kind:'wall',x:0,z:-d/2,width:w,angle:0,height:2.8},{kind:'wall',x:0,z:d/2,width:w,angle:0,height:2.8},{kind:'wall',x:-w/2,z:0,width:d,angle:Math.PI/2,height:2.8},{kind:'wall',x:w/2,z:0,width:d,angle:Math.PI/2,height:2.8}] };
}
