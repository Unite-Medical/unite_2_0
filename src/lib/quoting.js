/**
 * Global Quoting Engine — the "core IP" from Section 8 of the brief.
 * Orchestrates openFDA → USITC HTS → our freight forwarder → margin → Claude letter.
 */

import { db } from './db.js';
import { openfda, hts, flexport, claude } from './services.js';
import { delay } from './format.js';

export const TARGET_MARGIN = 0.60; // 60% target enforced programmatically
const FREIGHT_PER_UNIT_USD = 0.42; // simulated drayage + brokerage fold-in

export async function runQuotingEngine({ vendor, customer_name = 'Atlanta Surgical Center', contact_name = 'Mariah Patel', lines = [], onProgress = () => {} }) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('No lines to quote.');

  onProgress({ step: 'parse', label: `Parsed ${lines.length} line items` });
  await delay(180, 300);

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

  // 3) our freight forwarder freight
  onProgress({ step: 'flexport', label: 'Requesting freight quote' });
  const freight = await flexport.getFreightQuote({ origin: 'CNSHA', destination: 'USATL', mode: 'LCL', cbm: 1.8 });
  const freightTotal = freight.data.rates[0].total_usd;
  onProgress({ step: 'flexport', label: `LCL $${Math.round(freightTotal).toLocaleString()}` });

  // 4) Landed cost + margin
  const priced = lines.map((l, i) => {
    const duty = dutyRates[i].mfn / 100;
    const landed = +(l.fob * (1 + duty) + FREIGHT_PER_UNIT_USD).toFixed(2);
    const sell = +(landed / (1 - TARGET_MARGIN)).toFixed(2); // 60% margin = sell = landed / 0.4
    return { ...l, duty_pct: dutyRates[i].mfn, hts_desc: dutyRates[i].description, landed_per_unit: landed, sell_per_unit: sell, ext_sell: +(sell * (l.target_qty || l.moq || 1)).toFixed(2) };
  });

  const total = +priced.reduce((a, p) => a + p.ext_sell, 0).toFixed(2);

  // 5) Claude cover letter
  onProgress({ step: 'claude', label: 'Drafting cover letter' });
  const letter = await claude.generateQuoteLetter({
    customer_name, contact_name,
    product_count: priced.length,
    total_usd: total,
    eta_iso: new Date(Date.now() + freight.data.rates[0].transit_days * 86400000).toISOString(),
  });

  // 6) Persist
  const quoteId = `Q-26-${String(284 + db.count('quotes')).padStart(5, '0')}`;
  const quote = db.insert('quotes', {
    id: quoteId,
    vendor,
    customer_name,
    contact_name,
    line_count: priced.length,
    total,
    margin_target: TARGET_MARGIN,
    freight_total: +freightTotal.toFixed(2),
    cover_letter: letter.content,
    status: 'draft',
    eta: new Date(Date.now() + freight.data.rates[0].transit_days * 86400000).toISOString(),
  });
  priced.forEach((p, idx) => db.insert('quote_items', { id: `${quoteId}-li-${idx}`, quote_id: quoteId, ...p }));

  onProgress({ step: 'done', label: `Quote ${quoteId} drafted` });

  return { quote, lines: priced, freight: freight.data, dutyRates, fda };
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
