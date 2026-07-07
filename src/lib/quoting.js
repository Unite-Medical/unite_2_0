/**
 * Global Quoting Engine — the "core IP" from Section 8 of the brief.
 * Orchestrates openFDA → USITC HTS → freight (mode comparison) →
 * 6-component landed cost → tier margin → Claude letter → persistence.
 *
 * PRD-16 upgrades over v2:
 *   - Landed cost is now 6 real components (was fob*(1+duty) + $0.42 flat):
 *       fob + duty + ocean_freight + customs_brokerage + drayage
 *       + warehouse_receiving — every component stored + auditable.
 *   - Freight compares LCL vs FCL vs AIR; all options are stored on the
 *     quote (`freight_options`) so the desk can switch modes and reprice.
 *   - Margin resolves from the customer's tier (A/B/C/distributor/gov)
 *     via the margin policy, with a hard 10% floor enforced per line.
 *
 * PRD-16 Phase 5–7 (this pass):
 *   - Tier auto-resolves from the customer's org record (`resolveOrgTier`).
 *   - `repriceQuote` — rep margin override + freight-mode switch, floor
 *     enforced, manager-approval flag when priced below tier default,
 *     every change audit-logged.
 *   - `refreshQuote` — expired quote → fresh freight + validity window.
 *   - `applyCounterOffers` — accept a customer counter at the desk.
 *   - Per-line compliance stored: fda_validated, device_class,
 *     regulation_number, gtin_validated.
 */

import { db } from './db.js';
import { openfda, hts, flexport, claude } from './services.js';
import { delay, uid } from './format.js';
import { loadMarginPolicy, marginForTier, applyMargin } from './marginPolicy.js';
import { isValidGtin } from './external/gs1.js';
import { ai } from './ai/client.js';
import { section301Lookup } from './external/section301.js';
import { portCodeFor } from './external/flexport.js';
import { computeShipmentMetrics } from './vendorSheet.js';
import { buildOfferVariants, fobAtQuantity, matchLineToStock } from './offers.js';

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

/** Normalize one Flexport quote response into a comparable option. */
function toFreightOption(q) {
  const rate = (q?.data?.rates || []).slice().sort((a, b) => a.total_usd - b.total_usd)[0];
  if (!rate) return null;
  return { mode: q.data.mode, total_usd: rate.total_usd, transit_days: rate.transit_days, valid_until: rate.valid_until, quote_id: q.data.id };
}

/**
 * Select a freight option by preference:
 *   'cheapest' (default) · 'fastest' · explicit mode ('LCL'|'FCL'|'AIR')
 */
export function selectFreightOption(options, preference = 'cheapest') {
  const valid = (options || []).filter(Boolean);
  if (!valid.length) return null;
  if (preference === 'fastest') return valid.slice().sort((a, b) => a.transit_days - b.transit_days)[0];
  const byMode = valid.find((o) => o.mode === preference);
  if (byMode) return byMode;
  return valid.slice().sort((a, b) => a.total_usd - b.total_usd)[0];
}

/**
 * Resolve the customer's org record + tier (PRD-16 Phase 5). Matches by
 * org id first, then exact name. Falls back to the supplied tier.
 */
export function resolveOrgTier({ org_id = null, customer_name = '', fallback_tier = 'C' } = {}) {
  let org = null;
  if (org_id) org = db.get('organizations', org_id) || null;
  if (!org && customer_name) {
    const needle = customer_name.trim().toLowerCase();
    org = db.list('organizations').find((o) => (o.name || '').trim().toLowerCase() === needle) || null;
  }
  if (org) {
    // Government terms trump the letter tier — BPA pricing per policy.
    const tier = org.terms === 'mspv' ? 'gov' : org.segment === 'distributors' ? 'distributor' : org.tier || fallback_tier;
    return { org, tier, resolved: true };
  }
  return { org: null, tier: fallback_tier, resolved: false };
}

/** Per-unit freight components for a given freight option + unit count. */
function freightComponents(option, totalUnits) {
  const total = Number(option?.total_usd) || 0;
  const units = Math.max(1, totalUnits);
  return {
    ocean_freight: +((total * FREIGHT_SPLIT.ocean) / units).toFixed(4),
    customs_brokerage: +((total * FREIGHT_SPLIT.brokerage) / units).toFixed(4),
    drayage: +((total * FREIGHT_SPLIT.drayage) / units).toFixed(4),
  };
}

/** Price one line from its cost components at a margin, enforcing the floor. */
function priceLine(components, margin) {
  const landed = +Object.values(components).reduce((a, v) => a + (Number(v) || 0), 0).toFixed(4);
  let sell = applyMargin(landed, margin);
  const floor = +(landed * (1 + MARGIN_FLOOR)).toFixed(2);
  const floored = sell < floor;
  if (floored) sell = floor;
  return { landed: +landed.toFixed(2), sell, floored };
}

export async function runQuotingEngine({
  vendor,
  customer_name = 'Atlanta Surgical Center',
  contact_name = 'Mariah Patel',
  customer_tier = null,
  org_id = null,
  freight_preference = 'cheapest',
  warehouse_receiving_per_unit = WAREHOUSE_RECEIVING_PER_UNIT,
  classifyFda = true,
  lines = [],
  onProgress = () => {},
}) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('No lines to quote.');

  const policy = loadMarginPolicy();

  // 0a) Tier — auto-resolve from the customer's org record (Phase 5);
  //     an explicitly supplied tier wins over the fallback but a matched
  //     org record wins over both.
  const resolved = resolveOrgTier({ org_id, customer_name, fallback_tier: customer_tier || 'C' });
  const tier = resolved.resolved ? resolved.tier : (customer_tier || 'C');
  const margin = marginForTier(tier, policy);
  if (resolved.resolved) {
    onProgress({ step: 'tier', label: `Customer record matched — tier ${tier} (${Math.round(margin * 100)}% margin)` });
  }

  onProgress({ step: 'parse', label: `Parsed ${lines.length} line items` });
  await delay(180, 300);

  // 0b) Fill missing FDA codes (PRD-19) before validation.
  if (classifyFda) await classifyMissingFdaCodes(lines, { onProgress });

  // 1) FDA validation
  onProgress({ step: 'openfda', label: 'Validating FDA product codes' });
  const fda = await Promise.all(lines.map((l) => openfda.classification(l.fda_product_code || 'KGN')));
  const cleared = fda.filter((r) => r.results.length).length;
  onProgress({ step: 'openfda', label: `${cleared}/${lines.length} cleared` });

  // 2) HTS duty rates — USITC MFN + Section 301 pre-filter (briefing §3).
  //    The 301 layer is free + deterministic; Flexport classification
  //    confirms the full duty before a quote is committed.
  onProgress({ step: 'hts', label: 'Pulling USITC duty rates' });
  const dutyRates = await Promise.all(lines.map((l) => hts.lookup(l.hts || '6307.90')));
  const s301 = lines.map((l, i) => section301Lookup(dutyRates[i].hts_code || l.hts, l.country_of_origin));
  const avgDuty = dutyRates.reduce((a, r, i) => a + r.mfn + (s301[i].applies ? s301[i].rate_pct : 0), 0) / dutyRates.length;
  const s301Count = s301.filter((s) => s.applies).length;
  onProgress({
    step: 'hts',
    label: `Avg ${avgDuty.toFixed(1)}% incl. duties${s301Count ? ` · Section 301 pre-filter hit ${s301Count} line(s) — Flexport confirms before commit` : ''}`,
  });

  // 3) Freight — LCL vs FCL vs AIR, all options kept for the desk.
  //    CBM/weight use the vendor's real carton data when present (Tier B);
  //    origin resolves from the sheet's shipping_port.
  const totalUnits = Math.max(1, lines.reduce((a, l) => a + (l.target_qty || l.moq || 1), 0));
  const metrics = computeShipmentMetrics(lines);
  const cbm = metrics.cbm;
  const weightKg = metrics.weight_kg;
  const portCounts = new Map();
  for (const l of lines) {
    if (!l.shipping_port) continue;
    portCounts.set(l.shipping_port, (portCounts.get(l.shipping_port) || 0) + 1);
  }
  const topPort = [...portCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const originPort = portCodeFor(topPort, 'CNSHA');
  onProgress({
    step: 'flexport',
    label: `Requesting freight quotes (LCL + FCL + AIR) · ${originPort} → USATL · ${cbm} CBM / ${weightKg} kg`
      + (metrics.exact_lines ? ` (carton math on ${metrics.exact_lines}/${lines.length} lines)` : ' (estimated)'),
  });
  const [lcl, fcl, air] = await Promise.all([
    flexport.getFreightQuote({ origin: originPort, destination: 'USATL', mode: 'LCL', cbm, weight_kg: weightKg }),
    flexport.getFreightQuote({ origin: originPort, destination: 'USATL', mode: 'FCL', cbm, weight_kg: weightKg }),
    flexport.getFreightQuote({ origin: originPort, destination: 'USATL', mode: 'AIR', cbm, weight_kg: weightKg }),
  ]);
  const freightOptions = [lcl, fcl, air].map(toFreightOption).filter(Boolean);
  const freight = selectFreightOption(freightOptions, freight_preference)
    || { mode: 'LCL', total_usd: 0, transit_days: 28, valid_until: null, quote_id: null };
  onProgress({ step: 'flexport', label: `${freight.mode} $${Math.round(freight.total_usd).toLocaleString()} · ${freight.transit_days}d (${freightOptions.length} modes compared)` });

  // Per-unit freight components (allocated across all units in the shipment).
  const { ocean_freight: oceanPU, customs_brokerage: brokeragePU, drayage: drayagePU } = freightComponents(freight, totalUnits);
  const receivingPU = +Number(warehouse_receiving_per_unit || 0).toFixed(4);

  // 4) Landed cost (6 components) + tier margin + floor.
  //    Duty = USITC MFN + Section 301 pre-filter; FOB honors the vendor's
  //    price breaks at the quoted quantity (Tier B).
  onProgress({ step: 'margin', label: `Applying ${Math.round(margin * 100)}% margin (tier ${tier})` });
  const priced = lines.map((l, i) => {
    const qty = l.target_qty || l.moq || 1;
    const fobEffective = fobAtQuantity(l, qty);
    const mfnPct = dutyRates[i].mfn;
    const s301Pct = s301[i].applies ? s301[i].rate_pct : 0;
    const dutyPct = (mfnPct + s301Pct) / 100;
    const dutyPU = +(fobEffective * dutyPct).toFixed(4);
    const components = {
      fob: +fobEffective.toFixed(4),
      duty: dutyPU,
      ocean_freight: oceanPU,
      customs_brokerage: brokeragePU,
      drayage: drayagePU,
      warehouse_receiving: receivingPU,
    };
    const { landed, sell, floored } = priceLine(components, margin);
    const fdaHit = fda[i]?.results?.[0] || null;
    return {
      ...l,
      fob_effective: +fobEffective.toFixed(4),
      price_break_applied: fobEffective !== l.fob,
      duty_pct: +(mfnPct + s301Pct).toFixed(2),
      duty_components: { mfn: mfnPct, section_301: s301Pct },
      section_301_list: s301[i].list,
      chapter99: s301[i].chapter99,
      // False until Flexport classification confirms (incl. exclusions).
      duty_confirmed: !s301[i].needs_confirmation && !l.hts_pending,
      hts_desc: dutyRates[i].description,
      cost_components: components,
      // Per-line compliance evidence (PRD-16 compliance panel).
      fda_validated: Boolean(fdaHit),
      device_class: fdaHit?.device_class || l.device_class || null,
      regulation_number: fdaHit?.regulation_number || null,
      gtin_validated: l.gtin ? isValidGtin(l.gtin) : null,
      landed_per_unit: landed,
      margin_pct: margin,
      margin_floored: floored,
      sell_per_unit: sell,
      ext_sell: +(sell * qty).toFixed(2),
    };
  });

  // 4b) SKU-match + offer variants (briefing §6) — every line carries the
  //     Unite Ready / Unite Custom side-by-side; in-stock buy-now appears
  //     only when the match hits real availability.
  onProgress({ step: 'offers', label: 'SKU-matching against Unite stock + building Ready/Custom offers' });
  let stockHits = 0;
  for (const p of priced) {
    const stockMatch = matchLineToStock(p);
    p.stock_match = stockMatch;
    p.offers = buildOfferVariants({
      line: p, priced: p, margin,
      transitDays: freight.transit_days,
      stockMatch,
    });
    if (stockMatch && stockMatch.available > 0) stockHits += 1;
  }
  if (stockHits) onProgress({ step: 'offers', label: `${stockHits} line(s) in stock now — buy-now offered` });

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
    customer_id: resolved.org?.id || null,
    customer_tier: tier,
    tier_resolved: resolved.resolved,
    line_count: priced.length,
    total,
    total_landed: totalLanded,
    total_units: totalUnits,
    margin_target: margin,
    origin_port: originPort,
    shipment_cbm: cbm,
    shipment_weight_kg: weightKg,
    // Any line with unconfirmed HTS/301 flags the whole quote for the
    // Flexport classification pass before it can be committed.
    duty_confirmed: priced.every((p) => p.duty_confirmed),
    section_301_lines: priced.filter((p) => (p.duty_components?.section_301 || 0) > 0).length,
    stock_match_lines: stockHits,
    freight_mode: freight.mode,
    freight_total: +Number(freight.total_usd).toFixed(2),
    freight_quote_id: freight.quote_id,
    freight_valid_until: freight.valid_until,
    freight_options: freightOptions,
    warehouse_receiving_per_unit: receivingPU,
    cover_letter: letter.content,
    status: 'draft',
    revision: 1,
    acceptance_token: `${uid('qt')}-${Math.random().toString(36).slice(2, 12)}`,
    valid_until: new Date(Date.now() + (policy.quote_validity_days || 14) * 86400000).toISOString(),
    eta: etaIso,
  });
  priced.forEach((p, idx) => db.insert('quote_items', { id: `${quoteId}-li-${idx}`, quote_id: quoteId, ...p }));

  onProgress({ step: 'done', label: `Quote ${quoteId} drafted` });

  return { quote, lines: priced, freight, freightOptions, dutyRates, fda };
}

// ---------------------------------------------------------------------------
// Desk operations (PRD-16 Phase 5 + 7) — margin override, freight switch,
// counter acceptance, refresh. All audit-logged; floor always enforced.
// ---------------------------------------------------------------------------

function quoteTotalsFromItems(items) {
  const total = +items.reduce((a, it) => a + (Number(it.ext_sell) || 0), 0).toFixed(2);
  const landed = +items.reduce((a, it) => a + (Number(it.landed_per_unit) || 0) * (it.target_qty || it.moq || 1), 0).toFixed(2);
  return { total, landed };
}

/**
 * Reprice a quote in place: change the margin (rep override) and/or the
 * freight mode (from the stored `freight_options`). Recomputes every line
 * from its stored cost components — nothing external is re-fetched.
 *
 * Overrides below the tier's default margin set `needs_approval` on the
 * quote (manager gate, PRD-16 Phase 5). The 10% floor is non-negotiable.
 *
 * @returns {{ ok:boolean, reason?:string, quote?:object, items?:object[] }}
 */
export function repriceQuote(quoteId, { margin_pct = null, freight_mode = null, actor = 'rep', reason = '' } = {}) {
  const quote = db.get('quotes', quoteId);
  if (!quote) return { ok: false, reason: 'not_found' };
  if (['accepted', 'declined'].includes(quote.status)) return { ok: false, reason: 'locked' };

  const items = db.list('quote_items', { where: { quote_id: quoteId } });
  if (!items.length) return { ok: false, reason: 'no_items' };

  const policy = loadMarginPolicy();
  const tierDefault = marginForTier(quote.customer_tier, policy);
  const margin = margin_pct != null ? Math.min(0.95, Math.max(MARGIN_FLOOR, Number(margin_pct))) : (quote.margin_target ?? tierDefault);

  // Freight switch — reallocate the per-unit freight components from the
  // stored option so landed cost stays auditable.
  let freight = null;
  if (freight_mode && freight_mode !== quote.freight_mode) {
    freight = (quote.freight_options || []).find((o) => o.mode === freight_mode) || null;
    if (!freight) return { ok: false, reason: 'unknown_freight_mode' };
  }
  const totalUnits = Math.max(1, quote.total_units || items.reduce((a, it) => a + (it.target_qty || it.moq || 1), 0));
  const newFreightPU = freight ? freightComponents(freight, totalUnits) : null;

  for (const it of items) {
    const components = { ...(it.cost_components || {}) };
    if (newFreightPU) Object.assign(components, newFreightPU);
    const { landed, sell, floored } = priceLine(components, margin);
    const qty = it.target_qty || it.moq || 1;
    db.update('quote_items', it.id, {
      cost_components: components,
      landed_per_unit: landed,
      margin_pct: margin,
      margin_floored: floored,
      sell_per_unit: sell,
      ext_sell: +(sell * qty).toFixed(2),
    });
  }

  const fresh = db.list('quote_items', { where: { quote_id: quoteId } });
  const { total, landed } = quoteTotalsFromItems(fresh);
  const needsApproval = margin < tierDefault - 0.0001;
  const etaIso = freight ? new Date(Date.now() + freight.transit_days * 86400000).toISOString() : quote.eta;

  db.update('quotes', quoteId, {
    total,
    total_landed: landed,
    margin_target: margin,
    needs_approval: needsApproval,
    ...(freight ? {
      freight_mode: freight.mode,
      freight_total: +Number(freight.total_usd).toFixed(2),
      freight_quote_id: freight.quote_id,
      freight_valid_until: freight.valid_until,
      eta: etaIso,
    } : {}),
  });
  db.insert('audit_log', {
    id: uid('aud'),
    kind: 'quote.repriced',
    ref_id: quoteId,
    payload: { actor, reason, margin_pct: margin, freight_mode: freight?.mode || quote.freight_mode, needs_approval: needsApproval, total },
  });

  return { ok: true, quote: db.get('quotes', quoteId), items: fresh };
}

/** Manager approval for a below-tier-default override (PRD-16 Phase 5). */
export function approveQuoteMargin(quoteId, { approver = 'manager' } = {}) {
  const quote = db.get('quotes', quoteId);
  if (!quote) return { ok: false, reason: 'not_found' };
  db.update('quotes', quoteId, { needs_approval: false, margin_approved_by: approver, margin_approved_at: new Date().toISOString() });
  db.insert('audit_log', { id: uid('aud'), kind: 'quote.margin_approved', ref_id: quoteId, payload: { approver } });
  return { ok: true, quote: db.get('quotes', quoteId) };
}

/**
 * Refresh an expired (or aging) quote: re-run freight for all modes,
 * reprice from stored components, restart the validity window, and bump
 * the revision counter. FX and freight move — margin policy holds.
 */
export async function refreshQuote(quoteId, { actor = 'rep' } = {}) {
  const quote = db.get('quotes', quoteId);
  if (!quote) return { ok: false, reason: 'not_found' };
  if (['accepted', 'declined'].includes(quote.status)) return { ok: false, reason: 'locked' };

  const items = db.list('quote_items', { where: { quote_id: quoteId } });
  // Items carry their Tier-B carton fields, so refresh reuses real
  // container math when the original sheet provided it.
  const { cbm, weight_kg: weightKg } = computeShipmentMetrics(items);
  const origin = quote.origin_port || 'CNSHA';

  const [lcl, fcl, air] = await Promise.all([
    flexport.getFreightQuote({ origin, destination: 'USATL', mode: 'LCL', cbm, weight_kg: weightKg }),
    flexport.getFreightQuote({ origin, destination: 'USATL', mode: 'FCL', cbm, weight_kg: weightKg }),
    flexport.getFreightQuote({ origin, destination: 'USATL', mode: 'AIR', cbm, weight_kg: weightKg }),
  ]);
  const freightOptions = [lcl, fcl, air].map(toFreightOption).filter(Boolean);
  const freight = selectFreightOption(freightOptions, quote.freight_mode) || freightOptions[0];
  if (!freight) return { ok: false, reason: 'no_freight' };

  const policy = loadMarginPolicy();
  db.update('quotes', quoteId, {
    freight_options: freightOptions,
    status: 'sent',
    revision: (quote.revision || 1) + 1,
    refresh_requested_at: null,
    valid_until: new Date(Date.now() + (policy.quote_validity_days || 14) * 86400000).toISOString(),
  });
  const repriced = repriceQuote(quoteId, { freight_mode: freight.mode, actor, reason: 'refresh' });
  // repriceQuote skips the freight update when the mode is unchanged, so
  // pin the fresh rate + validity explicitly.
  db.update('quotes', quoteId, {
    freight_mode: freight.mode,
    freight_total: +Number(freight.total_usd).toFixed(2),
    freight_quote_id: freight.quote_id,
    freight_valid_until: freight.valid_until,
    eta: new Date(Date.now() + freight.transit_days * 86400000).toISOString(),
  });
  db.insert('audit_log', { id: uid('aud'), kind: 'quote.refreshed', ref_id: quoteId, payload: { actor, freight_mode: freight.mode, revision: (quote.revision || 1) + 1 } });
  return { ok: repriced.ok, quote: db.get('quotes', quoteId), items: repriced.items };
}

/**
 * Confirm duty via Flexport classification (briefing §3/§4) — the PAID
 * step, run only on quotes we're actively committing (never $20 × 500).
 * Free pre-filter values (USITC MFN + 301 table) are replaced with the
 * confirmed classification; every line is repriced from its stored
 * components and the quote's `duty_confirmed` flag flips.
 */
export async function confirmQuoteDuty(quoteId, { actor = 'rep' } = {}) {
  const quote = db.get('quotes', quoteId);
  if (!quote) return { ok: false, reason: 'not_found' };
  if (['accepted', 'declined'].includes(quote.status)) return { ok: false, reason: 'locked' };

  const items = db.list('quote_items', { where: { quote_id: quoteId } });
  if (!items.length) return { ok: false, reason: 'no_items' };

  const { data: classified } = await flexport.classifyProducts(items.map((it) => ({
    sku: it.model_no || it.gtin || it.name,
    title: it.name,
    description: it.description,
    product_type: it.product_type,
    coo: it.country_of_origin,
    hs_hint: it.mfr_hs_code || it.hts,
    price: it.fob,
  })));

  const bySku = new Map(classified.map((c) => [c.sku, c]));
  let confirmed = 0;
  for (const it of items) {
    const c = bySku.get(it.model_no || it.gtin || it.name);
    if (!c) continue;
    const fob = Number(it.fob_effective ?? it.fob) || 0;
    const components = {
      ...(it.cost_components || {}),
      duty: +(fob * (c.duty_pct / 100)).toFixed(4),
    };
    const { landed, sell, floored } = priceLine(components, it.margin_pct ?? quote.margin_target ?? TARGET_MARGIN);
    const qty = it.target_qty || it.moq || 1;
    db.update('quote_items', it.id, {
      hts: c.hts_code || it.hts,
      hts_pending: false,
      duty_pct: c.duty_pct,
      duty_components: { mfn: c.mfn_pct, section_301: c.section_301_pct },
      chapter99: c.chapter99,
      duty_confirmed: Boolean(c.confirmed),
      cost_components: components,
      landed_per_unit: landed,
      margin_floored: floored,
      sell_per_unit: sell,
      ext_sell: +(sell * qty).toFixed(2),
    });
    if (c.confirmed) confirmed += 1;
  }

  const fresh = db.list('quote_items', { where: { quote_id: quoteId } });
  const { total, landed } = quoteTotalsFromItems(fresh);
  db.update('quotes', quoteId, {
    total,
    total_landed: landed,
    duty_confirmed: fresh.every((it) => it.duty_confirmed),
    section_301_lines: fresh.filter((it) => (it.duty_components?.section_301 || 0) > 0).length,
  });
  db.insert('audit_log', {
    id: uid('aud'),
    kind: 'quote.duty_confirmed',
    ref_id: quoteId,
    payload: { actor, lines: items.length, confirmed, total },
  });
  return { ok: true, quote: db.get('quotes', quoteId), items: fresh, confirmed };
}

/**
 * Desk accepts a customer counter-offer (PRD-16 Phase 7): set each
 * countered line's sell to the counter price (floor still enforced),
 * clear counters, and return the quote to 'sent' so the customer can
 * accept the revised number.
 */
export function applyCounterOffers(quoteId, { actor = 'rep' } = {}) {
  const quote = db.get('quotes', quoteId);
  if (!quote) return { ok: false, reason: 'not_found' };
  const items = db.list('quote_items', { where: { quote_id: quoteId } });
  const countered = items.filter((it) => Number(it.counter_price) > 0);
  if (!countered.length) return { ok: false, reason: 'no_counters' };

  let flooredCount = 0;
  for (const it of countered) {
    const landed = Number(it.landed_per_unit) || 0;
    const floor = +(landed * (1 + MARGIN_FLOOR)).toFixed(2);
    let sell = +Number(it.counter_price).toFixed(2);
    if (sell < floor) { sell = floor; flooredCount += 1; }
    const qty = it.target_qty || it.moq || 1;
    db.update('quote_items', it.id, {
      sell_per_unit: sell,
      ext_sell: +(sell * qty).toFixed(2),
      margin_floored: sell === floor,
      counter_price: null,
      counter_applied: true,
    });
  }

  const fresh = db.list('quote_items', { where: { quote_id: quoteId } });
  const { total, landed } = quoteTotalsFromItems(fresh);
  db.update('quotes', quoteId, { total, total_landed: landed, status: 'sent', counter_note: null, revision: (quote.revision || 1) + 1 });
  db.insert('audit_log', { id: uid('aud'), kind: 'quote.counter_applied', ref_id: quoteId, payload: { actor, lines: countered.length, floored: flooredCount, total } });
  return { ok: true, quote: db.get('quotes', quoteId), items: fresh, floored: flooredCount };
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
