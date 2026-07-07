/** Flexport classification auto-exporter (briefing §4 — no re-keying). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FLEXPORT_CLASSIFICATION_COLUMNS,
  buildFlexportClassificationRows,
  generateFlexportClassificationCsv,
} from '../src/lib/flexportExport.js';
import { parseVendorSheetText } from '../src/lib/vendorSheet.js';

const LINE = {
  name: 'Adjustable Hinged Knee Brace',
  model_no: 'BQ-KB-200',
  description: 'Neoprene, universal, dual aluminum hinges',
  product_type: 'Medical > Orthopedic > Knee Brace',
  image_link: 'https://example.com/kb.jpg',
  fob: 2.85,
  country_of_origin: 'CN',
  mfr_hs_code: '9021.10',
  hts: '9021.10',
};

test('exporter emits exactly the 10 Flexport template fields', () => {
  assert.deepEqual(FLEXPORT_CLASSIFICATION_COLUMNS, [
    'price', 'sku', 'title', 'description', 'product_type',
    'link', 'image_link', 'condition', 'coo', 'hs_hint',
  ]);
  const [row] = buildFlexportClassificationRows([LINE]);
  assert.deepEqual(Object.keys(row).sort(), [...FLEXPORT_CLASSIFICATION_COLUMNS].sort());
  assert.equal(row.price, 2.85);
  assert.equal(row.sku, 'BQ-KB-200');
  assert.equal(row.title, 'Adjustable Hinged Knee Brace');
  assert.equal(row.condition, 'new');
  assert.equal(row.coo, 'CN');
  assert.equal(row.hs_hint, '9021.10'); // mfr's own code is the hint
});

test('lines without identity are skipped; gtin backstops missing model no', () => {
  const rows = buildFlexportClassificationRows([
    {},
    { name: 'Thing', fob: 1, gtin: '00012345678905' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sku, '00012345678905');
});

test('CSV output escapes embedded commas/quotes and keeps header order', () => {
  const csv = generateFlexportClassificationCsv([
    { ...LINE, description: 'Neoprene, "medical grade"' },
  ]);
  const [header, row] = csv.trim().split('\n');
  assert.equal(header, FLEXPORT_CLASSIFICATION_COLUMNS.join(','));
  assert.ok(row.includes('"Neoprene, ""medical grade"""'));
});

test('end-to-end: v2 sheet → parser → Flexport rows with zero re-keying', () => {
  const csv = [
    'product_name,manufacturer_model_no,description,product_type,image_link,fob_price_usd,currency,mfr_hs_code,country_of_origin',
    'Adjustable Hinged Knee Brace,BQ-KB-200,"Neoprene, universal",Medical > Orthopedic,https://x.com/kb.jpg,2.85,USD,9021.10,CN',
  ].join('\n');
  const parsed = parseVendorSheetText({ text: csv, filename: 'v2.csv' });
  assert.equal(parsed.ok, true);
  const [row] = buildFlexportClassificationRows(parsed.lines);
  assert.equal(row.sku, 'BQ-KB-200');
  assert.equal(row.price, 2.85);
  assert.equal(row.product_type, 'Medical > Orthopedic');
  assert.equal(row.image_link, 'https://x.com/kb.jpg');
  assert.equal(row.coo, 'CN');
  assert.equal(row.hs_hint, '9021.10');
  assert.equal(row.condition, 'new');
});
