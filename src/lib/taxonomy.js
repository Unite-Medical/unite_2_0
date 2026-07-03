/**
 * M6 product taxonomy + 3-state supply model (PRD-28 §5.1 / §5.6).
 *
 * Two INDEPENDENT classifications per SKU:
 *   1. Product category  — the M6 taxonomy (categorize)
 *   2. Availability tier — the 3 supply states (supplyStateFor)
 *
 * Category list per Damon's M6 brief: Bracing & Orthotics, Diagnostic Tests
 * (POC + OTC, sub-typed by test), American-Made PPE, Syringes, Supplements,
 * plus an extensible Other / Medava bucket. (Final list flagged for Damon's
 * confirmation before any DB backfill — this module is the single source of
 * truth so a rename lands everywhere at once.)
 */

import { availability } from './wms/availability.js';

/* ------------------------------------------------------------------ */
/* 1 · M6 product categories                                           */
/* ------------------------------------------------------------------ */

export const M6_CATEGORIES = [
  'Bracing & Orthotics',
  'Diagnostic Tests',
  'American-Made PPE',
  'Syringes',
  'Supplements',
  'Other / Medava',
];

const hasTag = (p, ...tags) => (p.tags || []).some((t) => tags.some((q) => t.toLowerCase().includes(q.toLowerCase())));

/**
 * Deterministic classification pass over the existing catalog — maps legacy
 * `category` values + tags/names onto the M6 taxonomy. New uploads set the
 * M6 category explicitly (required field on the admin product form).
 */
export function categorize(p) {
  if (!p) return 'Other / Medava';
  if (p.m6_category && M6_CATEGORIES.includes(p.m6_category)) return p.m6_category;
  const legacy = (p.category || '').toLowerCase();
  const name = (p.name || '').toLowerCase();
  if (hasTag(p, 'syringe') || name.includes('syringe')) return 'Syringes';
  if (legacy === 'orthotics' || hasTag(p, 'orthosis', 'brace')) return 'Bracing & Orthotics';
  if (legacy === 'diagnostics' || hasTag(p, 'diagnostic test')) return 'Diagnostic Tests';
  if (legacy === 'supplements' || hasTag(p, 'supplement')) return 'Supplements';
  if (legacy === 'ppe' || hasTag(p, 'gloves', 'masks', 'gown') || name.includes('shoe cover')) return 'American-Made PPE';
  return 'Other / Medava';
}

/** Diagnostics sub-type: POC vs OTC + the test family (for the M4 page/filters). */
export function diagnosticSubtype(p) {
  if (categorize(p) !== 'Diagnostic Tests') return null;
  const format = hasTag(p, 'POC') || /professional/i.test(p.name || '') ? 'POC' : 'OTC';
  const n = (p.name || '').toLowerCase();
  const family =
    n.includes('covid') && (n.includes('flu') || n.includes('influenza')) ? 'COVID + Flu combo'
    : n.includes('covid') ? 'COVID-19'
    : n.includes('influenza') || n.includes('flu') ? 'Influenza'
    : n.includes('strep') ? 'Strep A'
    : n.includes('hiv') ? 'HIV'
    : n.includes('rsv') ? 'RSV'
    : n.includes('drug') ? 'Drug screening'
    : n.includes('pregnancy') || n.includes('hcg') ? 'Pregnancy'
    : 'Other';
  return { format, family };
}

/* ------------------------------------------------------------------ */
/* 2 · Availability tier — the 3 supply states (modeled after Cato)    */
/* ------------------------------------------------------------------ */

export const SUPPLY_STATES = {
  in_stock: {
    id: 'in_stock',
    label: 'In Stock',
    short: 'IN STOCK',
    desc: 'Deeply stocked in our Georgia warehouse — ships today on orders before 2pm EST.',
    cta: 'Add to cart',
  },
  source: {
    id: 'source',
    label: 'Source',
    short: 'WE SOURCE',
    desc: 'Not on our shelf right now — backordered, on allocation, or between runs. We find it through our vetted network and quote you a firm price and delivery window.',
    cta: 'Request sourcing',
  },
  quote: {
    id: 'quote',
    label: 'Available to Quote',
    short: 'QUOTE',
    desc: 'Not in our catalog — open an RFQ and we price it from our manufacturer network.',
    cta: 'Start a quote',
  },
};

/**
 * Availability tier for a catalog SKU, read from the WMS projection
 * (on_hand − reserved) — the same truth the storefront and admin use.
 * Catalog items are never 'quote'; that state belongs to open-RFQ items
 * outside the catalog. OOS items MUST still show, with a path to source
 * (per M1 — never hide a product because it's out of stock).
 */
export function supplyStateFor(sku) {
  const available = availability.availableToPromise(sku);
  return available > 0 ? SUPPLY_STATES.in_stock : SUPPLY_STATES.source;
}
