/**
 * Marketing-side product / segment data for static homepage components.
 *
 * Real product data lives in `realCatalog.js` and flows through the in-browser
 * DB (`src/lib/seed.js` -> `db.useTable('products')`). This module re-shapes
 * the first few real products into the legacy field names the Homepage
 * Featured grid still expects (`cat`, `packSize`, `hcpcs`, `moq`, `img`).
 */

import { REAL_PRODUCTS } from './realCatalog.js';

const FEATURED_HANDLES = [
  'universal-rom-knee-brace',
  'welllife-influenza-rapid-antigen-test-professional-25',
  'avina-pure-4-mil-blue-nitrile-examination-gloves',
  'megasporebiotic-gummies-adults',
];

function legacyShape(p) {
  return {
    sku:      p.sku,
    handle:   p.handle,
    name:     p.name,
    cat:      p.category,
    packSize: p.pack_size || '1 ea',
    price:    p.price,
    tier:     p.tier,
    hcpcs:    p.hcpcs || '—',
    moq:      p.moq || 1,
    stock:    482,
    img:      p.img || p.summary || p.name,
  };
}

const featured = FEATURED_HANDLES
  .map((h) => REAL_PRODUCTS.find((p) => p.handle === h))
  .filter(Boolean)
  .map(legacyShape);

const fallback = REAL_PRODUCTS
  .filter((p) => !FEATURED_HANDLES.includes(p.handle))
  .slice(0, Math.max(0, 8 - featured.length))
  .map(legacyShape);

export const PRODUCTS = [...featured, ...fallback];

export const SEGMENTS = [
  { id: 'asc', title: 'Ambulatory Surgery Centers', line: 'Procedure-specific bundles. No MOQs on stocked items.', tam: '$45.6B', stat: '21% growth · 2029' },
  { id: 'gov', title: 'Government & VA', line: 'BPA · Veteran-owned · Berry compliant.', tam: '$5–10B', stat: 'CAGE 8MK70' },
  { id: 'pharma', title: 'Independent Pharmacies', line: 'Private-label diagnostics + Clyne telehealth.', tam: '$15–20B', stat: 'Drop-ship ready' },
  { id: 'dist', title: 'Regional Distributors', line: 'FDA-registered import. White-label. Drop-ship.', tam: '$10–15B', stat: 'FDA #3015727296' },
];

// "By the numbers" tiles per spec §4a. BPA value + Same-day label updated;
// the no-longer-trustworthy "median ship to ASC" reframed.
export const TRUST_METRICS = [
  { big: '500M+', small: 'Units Distributed' },
  { big: '36F79725D0203', small: 'BPA' },
  { big: '3015727296', small: 'FDA Registration' },
  { big: 'Same-day', small: 'Shipping · Before 2pm EST' },
];
