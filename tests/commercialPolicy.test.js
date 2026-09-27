import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MINIMUM_GROSS_MARGIN,
  minimumSellPrice,
  vendorPriceStatus,
  projectCommercialRecord,
  resolveQuoteView,
} from '../src/lib/commercialPolicy.js';
import { db } from '../src/lib/db.js';
import { repriceQuote, runQuotingEngine } from '../src/lib/quoting.js';

test('minimum selling price enforces a 30 percent gross margin', () => {
  assert.equal(MINIMUM_GROSS_MARGIN, 0.30);
  assert.equal(minimumSellPrice(70), 100);
  assert.equal(minimumSellPrice(0), 0);
});

test('vendor price cannot be reused automatically after its validity expires', () => {
  const now = new Date('2026-07-17T12:00:00.000Z');
  assert.deepEqual(
    vendorPriceStatus({ valid_until: '2026-07-18T00:00:00.000Z' }, now),
    { reusable: true, reason: 'current', valid_until: '2026-07-18T00:00:00.000Z' },
  );
  assert.deepEqual(
    vendorPriceStatus({ valid_until: '2026-07-16T00:00:00.000Z' }, now),
    { reusable: false, reason: 'expired', valid_until: '2026-07-16T00:00:00.000Z' },
  );
  assert.deepEqual(
    vendorPriceStatus({}, now),
    { reusable: false, reason: 'missing_validity', valid_until: null },
  );
});

test('ordinary sales projection never contains internal cost or vendor fields', () => {
  const record = {
    id: 'quote_1',
    customer_name: 'Northside Clinic',
    total: 1200,
    vendor: 'Private Supplier',
    vendor_id: 'ven_secret',
    vendor_cost: 700,
    landed_cost: 820,
    cost_components: { fob: 700, freight: 120 },
    margin_target: 0.3167,
    internal_freight_breakdown: { ltl: 120 },
    internal_approval_notes: 'Owner override',
  };

  assert.deepEqual(projectCommercialRecord(record, { role: 'sales' }), {
    id: 'quote_1',
    customer_name: 'Northside Clinic',
    total: 1200,
  });
  assert.equal(projectCommercialRecord(record, { role: 'admin' }).vendor_cost, 700);
  assert.equal(projectCommercialRecord(record, { role: 'procurement' }).vendor, 'Private Supplier');
});

test('internal quote view cannot be selected by an ordinary sales session', () => {
  assert.equal(resolveQuoteView('internal', { role: 'sales' }), 'customer');
  assert.equal(resolveQuoteView('internal', { role: 'customer' }), 'customer');
  assert.equal(resolveQuoteView('internal', null), 'customer');
  assert.equal(resolveQuoteView('internal', { role: 'admin' }), 'internal');
  assert.equal(resolveQuoteView('internal', { role: 'procurement' }), 'internal');
});

test('quote repricing clamps requested margin to 30 percent gross margin', () => {
  const quoteId = 'quote_margin_floor_test';
  db.insert('quotes', {
    id: quoteId,
    status: 'draft',
    customer_tier: 'gov',
    margin_target: 0.2,
    total_units: 1,
  });
  db.insert('quote_items', {
    id: 'quote_item_margin_floor_test',
    quote_id: quoteId,
    target_qty: 1,
    cost_components: { fob: 70 },
  });

  const result = repriceQuote(quoteId, { margin_pct: 0.1, actor: 'test' });
  assert.equal(result.ok, true);
  assert.equal(result.quote.margin_target, 0.3);
  assert.equal(result.items[0].sell_per_unit, 100);
  assert.equal(result.items[0].landed_per_unit, 70);
});

test('new quote persists the 30 percent floor as its target margin', async () => {
  const result = await runQuotingEngine({
    vendor: 'Margin Test Vendor',
    customer_name: 'Government Buyer',
    customer_tier: 'gov',
    classifyFda: false,
    lines: [{
      name: 'Test product',
      fob: 70,
      target_qty: 1,
      moq: 1,
      hts: '9021.10',
      country_of_origin: 'US',
      fda_product_code: 'KGN',
      fob_price_valid_until: '2026-08-01T00:00:00.000Z',
    }],
  });

  assert.equal(result.quote.margin_target, 0.3);
  assert.equal(result.lines[0].margin_pct, 0.3);
});
