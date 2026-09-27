import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSettlementDrafts } from '../api/_lib/distributorSettlement.js';

const candidates = [{
  movement_id: 'cm_1', owner_org_id: 'org_dist', inventory_lot_id: 'lot_1',
  distributor_sku: 'DIST-A', product_sku: 'SHARED-A', qty: 2, eligible_at: '2026-07-18T12:00:00.000Z',
}];
const agreements = [{
  id: 'agreement_1', owner_org_id: 'org_dist', distributor_sku: 'DIST-A', mapped_unite_sku: 'SHARED-A',
  name: 'Owned device', unite_sellable: true, settlement_unit_cost: 12.5, settlement_currency: 'USD',
  settlement_effective_from: '2026-01-01T00:00:00.000Z', settlement_effective_until: '2027-01-01T00:00:00.000Z',
}];

test('settlement draft binds one active price agreement to an immutable movement set', () => {
  const first = buildSettlementDrafts({ candidates, agreements, organizations: [{ id: 'org_dist', name: 'Regional Distributor', contact_email: 'ap@dist.org' }] });
  const replay = buildSettlementDrafts({ candidates: [...candidates], agreements, organizations: [{ id: 'org_dist', name: 'Regional Distributor' }] });
  assert.equal(first.ok, true);
  assert.equal(first.purchase_orders.length, 1);
  assert.equal(first.purchase_orders[0].id, replay.purchase_orders[0].id);
  assert.equal(first.purchase_orders[0].po_type, 'consignment_settlement');
  assert.equal(first.purchase_orders[0].total_cost, 25);
  assert.deepEqual(first.purchase_orders[0].eligible_movement_ids, ['cm_1']);
  assert.equal(first.purchase_orders[0].line_items[0].agreement_id, 'agreement_1');
  assert.equal(first.movements[0].settlement_po_id, first.purchase_orders[0].id);
  assert.equal(first.candidates[0].status, 'batched');
  assert.doesNotMatch(JSON.stringify(first.purchase_orders), /customer|secret|source_order/i);
});

test('settlement draft fails closed before stock mutation when active price is absent', () => {
  assert.equal(buildSettlementDrafts({ candidates, agreements: [] }).reason, 'active_settlement_price_required');
  assert.equal(buildSettlementDrafts({
    candidates,
    agreements: [{ ...agreements[0], settlement_effective_until: '2026-01-01T00:00:00.000Z' }],
  }).reason, 'active_settlement_price_required');
});
