import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ownerInventoryKey } from '../api/wms/reconcile.js';
import { lotSellable } from '../src/lib/wms/picking.js';
import { receiveScan, pickScan } from '../src/lib/scanning.js';
import { genealogyMatches } from '../src/lib/wms/lots.js';

test('reconciliation keys include owner identity and require distributor owner', () => {
  assert.equal(ownerInventoryKey({ sku: 'SKU', warehouse_id: 'wh_atl' }), 'SKU|wh_atl|unite|');
  assert.equal(ownerInventoryKey({ sku: 'SKU', warehouse_id: 'wh_atl', owner_type: 'distributor', owner_org_id: 'org_a' }), 'SKU|wh_atl|distributor|org_a');
  assert.notEqual(
    ownerInventoryKey({ sku: 'SKU', warehouse_id: 'wh_atl', owner_type: 'distributor', owner_org_id: 'org_a' }),
    ownerInventoryKey({ sku: 'SKU', warehouse_id: 'wh_atl', owner_type: 'distributor', owner_org_id: 'org_b' }),
  );
  assert.equal(ownerInventoryKey({ sku: 'SKU', warehouse_id: 'wh_atl', owner_type: 'distributor' }), null);
});

test('pick eligibility excludes quarantine, recall, holds, and expiration', () => {
  const now = new Date('2026-07-19T12:00:00.000Z');
  const base = { qty_remaining: 2, expiration_date: '2026-08-01' };
  assert.equal(lotSellable(base, now), true);
  for (const status of ['quarantined', 'quality_hold', 'recalled', 'expired', 'disposed', 'returned_to_vendor']) {
    assert.equal(lotSellable({ ...base, status }, now), false, status);
  }
  assert.equal(lotSellable({ ...base, expiration_date: '2026-07-18' }, now), false);
});

test('legacy browser scanner mutations are retired', () => {
  assert.throws(() => receiveScan({}), /server_authoritative_po_receipt_required/);
  assert.throws(() => pickScan({ order_id: 'order_1' }), /server_authoritative_pick_required/);
});

test('exact lot recall matches despite historical variant or parent SKU drift', () => {
  const historicalVariant = { lot_id: 'lot_exact', product_sku: 'PARENT-VARIANT', ordered_sku: 'PARENT-VARIANT', owner_org_id: null };
  assert.equal(genealogyMatches(historicalVariant, { lot_id: 'lot_exact', product_sku: 'PARENT' }), true);
  assert.equal(genealogyMatches(historicalVariant, { lot_id: 'different', product_sku: 'PARENT-VARIANT' }), false);
  assert.equal(genealogyMatches(historicalVariant, { product_sku: 'PARENT' }), false);
  assert.equal(genealogyMatches(historicalVariant, { product_sku: 'PARENT-VARIANT' }), true);
});

test('generic WMS movement cannot increase inventory and generic reserve is retired', async () => {
  const movement = await readFile(new URL('../api/wms/movement.js', import.meta.url), 'utf8');
  const reserve = await readFile(new URL('../api/wms/reserve.js', import.meta.url), 'utf8');
  assert.match(movement, /410/);
  assert.match(movement, /authoritative_inventory_transition_required/);
  assert.match(reserve, /410/);
  assert.match(reserve, /authoritative_order_allocation_required/);
});
