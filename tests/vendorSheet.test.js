/**
 * Vendor sheet parser — v2/v4 template coverage (briefing §2 + §8.1).
 * Run: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveColumns,
  parseVendorSheetText,
  computeShipmentMetrics,
  normalizeHsCode,
  CANONICAL_FIELDS,
} from '../src/lib/vendorSheet.js';

// The exact 53 headers from Damon's v2 master template (email attachment).
const V2_HEADERS = [
  'product_name', 'manufacturer_model_no', 'description', 'product_type', 'image_link',
  'fob_price_usd', 'currency', 'price_break_qty_1', 'price_break_fob_1', 'price_break_qty_2',
  'price_break_fob_2', 'tooling_setup_cost_usd', 'sample_cost_usd', 'sample_lead_time_days',
  'moq', 'fob_price_valid_until', 'payment_terms', 'mfr_hs_code', 'hts_code',
  'country_of_origin', 'alternate_factory_locations', 'device_class', 'fda_product_code',
  'premarket_510k_or_exempt', 'actual_manufacturer_name', 'actual_manufacturer_address',
  'manufacturer_fda_registration', 'us_agent', 'sterile', 'single_use', 'rx_or_otc', 'latex',
  'dehp_phthalates', 'shelf_life_months', 'certifications', 'gtin', 'packaging',
  'unit_net_weight_g', 'unit_l_cm', 'unit_w_cm', 'unit_h_cm', 'units_per_carton',
  'carton_l_cm', 'carton_w_cm', 'carton_h_cm', 'carton_gross_weight_kg', 'cartons_per_pallet',
  'cartons_per_20ft', 'cartons_per_40ft', 'shipping_port', 'incoterm', 'hazmat_lithium', 'notes',
];

// The v2 example row (Bq Plus knee brace), hts_code + us_agent + gtin blank
// (Unite fills).
const V2_SAMPLE_VALUES = [
  'Adjustable Hinged Knee Brace', 'BQ-KB-200', 'Neoprene, universal, dual aluminum hinges, medical grade',
  'Medical > Orthopedic > Knee Brace', 'https://example.com/knee-brace.jpg',
  '2.85', 'USD', '5000', '2.70', '25000', '2.55', '800', '50', '10',
  '1000', '2026-12-31', '30% deposit / 70% before shipment', '9021.10', '',
  'CN', 'VN', '2', 'FPA', 'K210381', 'Bq Plus Medical Co. Ltd.', '#18 Cheye Rd Songjiang Shanghai CN',
  '3015058854', '', 'N', 'N', 'OTC', 'N', 'N', '36', 'ISO 13485; CE', '', 'Each (1 unit)',
  '180', '28', '20', '5', '100', '60', '40', '50', '12.5', '24', '900', '1900',
  'Shenzhen (Yantian)', 'FOB', 'N', '',
];

function v2Csv() {
  const quote = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return `${V2_HEADERS.join(',')}\n${V2_SAMPLE_VALUES.map(quote).join(',')}\n`;
}

test('every v2 master header maps exactly (zero fuzzy risk)', () => {
  const { map, meta, unmappedRequired } = resolveColumns(V2_HEADERS);
  assert.deepEqual(unmappedRequired, []);
  for (const h of V2_HEADERS) {
    const field = Object.entries(map).find(([, idx]) => V2_HEADERS[idx] === h)?.[0];
    assert.ok(field, `header "${h}" did not map to any canonical field`);
    assert.equal(meta[field].via, 'alias', `header "${h}" mapped via ${meta[field].via}, expected exact alias`);
  }
  // No cross-mapping: each canonical field maps to the identical header
  // except known synonyms (none in the v2 set — keys ARE the fields).
  for (const [field, idx] of Object.entries(map)) {
    assert.equal(V2_HEADERS[idx], field, `field ${field} grabbed header ${V2_HEADERS[idx]}`);
  }
});

test('v2 sample row parses with full Tier A + Tier B fidelity', () => {
  const res = parseVendorSheetText({ text: v2Csv(), filename: 'v2.csv', vendorHint: 'Pentastar' });
  assert.equal(res.ok, true);
  assert.equal(res.totals.accepted, 1);
  const l = res.lines[0];

  // Tier A
  assert.equal(l.name, 'Adjustable Hinged Knee Brace');
  assert.equal(l.fob, 2.85);
  assert.equal(l.fob_currency, 'USD');
  assert.equal(l.moq, 1000);
  assert.equal(l.country_of_origin, 'CN');
  assert.equal(l.fda_product_code, 'FPA');

  // Tier B — product/pricing
  assert.equal(l.model_no, 'BQ-KB-200');
  assert.equal(l.product_type, 'Medical > Orthopedic > Knee Brace');
  assert.deepEqual(l.price_breaks, [{ qty: 5000, fob: 2.70 }, { qty: 25000, fob: 2.55 }]);
  assert.equal(l.tooling_setup_cost_usd, 800);
  assert.equal(l.sample_cost_usd, 50);
  assert.equal(l.sample_lead_time_days, 10);
  assert.equal(l.payment_terms, '30% deposit / 70% before shipment');

  // Tier B — compliance
  assert.equal(l.device_class, '2');
  assert.equal(l.premarket_510k_or_exempt, 'K210381');
  assert.equal(l.actual_manufacturer_name, 'Bq Plus Medical Co. Ltd.');
  assert.equal(l.sterile, false);
  assert.equal(l.single_use, false);
  assert.equal(l.rx_or_otc, 'OTC');
  assert.equal(l.latex, false);
  assert.equal(l.shelf_life_months, 36);
  assert.equal(l.certifications, 'ISO 13485; CE');

  // Tier B — logistics / container math
  assert.equal(l.units_per_carton, 100);
  assert.equal(l.carton_cbm, 0.12);           // 60×40×50 cm
  assert.equal(l.carton_gross_weight_kg, 12.5);
  assert.equal(l.cartons_per_20ft, 900);
  assert.equal(l.shipping_port, 'Shenzhen (Yantian)');
  assert.equal(l.incoterm, 'FOB');
  assert.equal(l.hazmat_lithium, false);
});

test('HTS fix: blank hts_code + mfr HS code → hint, never the 6307.90 default', () => {
  const res = parseVendorSheetText({ text: v2Csv(), filename: 'v2.csv' });
  const l = res.lines[0];
  assert.equal(l.hts, '9021.10');            // 6-digit harmonized prefix of the mfr's code
  assert.equal(l.hts_source, 'mfr_hint');
  assert.equal(l.hts_pending, true);         // Unite must confirm the US HTSUS
  assert.equal(l.mfr_hs_code, '9021.10');
  assert.ok(res.warnings.some((w) => /US HTSUS pending/.test(w)));
});

test('HTS fix: vendor-supplied hts_code wins; nothing at all → flagged default', () => {
  const withHts = parseVendorSheetText({
    text: 'product_name,fob_price_usd,hts_code,mfr_hs_code\nBrace,2.85,9021.10.0050,902110\n',
  });
  assert.equal(withHts.lines[0].hts, '9021.10.0050');
  assert.equal(withHts.lines[0].hts_source, 'vendor');
  assert.equal(withHts.lines[0].hts_pending, false);

  const bare = parseVendorSheetText({ text: 'product_name,fob_price_usd\nBrace,2.85\n' });
  assert.equal(bare.lines[0].hts, '6307.90');
  assert.equal(bare.lines[0].hts_source, 'default');
  assert.equal(bare.lines[0].hts_pending, true);
  assert.ok(bare.warnings.some((w) => /no HS\/HTS code provided/.test(w)));
});

test('normalizeHsCode handles bare digits, dots, and 10-digit codes', () => {
  assert.equal(normalizeHsCode('902110'), '9021.10');
  assert.equal(normalizeHsCode('9021.10'), '9021.10');
  assert.equal(normalizeHsCode('9021100050'), '9021.10.0050');
  assert.equal(normalizeHsCode('90'), '');
  assert.equal(normalizeHsCode(''), '');
});

test('computeShipmentMetrics uses real carton math and falls back per line', () => {
  const cartonLine = {
    target_qty: 1000, units_per_carton: 100, carton_cbm: 0.12, carton_gross_weight_kg: 12.5,
  };
  const bareLine = { target_qty: 1000 };

  const exact = computeShipmentMetrics([cartonLine]);
  assert.equal(exact.cbm, 1.2);              // 10 cartons × 0.12
  assert.equal(exact.weight_kg, 125);        // 10 × 12.5
  assert.equal(exact.exact_lines, 1);

  const mixed = computeShipmentMetrics([cartonLine, bareLine]);
  assert.equal(mixed.exact_lines, 1);
  assert.equal(mixed.estimated_lines, 1);
  assert.equal(mixed.cbm, +(1.2 + 1000 * 0.0008).toFixed(2));
});

test('Y/N cells coerce to booleans; unknown stays null', () => {
  const res = parseVendorSheetText({
    text: 'product_name,fob_price_usd,sterile,single_use,latex\nItem,1.00,Y,no,maybe\n',
  });
  const l = res.lines[0];
  assert.equal(l.sterile, true);
  assert.equal(l.single_use, false);
  assert.equal(l.latex, null);
});

test('canonical field set covers the whole v2 spec', () => {
  for (const h of V2_HEADERS) {
    assert.ok(CANONICAL_FIELDS.includes(h), `missing canonical field: ${h}`);
  }
});
