/**
 * Quoting engine end-to-end — the whole briefing flow:
 * parsed v2 lines → FDA/HTS/301 validation → carton-math freight from the
 * sheet's port → priced landed cost with price breaks → Ready/Custom
 * offers → persisted quote → Flexport duty confirmation.
 *
 * External calls (openFDA / Flexport / Claude / FX) all degrade to their
 * deterministic offline stubs, so this runs without network or keys.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../src/lib/db.js';
import { parseVendorSheetText } from '../src/lib/vendorSheet.js';
import { runQuotingEngine, confirmQuoteDuty } from '../src/lib/quoting.js';
import { fobAtQuantity, buildOfferVariants } from '../src/lib/offers.js';

const V2_CSV = [
  'product_name,manufacturer_model_no,description,product_type,fob_price_usd,currency,'
    + 'price_break_qty_1,price_break_fob_1,price_break_qty_2,price_break_fob_2,'
    + 'tooling_setup_cost_usd,sample_lead_time_days,lead_time_days,moq,target_quantity,'
    + 'mfr_hs_code,hts_code,country_of_origin,device_class,fda_product_code,'
    + 'units_per_carton,carton_l_cm,carton_w_cm,carton_h_cm,carton_gross_weight_kg,'
    + 'shipping_port,incoterm',
  'Adjustable Hinged Knee Brace,BQ-KB-200,"Neoprene, dual hinges",Medical > Orthopedic,'
    + '2.85,USD,5000,2.70,25000,2.55,800,10,30,1000,5000,9021.10,,CN,2,KGN,'
    + '100,60,40,50,12.5,Shenzhen (Yantian),FOB',
  'N95 Respirator Fluid-Resistant,PS-N95-01,Flat-fold fluid resistant,Medical > PPE,'
    + '0.21,USD,,,,,0,5,20,50000,50000,630790,,CN,1,MSH,'
    + '500,55,35,45,8,Shenzhen (Yantian),FOB',
].join('\n');

test('fobAtQuantity walks the price breaks', () => {
  const line = { fob: 2.85, price_breaks: [{ qty: 5000, fob: 2.70 }, { qty: 25000, fob: 2.55 }] };
  assert.equal(fobAtQuantity(line, 1000), 2.85);
  assert.equal(fobAtQuantity(line, 5000), 2.70);
  assert.equal(fobAtQuantity(line, 30000), 2.55);
  assert.equal(fobAtQuantity({ fob: 1.5 }, 99999), 1.5);
});

test('buildOfferVariants always shows the Ready/Custom side-by-side', () => {
  const line = {
    name: 'Zirconium widget', fob: 2.85, moq: 1000, target_qty: 5000,
    price_breaks: [{ qty: 5000, fob: 2.70 }],
    tooling_setup_cost_usd: 800, sample_lead_time_days: 10, lead_time_days: 30,
  };
  const priced = {
    ...line,
    sell_per_unit: 6.5, landed_per_unit: 3.6,
    cost_components: { fob: 2.85, duty: 0.93, ocean_freight: 0.05, customs_brokerage: 0.01, drayage: 0.005, warehouse_receiving: 0.25 },
  };
  const offers = buildOfferVariants({ line, priced, margin: 0.30, transitDays: 28, stockMatch: null });
  const kinds = offers.map((o) => o.kind);
  assert.deepEqual(kinds, ['import_ready', 'import_custom']); // no fake in-stock

  const ready = offers.find((o) => o.kind === 'import_ready');
  const custom = offers.find((o) => o.kind === 'import_custom');
  assert.equal(ready.lead_time_days, 58);           // 30 production + 28 transit
  assert.equal(custom.lead_time_days, 68);          // +10 sample
  // Custom uses the price-break FOB (2.70) + amortized tooling (800/5000).
  assert.equal(custom.cost_components.fob, 2.70);
  assert.equal(custom.cost_components.tooling_amortized, 0.16);
  // Duty scaled with the lower FOB.
  assert.ok(custom.cost_components.duty < priced.cost_components.duty);
  assert.ok(custom.sell_per_unit > 0);

  // In-stock offer appears only with real availability.
  const withStock = buildOfferVariants({
    line, priced, margin: 0.30, transitDays: 28,
    stockMatch: { sku: 'KGN-200', name: 'Knee Brace', score: 80, available: 42, price: 24.99 },
  });
  assert.equal(withStock[0].kind, 'in_stock');
  assert.equal(withStock[0].max_qty, 42);
  assert.equal(withStock[0].lead_time_days, 0);
});

test('engine end-to-end: v2 sheet → priced quote with 301, carton freight, offers', async () => {
  const parsed = parseVendorSheetText({ text: V2_CSV, filename: 'pentastar.csv', vendorHint: 'Pentastar' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.lines.length, 2);

  const progress = [];
  const res = await runQuotingEngine({
    vendor: 'Pentastar Medical',
    customer_name: 'Atlanta Surgical Center',
    contact_name: 'Mariah Patel',
    customer_tier: 'A',
    classifyFda: false,
    lines: parsed.lines,
    onProgress: (s) => progress.push(s),
  });

  const [brace, n95] = res.lines;

  // Duty = USITC MFN + Section 301 pre-filter.
  // Knee brace: 9021.10 → 0% MFN + 7.5% (List 4A).
  assert.equal(brace.duty_components.mfn, 0);
  assert.equal(brace.duty_components.section_301, 7.5);
  assert.equal(brace.duty_pct, 7.5);
  assert.equal(brace.section_301_list, '4A');
  // N95: 6307.90 → 7% MFN + 25% (List 3) = 32%.
  assert.equal(n95.duty_components.mfn, 7);
  assert.equal(n95.duty_components.section_301, 25);
  assert.equal(n95.duty_pct, 32);
  assert.equal(n95.chapter99, '9903.88.03');

  // Nothing is confirmed until the Flexport classification pass.
  assert.equal(brace.duty_confirmed, false);
  assert.equal(res.quote.duty_confirmed, false);
  assert.equal(res.quote.section_301_lines, 2);

  // Price break honored: 5,000 units → $2.70 FOB, duty on the break price.
  assert.equal(brace.fob_effective, 2.70);
  assert.equal(brace.price_break_applied, true);
  assert.equal(brace.cost_components.fob, 2.70);
  assert.equal(brace.cost_components.duty, +(2.70 * 0.075).toFixed(4));

  // Freight uses the sheet's port + real carton math:
  // brace: 50 cartons × 0.12 = 6 CBM; n95: 100 × 0.0866 ≈ 8.66 CBM.
  assert.equal(res.quote.origin_port, 'CNYTN');
  assert.ok(res.quote.shipment_cbm > 14 && res.quote.shipment_cbm < 15.5,
    `expected carton-math CBM ≈ 14.66, got ${res.quote.shipment_cbm}`);
  assert.ok(res.quote.shipment_weight_kg >= 1400, 'expected gross-weight-based kg');

  // Offers: every line carries the Ready/Custom side-by-side.
  for (const line of res.lines) {
    const kinds = line.offers.map((o) => o.kind);
    assert.ok(kinds.includes('import_ready'));
    assert.ok(kinds.includes('import_custom'));
    assert.ok('stock_match' in line);
  }

  // Margin floor + tier margin applied; quote persisted with items.
  assert.ok(res.lines.every((l) => l.sell_per_unit > l.landed_per_unit));
  const items = db.list('quote_items', { where: { quote_id: res.quote.id } });
  assert.equal(items.length, 2);
  assert.ok(items[0].offers?.length >= 2);

  // Flexport duty confirmation (stub path) keeps pricing consistent.
  const confirmed = await confirmQuoteDuty(res.quote.id, { actor: 'test' });
  assert.equal(confirmed.ok, true);
  const freshBrace = confirmed.items.find((it) => it.model_no === 'BQ-KB-200');
  assert.equal(freshBrace.duty_pct, 7.5); // stub resolves to the same pre-filter math
  assert.equal(freshBrace.hts_pending, false);
  const audit = db.list('audit_log', { where: { kind: 'quote.duty_confirmed' } });
  assert.ok(audit.some((a) => a.ref_id === res.quote.id));
});
