import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDamonInventoryOpening } from '../src/lib/inventoryOpeningPolicy.js';

const rows = [
  { SKU: 'A', Location: 'Unite Medical Warehouse', 'On hand (current)': '12', 'Available (not editable)': '9', 'Committed (not editable)': '3', 'Incoming (not editable)': '5' },
  { SKU: 'A', Location: 'CATO Warehouse', 'On hand (current)': '-4', 'Available (not editable)': '-6', 'Committed (not editable)': '2', 'Incoming (not editable)': '0' },
  { SKU: 'A', Location: 'Shipping Tree - Ohio Location', 'On hand (current)': '0', 'Available (not editable)': '0', 'Committed (not editable)': '0', 'Incoming (not editable)': '0' },
];

test('inventory opening keeps Unite quantities provisional and preserves commitments', () => {
  const result = buildDamonInventoryOpening(rows);
  assert.deepEqual(result.opening[0], { sku: 'A', warehouse_id: 'wh_unite', on_hand: 12, available: 9, committed: 3, incoming: 5, provisional: true });
});

test('inventory opening zeros CATO and removes Ohio from active routing', () => {
  const result = buildDamonInventoryOpening(rows);
  assert.equal(result.opening.find((row) => row.warehouse_id === 'wh_cato').on_hand, 0);
  assert.equal(result.opening.some((row) => row.warehouse_id === 'wh_ohio'), false);
  assert.deepEqual(result.excluded_locations, ['Shipping Tree - Ohio Location']);
});

test('inventory opening holds duplicate SKU-location pools instead of summing them', () => {
  const duplicate = [...rows, { ...rows[0], 'On hand (current)': '99' }];
  const result = buildDamonInventoryOpening(duplicate);
  assert.equal(result.opening.some((row) => row.sku === 'A' && row.warehouse_id === 'wh_unite'), false);
  assert.equal(result.audit_only.filter((row) => row.migration_action === 'duplicate_sku_location_hold').length, 2);
});
