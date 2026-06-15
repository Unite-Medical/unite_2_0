/**
 * Global Quoting Engine — the "core IP" from Section 8 of the brief.
 * Orchestrates openFDA → USITC HTS → freight (mode comparison) →
 * 6-component landed cost → tier margin → Claude letter → persistence.
 *
 * PRD-16 upgrades over v2:
 *   - Landed cost is now 6 real components (was fob*(1+duty) + $0.42 flat):
 *       fob + duty + ocean_freight + customs_brokerage + drayage
 *       + warehouse_receiving — every component stored + auditable.
 *   - Freight compares LCL vs FCL and picks the cheaper per-unit option.
 *   - Margin resolves from the customer's tier (A/B/C/distributor/gov)
 *     via the margin policy, with a hard 10% floor enforced per line.
 */

import { db } from './db.js';
import { openfda, hts, flexport, claude } from './services.js';
import { delay, uid } from './format.js';
import { loadMarginPolicy, marginForTier, applyMargin } from './marginPolicy.js';
import { ai } from './ai/client.js';

/**
 * Fill missing FDA product codes via Claude (PRD-19). Lines flagged
 * `fda_inferred` (no code supplied by the vendor) get a best-guess code
 * + device class so the openFDA validation step has something real to
 * check. Best-effort: failures leave the inferred default in place.
 */
export async function classifyMissingFdaCodes(lines, { onProgress = () => {} } = {}) {
  const targets = lines.filter((l) => l.fda_inferred);
  if (targets.length === 0) return { classified: 0 };
  onProgress({ step: 'fda_classify', label: `Classifying ${targets.length} line(s) with no FDA code…` });
  let classified = 0;
  for (const line of targets) {
    try {
      const { data } = await ai.run('quoting/fda_classify', {
        input: {
          product_name: line.name,
          description: line.description || '',
          country_of_origin: line.country_of_origin || '',
          hts_code: line.hts || '',
        },
        source: 'quoting-engine',
      });
      if (data?.primary?.product_code) {
        line.fda_product_code = String(data.primary.product_code).toUpperCase();
        line.device_class = data.primary.device_class;
        line.fda_confidence = data.primary.confidence;
        line.fda_classified = true;
        classified += 1;
      }
    } catch { /* keep inferred default */ }
  }
  return { classified };
}

export const TARGET_MARGIN = 0.60; // legacy default (tier C) — kept for callers/tests

// Per-unit warehouse receiving handling (PRD-16 §8 Phase 4). Admin-tunable.
export const WAREHOUSE_RECEIVING_PER_UNIT = 0.25;
// Minimum margin floor — no line may sell below landed × (1 + this).
export const MARGIN_FLOOR = 0.10;
// How total freight decomposes into landed-cost components.
const FREIGHT_SPLIT = { ocean: 0.78, brokerage: 0.14, drayage: 0.08 };

/** Estimate shipment CBM from line items (rough; real CBM comes from the
 *  vendor's packaging data when present). */
function estimateCbm(lines) {
  const units = lines.reduce((a, l) => a + (l.target_qty || l.moq || 1), 0);
  // ~0.0008 m³/unit average for mixed medical disposables, min 1 CBM.
  return Math.max(1, +(units * 0.0008).toFixed(2));
}

/** Pick the cheapest freight rate across the offered modes, per total units. */
function cheapestFreight(quotes) {
  let best = null;
  for (const q of quotes) {
    const rate = (q?.data?.rates || [])
      .slice()
      .sort((a, b) => a.total_usd - b.total_usd)[0];
    if (!rate) continue;
    const candidate = { mode: q.data.mode, total_usd: rate.total_usd, transit_days: rate.transit_days, valid_until: rate.valid_until, quote_id: q.data.id };
    if (!best || candidate.total_usd < best.total_usd) best = candidate;
  }
  return best;
}

export async function runQuotingEngine({
  vendor,
  customer_name = 'Atlanta Surgical Center',
  contact_name = 'Mariah Patel',
  customer_tier = 'C',
  warehouse_receiving_per_unit = WAREHOUSE_RECEIVING_PER_UNIT,
  classifyFda = true,
  lines = [],
  onProgress = () => {},
}) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('No lines to quote.');

  const policy = loadMarginPolicy();
  const margin = marginForTier(customer_tier, policy);

  onProgress({ step: 'parse', label: `Parsed ${lines.length} line items` });
  await delay(180, 300);

  // 0) Fill missing FDA codes (PRD-19) before validation.
  if (classifyFda) await classifyMissingFdaCodes(lines, { onProgress });

  // 1) FDA validation
  onProgress({ step: 'openfda', label: 'Validating FDA product codes' });
  const fda = await Promise.all(lines.map((l) => openfda.classification(l.fda_product_code || 'KGN')));
  const cleared = fda.filter((r) => r.results.length).length;
  onProgress({ step: 'openfda', label: `${cleared}/${lines.length} cleared` });

  // 2) HTS duty rates
  onProgress({ step: 'hts', label: 'Pulling USITC duty rates' });
  const dutyRates = await Promise.all(lines.map((l) => hts.lookup(l.hts || '6307.90')));
  const avgDuty = dutyRates.reduce((a, r) => a + r.mfn, 0) / dutyRates.length;
  onProgress({ step: 'hts', label: `Avg ${avgDuty.toFixed(1)}%` });

  // 3) Freight — compare LCL vs FCL, pick cheapest
  onProgress({ step: 'flexport', label: 'Requesting freight quotes (LCL + FCL)' });
  const cbm = estimateCbm(lines);
  const totalUnits = Math.max(1, lines.reduce((a, l) => a + (l.target_qty || l.moq || 1), 0));
  const [lcl, fcl] = await Promise.all([
    flexport.getFreightQuote({ origin: 'CNSHA', destination: 'USATL', mode: 'LCL', cbm }),
    flexport.getFreightQuote({ origin: 'CNSHA', destination: 'USATL', mode: 'FCL', cbm }),
  ]);
  const freight = cheapestFreight([lcl, fcl]) || { mode: 'LCL', total_usd: 0, transit_days: 28, valid_until: null, quote_id: null };
  onProgress({ step: 'flexport', label: `${freight.mode} $${Math.round(freight.total_usd).toLocaleString()} · ${freight.transit_days}d` });

  // Per-unit freight components (allocated across all units in the shipment).
  const oceanPU = +((freight.total_usd * FREIGHT_SPLIT.ocean) / totalUnits).toFixed(4);
  const brokeragePU = +((freight.total_usd * FREIGHT_SPLIT.brokerage) / totalUnits).toFixed(4);
  const drayagePU = +((freight.total_usd * FREIGHT_SPLIT.drayage) / totalUnits).toFixed(4);
  const receivingPU = +Number(warehouse_receiving_per_unit || 0).toFixed(4);

  // 4) Landed cost (6 components) + tier margin + floor
  onProgress({ step: 'margin', label: `Applying ${Math.round(margin * 100)}% margin (tier ${customer_tier})` });
  const priced = lines.map((l, i) => {
    const dutyPct = dutyRates[i].mfn / 100;
    const dutyPU = +(l.fob * dutyPct).toFixed(4);
    const landed = +(l.fob + dutyPU + oceanPU + brokeragePU + drayagePU + receivingPU).toFixed(4);
    let sell = applyMargin(landed, margin);
    // Floor enforcement — never sell below landed × (1 + MARGIN_FLOOR).
    const floor = +(landed * (1 + MARGIN_FLOOR)).toFixed(2);
    let floored = false;
    if (sell < floor) { sell = floor; floored = true; }
    const qty = l.target_qty || l.moq || 1;
    return {
      ...l,
      duty_pct: dutyRates[i].mfn,
      hts_desc: dutyRates[i].description,
      cost_components: {
        fob: +l.fob.toFixed(4),
        duty: dutyPU,
        ocean_freight: oceanPU,
        customs_brokerage: brokeragePU,
        drayage: drayagePU,
        warehouse_receiving: receivingPU,
      },
      landed_per_unit: +landed.toFixed(2),
      margin_pct: margin,
      margin_floored: floored,
      sell_per_unit: sell,
      ext_sell: +(sell * qty).toFixed(2),
    };
  });

  const total = +priced.reduce((a, p) => a + p.ext_sell, 0).toFixed(2);
  const totalLanded = +priced.reduce((a, p) => a + p.landed_per_unit * (p.target_qty || p.moq || 1), 0).toFixed(2);

  // 5) Claude cover letter
  onProgress({ step: 'claude', label: 'Drafting cover letter' });
  const etaIso = new Date(Date.now() + freight.transit_days * 86400000).toISOString();
  const letter = await claude.generateQuoteLetter({
    customer_name, contact_name,
    product_count: priced.length,
    total_usd: total,
    eta_iso: etaIso,
  });

  // 6) Persist
  const quoteId = `Q-26-${String(284 + db.count('quotes')).padStart(5, '0')}`;
  const quote = db.insert('quotes', {
    id: quoteId,
    vendor,
    customer_name,
    contact_name,
    customer_tier,
    line_count: priced.length,
    total,
    total_landed: totalLanded,
    margin_target: margin,
    freight_mode: freight.mode,
    freight_total: +Number(freight.total_usd).toFixed(2),
    freight_quote_id: freight.quote_id,
    freight_valid_until: freight.valid_until,
    cover_letter: letter.content,
    status: 'draft',
    acceptance_token: `${uid('qt')}-${Math.random().toString(36).slice(2, 12)}`,
    valid_until: new Date(Date.now() + (policy.quote_validity_days || 14) * 86400000).toISOString(),
    eta: etaIso,
  });
  priced.forEach((p, idx) => db.insert('quote_items', { id: `${quoteId}-li-${idx}`, quote_id: quoteId, ...p }));

  onProgress({ step: 'done', label: `Quote ${quoteId} drafted` });

  return { quote, lines: priced, freight, dutyRates, fda };
}

/**
 * Multi-vendor comparison (PRD-16 §8 stretch). Given priced line sets
 * from several vendors, group by product (normalized name or GTIN) and
 * pick the cheapest landed cost per product, reporting the savings vs the
 * most expensive offer. Pure + synchronous — feeds a compare UI.
 *
 * @param {{ vendor:string, lines:Array }[]} offers
 * @returns {{ products: Array, total_best_landed:number, total_savings:number }}
 */
export function compareVendorOffers(offers = []) {
  const groups = new Map();
  for (const offer of offers) {
    for (const line of offer.lines || []) {
      const key = (line.gtin || line.name || '').toString().trim().toLowerCase();
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { product: line.name, gtin: line.gtin || null, candidates: [] });
      groups.get(key).candidates.push({
        vendor: offer.vendor,
        landed_per_unit: Number(line.landed_per_unit ?? line.fob) || 0,
        fob: Number(line.fob) || 0,
        lead_time_days: line.lead_time_days ?? null,
        sell_per_unit: line.sell_per_unit ?? null,
      });
    }
  }

  const products = [];
  let totalBest = 0;
  let totalSavings = 0;
  for (const g of groups.values()) {
    const sorted = g.candidates.slice().sort((a, b) => a.landed_per_unit - b.landed_per_unit);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const savings = +(worst.landed_per_unit - best.landed_per_unit).toFixed(4);
    totalBest += best.landed_per_unit;
    totalSavings += savings;
    products.push({
      product: g.product,
      gtin: g.gtin,
      best_vendor: best.vendor,
      best_landed: best.landed_per_unit,
      offers: sorted,
      savings_per_unit: savings,
      savings_pct: worst.landed_per_unit > 0 ? +(savings / worst.landed_per_unit * 100).toFixed(1) : 0,
    });
  }

  return { products, total_best_landed: +totalBest.toFixed(2), total_savings: +totalSavings.toFixed(2) };
}

export const SAMPLE_VENDOR_SHEET = {
  vendor: 'Sample Manufacturer',
  lines: [
    { name: 'Compression stockings 20-30mmHg', fob: 2.40, moq: 5000, hts: '6115.10', target_qty: 5000, fda_product_code: 'NHM' },
    { name: 'Thermometer probes, disposable', fob: 0.08, moq: 25000, hts: '9025.19', target_qty: 25000, fda_product_code: 'KGN' },
    { name: 'Cold/hot therapy gel pack 6×10', fob: 0.94, moq: 2000, hts: '3824.99', target_qty: 2000, fda_product_code: 'KGN' },
    { name: 'N95 respirator, fluid-resistant', fob: 0.21, moq: 50000, hts: '6307.90', target_qty: 50000, fda_product_code: 'NHM' },
  ],
};
