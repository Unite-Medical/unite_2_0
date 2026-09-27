// Status is derived from recorded inventory, never inferred from LiDAR geometry.
export const spatialColors = { complete: '#24966c', missing: '#d99622', shipping: '#4087df', hold: '#d45860' };
export function containerMapStatus(container, data) {
  const lot = data.lots.find((l) => l.id === container.lot_id);
  const product = data.products.find((p) => p.sku === container.sku);
  const bin = data.bins.find((b) => b.id === container.bin_id);
  const issues = [];
  if (!product) issues.push('SKU not matched');
  if (!bin || bin.warehouse_id !== container.warehouse_id) issues.push('Location missing or mismatched');
  if (!lot || lot.product_sku !== container.sku || lot.warehouse_id !== container.warehouse_id || (lot.bin_id && lot.bin_id !== container.bin_id)) issues.push('Lot not matched to this location');
  if (!lot?.lot_number || (product?.policy?.lot === 'required' && /^n\/?a$/i.test(lot.lot_number))) issues.push('Lot number required');
  const expiry = lot?.expiration_date;
  const validExpiry = /^\d{4}-\d{2}-\d{2}$/.test(expiry || '') && !Number.isNaN(Date.parse(expiry)) && new Date(expiry).toISOString().slice(0, 10) === expiry;
  if (!validExpiry && !(lot?.expiration_not_applicable === true && product?.policy?.expiration !== 'required')) issues.push('Expiration required');
  if (product?.policy?.serial === 'required' && !lot?.serial_number) issues.push('Serial required');
  if (product?.policy?.udi === 'required' && !lot?.udi) issues.push('UDI required');
  if (!Number.isSafeInteger(container.units_remaining) || container.units_remaining < 0 || !Number.isSafeInteger(container.units_per_case) || container.units_per_case < 1) issues.push('Case size or quantity required');
  if (!['open', 'sealed'].includes(container.state)) issues.push('Open/sealed status required');
  if (container.needs_recount) issues.push('Recount required');
  const holds = ['quarantined', 'recalled', 'restricted', 'expired', 'disposed', 'quality_hold'];
  const expired = validExpiry && expiry < String(data.server_time || '').slice(0, 10);
  if (expired) issues.push('Expired stock');
  if (holds.includes(lot?.status)) issues.push('Stock on hold');
  const outgoing = (data.outgoing_picks || []).filter((p) => p.container_id === container.id && p.lot_id === container.lot_id);
  const status = expired || holds.includes(lot?.status) ? 'hold' : issues.length ? 'missing' : outgoing.length ? 'shipping' : 'complete';
  return { ...container, lot, issues, outgoing, status, color: spatialColors[status] };
}
export function mapLocations(map, data) {
  return data.bins.filter((b) => b.map_id === map.id).map((bin) => {
    const containers = data.containers.filter((c) => c.bin_id === bin.id).map((c) => containerMapStatus(c, data));
    const status = containers.some((c) => c.status === 'hold') ? 'hold' : !containers.length || containers.some((c) => c.status === 'missing') ? 'missing' : containers.some((c) => c.status === 'shipping') ? 'shipping' : 'complete';
    return { ...bin, containers, status, color: spatialColors[status] };
  });
}
