const ACTIVE_LOCATIONS = {
  'Unite Medical Warehouse': 'wh_unite',
  'CATO Warehouse': 'wh_cato',
};
const EXCLUDED = new Set(['Shipping Tree - Ohio Location']);

function qty(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function buildDamonInventoryOpening(rows) {
  const opening = [];
  const audit_only = [];
  const poolCounts = new Map();
  for (const row of rows || []) {
    const warehouse_id = ACTIVE_LOCATIONS[row.Location];
    if (warehouse_id) {
      const key = `${row.SKU}:${warehouse_id}`;
      poolCounts.set(key, (poolCounts.get(key) || 0) + 1);
    }
  }
  for (const row of rows || []) {
    const location = row.Location;
    if (EXCLUDED.has(location)) {
      audit_only.push({ ...row, migration_action: 'excluded_from_production' });
      continue;
    }
    const warehouse_id = ACTIVE_LOCATIONS[location];
    if (!warehouse_id) {
      audit_only.push({ ...row, migration_action: 'unknown_location_hold' });
      continue;
    }
    if (poolCounts.get(`${row.SKU}:${warehouse_id}`) > 1) {
      audit_only.push({ ...row, migration_action: 'duplicate_sku_location_hold' });
      continue;
    }
    if (location === 'CATO Warehouse') {
      opening.push({ sku: row.SKU, warehouse_id, on_hand: 0, available: 0, committed: 0, incoming: 0, provisional: true });
      audit_only.push({ ...row, migration_action: 'active_balance_zeroed' });
      continue;
    }
    opening.push({
      sku: row.SKU,
      warehouse_id,
      on_hand: qty(row['On hand (current)']),
      available: qty(row['Available (not editable)']),
      committed: qty(row['Committed (not editable)']),
      incoming: qty(row['Incoming (not editable)']),
      provisional: true,
    });
  }
  return { opening, audit_only, excluded_locations: [...EXCLUDED] };
}
