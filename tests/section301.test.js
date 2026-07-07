/** Section 301 pre-filter (briefing §3 — the free duty layer). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { section301Lookup, section301LookupBatch } from '../src/lib/external/section301.js';
import { portCodeFor } from '../src/lib/external/flexport.js';

test('CN-origin textile (6307.90) triggers List 3 at 25%', () => {
  const r = section301Lookup('6307.90.98', 'CN');
  assert.equal(r.applies, true);
  assert.equal(r.rate_pct, 25);
  assert.equal(r.list, '3');
  assert.equal(r.chapter99, '9903.88.03');
  assert.equal(r.needs_confirmation, true); // exclusions exist — Flexport confirms
});

test('CN-origin orthopedic (9021.10) triggers List 4A at 7.5%', () => {
  const r = section301Lookup('9021.10', 'CN');
  assert.equal(r.applies, true);
  assert.equal(r.rate_pct, 7.5);
  assert.equal(r.list, '4A');
});

test('CN-origin instruments (9018) trigger List 1 at 25%', () => {
  const r = section301Lookup('9018.90.80', 'China');
  assert.equal(r.applies, true);
  assert.equal(r.rate_pct, 25);
  assert.equal(r.list, '1');
});

test('non-China origin never triggers 301', () => {
  for (const coo of ['VN', 'MY', 'US', 'DE', '']) {
    const r = section301Lookup('6307.90', coo);
    assert.equal(r.applies, false);
    assert.equal(r.rate_pct, 0);
    assert.equal(r.needs_confirmation, false);
  }
});

test('CN origin with unlisted HTS still demands confirmation', () => {
  const r = section301Lookup('0101.21', 'CN'); // live horses — not in our table
  assert.equal(r.applies, false);
  assert.equal(r.needs_confirmation, true);
});

test('batch helper mirrors single lookups', () => {
  const rs = section301LookupBatch([
    { hts: '6307.90', coo: 'CN' },
    { hts: '6307.90', coo: 'VN' },
  ]);
  assert.equal(rs[0].applies, true);
  assert.equal(rs[1].applies, false);
});

test('portCodeFor resolves vendor free text to UN/LOCODEs', () => {
  assert.equal(portCodeFor('Shenzhen (Yantian)'), 'CNYTN');
  assert.equal(portCodeFor('Shanghai'), 'CNSHA');
  assert.equal(portCodeFor('Haiphong, Vietnam'), 'VNHPH');
  assert.equal(portCodeFor('CNNGB'), 'CNNGB');   // already a code
  assert.equal(portCodeFor(''), 'CNSHA');        // fallback
  assert.equal(portCodeFor('Some Unknown Port'), 'CNSHA');
});
