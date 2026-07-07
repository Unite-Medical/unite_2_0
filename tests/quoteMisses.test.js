/** "No quote returned" feedback loop (briefing §6). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../src/lib/db.js';
import {
  recordQuoteMiss,
  captureShortageListMisses,
  captureParserSkips,
  flagMissingQuoteLine,
  listOpenMisses,
  resolveMiss,
  missDemandSignals,
} from '../src/lib/quoteMisses.js';
import { matchShortageList } from '../src/lib/matching.js';
import { parseVendorSheetText } from '../src/lib/vendorSheet.js';

test('record → list → resolve lifecycle', () => {
  const miss = recordQuoteMiss({
    customer_name: 'Atlanta Surgical Center',
    email: 'buyer@asc.example',
    raw_text: 'ultrasonic scalpel handpiece, qty 4',
    description: 'ultrasonic scalpel handpiece',
    qty: 4,
    reason: 'no_match',
  });
  assert.equal(miss.status, 'open');
  assert.ok(listOpenMisses().some((m) => m.id === miss.id));

  const bad = resolveMiss(miss.id, { resolution: 'nope' });
  assert.equal(bad.ok, false);

  const done = resolveMiss(miss.id, { resolution: 'sourced', resolved_by: 'alex' });
  assert.equal(done.ok, true);
  assert.equal(done.miss.status, 'resolved');
  assert.ok(!listOpenMisses().some((m) => m.id === miss.id));
});

test('cross-referenced resolution feeds the PRD-29 data moat', () => {
  const miss = recordQuoteMiss({
    customer_name: 'Test Clinic',
    code: 'ZZ-9999',
    description: 'hinged knee brace equivalent',
    reason: 'customer_flagged',
  });
  const before = db.count('cross_references');
  const res = resolveMiss(miss.id, { resolution: 'cross_referenced', resolved_sku: 'KGN-200', resolved_by: 'alex' });
  assert.equal(res.ok, true);
  assert.equal(db.count('cross_references'), before + 1);
  const xref = db.list('cross_references').at(-1);
  assert.equal(xref.customer_code, 'ZZ-9999');
  assert.equal(xref.unite_sku, 'KGN-200');
  assert.equal(xref.source, 'quote-miss');
});

test('shortage-list misses are captured automatically (never dropped)', () => {
  const { lines } = matchShortageList([
    'nitrile exam gloves large x12',              // should match the catalog
    'zirconium plasma weldotron cartridge, qty 7', // should NOT match anything
  ].join('\n'));
  const missedBefore = lines.filter((l) => l.status === 'sourcing' || l.status === 'equivalent');
  assert.ok(missedBefore.length >= 1, 'expected at least one unmatchable line');

  const created = captureShortageListMisses({
    lines, customer_name: 'Piedmont OR', email: 'or@piedmont.example', request_id: 'short_test1',
  });
  assert.equal(created.length, missedBefore.length);
  assert.ok(created.every((m) => m.status === 'open'));
  assert.ok(created.every((m) => m.source === 'shortage-list'));
});

test('parser skips become vendor-sheet misses', () => {
  const parsed = parseVendorSheetText({
    text: 'product_name,fob_price_usd\nGood item,2.50\n,3.00\nBad price item,abc\n',
  });
  assert.equal(parsed.totals.skipped, 2);
  const created = captureParserSkips({ parseResult: parsed, vendor: 'Pentastar' });
  assert.equal(created.length, 2);
  assert.ok(created.every((m) => m.reason === 'parse_skipped'));
});

test('customer flag + demand-signal rollup', () => {
  flagMissingQuoteLine({
    customer_name: 'ASC', email: 'a@b.c', quote_id: 'Q-26-00001',
    description: 'bariatric knee walker', qty: 2,
  });
  flagMissingQuoteLine({
    customer_name: 'Clinic 2', email: 'd@e.f', quote_id: 'Q-26-00002',
    description: 'bariatric knee walker', qty: 5,
  });
  const signals = missDemandSignals();
  const hit = signals.find((s) => s.description === 'bariatric knee walker');
  assert.ok(hit);
  assert.ok(hit.requests >= 2);
  assert.ok(hit.total_qty >= 7);
});
