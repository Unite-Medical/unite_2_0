/**
 * Curated HCPCS ↔ Unite SKU cross-links — PRD-29 §6.3.
 *
 * The Shopify export doesn't carry per-product HCPCS codes yet, so this
 * hand-verified map is the source of truth for "which of our SKUs bill
 * under which code." Only type-consistent pairs are listed (product
 * description matches the CMS long description); anything uncertain is
 * left out rather than guessed. Two legacy mismatches were dropped:
 * VA1S50S (an ankle brace) was wrongly listed under L4361 (walking boot),
 * and 7678383 (a surgical gown) under A4928 (surgical mask, per 20).
 *
 * When the catalog gains real per-SKU `hcpcs` fields, those take
 * precedence — see `skusForCode`.
 */

import { REAL_PRODUCTS } from './realCatalog.js';

export const HCPCS_SKU_MAP = {
  // Knee orthosis, adjustable knee joints, positional, prefabricated
  L1832: ['KO3233', 'KO3233-1', 'KO3233-SM'],
  // Walking boot, pneumatic, prefabricated, off-the-shelf
  L4361: ['PWB6061-XS-T', 'PWB6061-XS-S'],
  // Wrist hand orthosis, wrist extension control cock-up, prefabricated
  L3908: ['WHO1615-SM'],
  // Cervical, multiple post collar, occipital/mandibular, adjustable
  L0180: ['CC180'],
  // Gloves, non-sterile, per 100
  A4927: ['APN-3001-C'],
};

const bySku = new Map(REAL_PRODUCTS.map((p) => [p.sku, p]));

/** All Unite SKUs that bill under `code` — curated map + per-product hcpcs fields. */
export function skusForCode(code) {
  const c = String(code || '').trim().toUpperCase();
  const set = new Set(HCPCS_SKU_MAP[c] || []);
  for (const p of REAL_PRODUCTS) {
    if (p.hcpcs && p.hcpcs !== '—' && p.hcpcs.trim().toUpperCase() === c) set.add(p.sku);
  }
  return [...set].filter((sku) => bySku.has(sku));
}

/** Map of code -> SKU count, for "true counts" on the Resources page. */
export function skuCountsByCode() {
  const counts = {};
  for (const code of Object.keys(HCPCS_SKU_MAP)) counts[code] = skusForCode(code).length;
  for (const p of REAL_PRODUCTS) {
    const c = p.hcpcs && p.hcpcs !== '—' ? p.hcpcs.trim().toUpperCase() : '';
    if (c && !(c in counts)) counts[c] = skusForCode(c).length;
  }
  return counts;
}

/** Product lookup for cross-linked SKUs (name, pdac flag, etc). */
export function productForSku(sku) {
  return bySku.get(sku) || null;
}
