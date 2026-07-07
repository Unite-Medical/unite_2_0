/**
 * Offer variants — the Unite Ready / Unite Custom fork (briefing §6).
 *
 * Every quoted line is presented as a transparent side-by-side, never a
 * bait-and-switch. Up to three variants per line:
 *
 *   in_stock      🟢 Unite Ready, in stock now — buy-now at the in-stock
 *                    price, any qty up to real availability. Only offered
 *                    when a SKU-match against Unite's EXISTING stock hits
 *                    (we never speculate).
 *   import_ready  🟡 Import, Unite's brand — the engine's landed-cost
 *                    quote as-is. Lower MOQ, faster, mid price.
 *   import_custom 🔵 Import, customer's brand — best unit price at
 *                    volume: price-break FOB + amortized tooling, longer
 *                    lead (sample → production → ocean), Unite handles
 *                    compliance FOR them (the value-add).
 *
 * Side-by-side pricing is mandatory (§6): all variants are stored on the
 * quote line so the UI always shows the trade-off grid.
 */

import { rankCatalog } from './matching.js';
import { availability } from './wms/availability.js';

// Same floor the engine enforces (quoting.js) — kept in sync via tests.
const MARGIN_FLOOR = 0.10;
// Sample + production days assumed for the custom path when the vendor
// didn't provide a production lead time.
const DEFAULT_PRODUCTION_DAYS = 30;
// SKU-match confidence gate — below this we don't assert an in-stock offer.
export const STOCK_MATCH_THRESHOLD = 45;

/**
 * FOB at a given quantity: walk the vendor's price breaks (ascending)
 * and use the deepest break the quantity qualifies for.
 */
export function fobAtQuantity(line, qty) {
  let fob = Number(line.fob) || 0;
  for (const b of line.price_breaks || []) {
    if (qty >= b.qty && b.fob > 0) fob = b.fob;
  }
  return fob;
}

/**
 * SKU-match a quote line against Unite's existing stock + catalog
 * (briefing §6 — buy-now only when we ACTUALLY have it).
 *
 * @returns {{ sku, name, score, available, price }|null}
 */
export function matchLineToStock(line) {
  const ranked = rankCatalog(line.name, { code: line.model_no || line.gtin || '', limit: 1 });
  const top = ranked[0];
  if (!top || top.score < STOCK_MATCH_THRESHOLD) return null;
  const available = availability.availableToPromise(top.product.sku);
  return {
    sku: top.product.sku,
    name: top.product.name,
    score: Math.round(top.score),
    available,
    price: Number(top.product.price) || null,
  };
}

function sell(landed, margin) {
  const raw = +(landed / (1 - margin)).toFixed(2);
  const floor = +(landed * (1 + MARGIN_FLOOR)).toFixed(2);
  return Math.max(raw, floor);
}

/**
 * Build the offer variants for one priced line.
 *
 * @param {object} opts
 * @param {object} opts.line       Parsed vendor line (Tier A+B fields)
 * @param {object} opts.priced     The engine's priced output for the line
 *                                 (cost_components, sell_per_unit, …)
 * @param {number} opts.margin     Tier margin (decimal)
 * @param {number} opts.transitDays Freight transit for the chosen mode
 * @param {object|null} [opts.stockMatch] Precomputed matchLineToStock result
 * @returns {Array<object>} offers, best-for-customer-speed first
 */
export function buildOfferVariants({ line, priced, margin, transitDays, stockMatch = undefined }) {
  const offers = [];
  const qty = line.target_qty || line.moq || 1;
  const match = stockMatch === undefined ? matchLineToStock(line) : stockMatch;

  // 🟢 In stock now — only when the SKU-match hits real availability.
  if (match && match.available > 0) {
    offers.push({
      kind: 'in_stock',
      label: 'In stock now · Unite Ready',
      brand: 'unite',
      sku: match.sku,
      matched_name: match.name,
      match_score: match.score,
      sell_per_unit: match.price ?? priced.sell_per_unit,
      moq: 1,
      max_qty: match.available,
      lead_time_days: 0,
      compliance: 'Already listed/UDI’d under Unite',
      customer_provides: 'Nothing — buy now',
    });
  }

  // 🟡 Import — Unite Ready (the engine's landed-cost line as-is).
  const productionDays = line.lead_time_days ?? DEFAULT_PRODUCTION_DAYS;
  offers.push({
    kind: 'import_ready',
    label: 'Import · Unite Ready',
    brand: 'unite',
    sell_per_unit: priced.sell_per_unit,
    landed_per_unit: priced.landed_per_unit,
    moq: line.moq || 1,
    lead_time_days: productionDays + (transitDays || 0),
    compliance: 'Unite handles (Unite listing)',
    customer_provides: 'Nothing beyond the PO',
  });

  // 🔵 Import — Unite Custom (customer's brand): price-break FOB at
  // volume + amortized tooling; customer eats the full import cycle.
  const customQty = Math.max(qty, line.moq || 1);
  const fobBreak = fobAtQuantity(line, customQty);
  const toolingPU = (Number(line.tooling_setup_cost_usd) || 0) / Math.max(1, customQty);
  const base = priced.cost_components || {};
  const customComponents = {
    ...base,
    fob: +fobBreak.toFixed(4),
    // Duty scales with FOB value.
    duty: +((Number(base.duty) || 0) * (fobBreak / (Number(base.fob) || fobBreak || 1))).toFixed(4),
    tooling_amortized: +toolingPU.toFixed(4),
  };
  const customLanded = +Object.values(customComponents).reduce((a, v) => a + (Number(v) || 0), 0).toFixed(4);
  const sampleDays = line.sample_lead_time_days ?? 10;
  offers.push({
    kind: 'import_custom',
    label: 'Import · Unite Custom (your brand)',
    brand: 'customer',
    sell_per_unit: sell(customLanded, margin),
    landed_per_unit: +customLanded.toFixed(2),
    cost_components: customComponents,
    moq: line.moq || 1,
    qty_basis: customQty,
    tooling_setup_cost_usd: Number(line.tooling_setup_cost_usd) || 0,
    lead_time_days: sampleDays + productionDays + (transitDays || 0),
    compliance: 'Unite does it FOR you (GS1 UPC / GUDID / label check)',
    customer_provides: 'Brand files + label approval',
  });

  return offers;
}
