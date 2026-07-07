/** Template v4 (implements the v2 master spec) + version detection. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TEMPLATE_COLUMNS,
  TEMPLATE_VERSION,
  REQUIRED_COUNT,
  generateTemplateCsv,
  buildTemplateWorkbook,
  detectTemplateVersion,
} from '../src/lib/quoteTemplate.js';
import { resolveColumns, parseVendorSheetText } from '../src/lib/vendorSheet.js';

test('template implements the full v2 spec + the two engine additions', () => {
  const keys = TEMPLATE_COLUMNS.map((c) => c.key);
  // 53 v2 columns + lead_time_days (quote ETAs) + cross_reference_skus
  // (PRD-29 SKU matching) = 55.
  assert.equal(keys.length, 55);
  assert.ok(keys.includes('lead_time_days'));
  assert.ok(keys.includes('cross_reference_skus'));
  assert.ok(keys.includes('mfr_hs_code'));
  assert.ok(keys.includes('actual_manufacturer_name'));
  assert.ok(keys.includes('cartons_per_40ft'));
  // Requirement split sanity (36 required in v2 + lead_time_days).
  assert.equal(REQUIRED_COUNT, 37);
  assert.equal(TEMPLATE_COLUMNS.filter((c) => c.req.level === 'unite').length, 3);
});

test('every template header maps to its own canonical field via exact alias', () => {
  const headers = TEMPLATE_COLUMNS.map((c) => c.key);
  const { map, meta, unmappedRequired } = resolveColumns(headers);
  assert.deepEqual(unmappedRequired, []);
  for (const h of headers) {
    assert.ok(h in map, `template header "${h}" is not a canonical parser field`);
    assert.equal(headers[map[h]], h, `field ${h} mapped to a different column`);
    assert.equal(meta[h].via, 'alias');
  }
});

test('round trip: generated CSV template parses back with full fidelity', () => {
  const res = parseVendorSheetText({ text: generateTemplateCsv(), filename: 'template.csv' });
  assert.equal(res.ok, true);
  assert.equal(res.totals.accepted, 1);
  const l = res.lines[0];
  assert.equal(l.name, 'Adjustable Hinged Knee Brace');
  assert.equal(l.model_no, 'BQ-KB-200');
  assert.equal(l.fob, 2.85);
  assert.equal(l.lead_time_days, 30);
  assert.equal(l.units_per_carton, 100);
  assert.equal(l.carton_cbm, 0.12);
  assert.equal(l.incoterm, 'FOB');
  // hts_code column ships blank → the mfr HS hint drives classification.
  assert.equal(l.hts, '9021.10');
  assert.equal(l.hts_source, 'mfr_hint');
});

test('workbook has all four sheets and color-coded headers', () => {
  const wb = buildTemplateWorkbook();
  assert.deepEqual(wb.sheets.map((s) => s.name), [
    'Product Data', 'Instructions', 'Reference', 'Data Sources & Validation',
  ]);
  const headerRow = wb.sheets[0].rows[0];
  const styles = new Set(headerRow.map((c) => c.s));
  assert.ok(styles.has('headerReq'));
  assert.ok(styles.has('headerOpt'));
  assert.ok(styles.has('headerUnite'));
  // Validations exist (dropdowns + numeric bounds).
  assert.ok(wb.sheets[0].validations.length >= 8);
});

test('version detection matches both our marker and the emailed v2 style', () => {
  const v4 = detectTemplateVersion([{ name: 'Instructions', rows: [[`Unite Medical · Vendor Quote Template ${TEMPLATE_VERSION}`]] }]);
  assert.equal(v4.version, TEMPLATE_VERSION);
  assert.equal(v4.isCurrent, true);

  // Damon's v2 master writes "…Vendor Template  (v2)" — previously undetected.
  const v2 = detectTemplateVersion([{ name: 'Instructions', rows: [['Unite Medical — Quoting Engine Vendor Template  (v2)']] }]);
  assert.equal(v2.version, 'v2');
  assert.equal(v2.isCurrent, false);

  const none = detectTemplateVersion([{ name: 'Data', rows: [['product_name', 'fob_price_usd']] }]);
  assert.equal(none.version, null);
});
