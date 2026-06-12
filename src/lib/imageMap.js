/* Maps content keys (SKUs, slugs, segment ids, etc.) to imagery on disk.
   Two sources:
   - Marketing imagery (homepage, segments, blog, portfolio) is editorial
     content under /public/images/generated/ produced by scripts/generate_images.py.
   - Product imagery is the real catalog imported from the live store via
     scripts/import_catalog.py, served from /public/images/products/{handle}/.
*/

import { REAL_PRODUCTS } from '../data/realCatalog.js';
import CUTOUTS from '../data/productCutouts.json';

const VARIANT = 'v1';
// Marketing imagery is served as WebP (~10x lighter than the PNG masters,
// which stay on disk for the generation pipeline).
const base = (id) => `/images/generated/${id}-${VARIANT}.webp`;

export const IMG = {
  HOME_HERO:        base('HOME-01'),
  ABOUT_FOUNDER:    base('ABOUT-01'),
  VET_FOUNDER:      base('VET-01'),
  PDAC_LETTER:      base('PDAC-01'),
  DIST_PICK_PATH:   base('DIST-01'),
  EDU_IN_PERSON:    base('EDU-01'),
  EDU_ONLINE:       base('EDU-02'),
  SURPLUS_HERO:     base('SURPLUS-01'),
  COMPLIANCE_FILES: base('COMP-01'),
  GOV_WAREHOUSE:    base('GOV-01'),
  WAREHOUSE_GA:     base('LOC-GA'),
  WAREHOUSE_NV:     base('LOC-NV'),
};

/* Services hub cards — keyed by index in src/pages/Services.jsx. */
export const SERVICE_IMG = [
  base('SVC-01'), // Distribution & Fulfillment
  base('SVC-02'), // PDAC Consulting
  base('SVC-03'), // Quoting & Sourcing
  base('SVC-04'), // Distributor Program
];

/* SKU -> hero image path. Built from the real catalog. */
const PRODUCT_HERO = Object.fromEntries(
  REAL_PRODUCTS.map((p) => [p.sku, p.hero_image || ''])
);

/* SKU -> full image gallery (1..N images per product). */
const PRODUCT_GALLERY = Object.fromEntries(
  REAL_PRODUCTS.map((p) => [p.sku, p.images || []])
);

/* SKU -> handle, useful for routing or AI-regen file lookups. */
const PRODUCT_HANDLE = Object.fromEntries(
  REAL_PRODUCTS.map((p) => [p.sku, p.handle])
);

/**
 * Public lookup: returns the hero image for a SKU, or `undefined` if unknown
 * (callers fall back to the striped <PhotoPlaceholder> stripe).
 */
export const PRODUCT_IMG = PRODUCT_HERO;

/**
 * SKU -> transparent-background cutout PNG (produced by
 * scripts/remove_bg.mjs via the remove.bg API). Empty string when the
 * SKU hasn't been processed yet — callers fall back to the hero photo.
 */
export function productCutout(sku) {
  return CUTOUTS[sku] || '';
}

export const SEGMENT_IMG = {
  asc:          base('SOL-01'),
  pharmacy:     base('SOL-02'),
  gov:          base('SOL-03'),
  ems:          base('SOL-04'),
  distributors: base('SOL-05'),
};

export const BLOG_IMG = {
  'mckesson-medsurg-spinoff':  base('BLOG-01'),
  'asc-procedure-bundles-101': base('BLOG-02'),
  'va-mspv-bpa-explained':     base('BLOG-03'),
  'tariff-volatility-q2-2026': base('BLOG-04'),
};

/* Portfolio cases — keyed by index in src/pages/Portfolio.jsx CASES array. */
export const PORTFOLIO_IMG = [
  base('PORT-01'),
  base('PORT-02'),
  base('PORT-03'),
  base('PORT-04'),
  base('PORT-05'),
  base('PORT-06'),
];

/* SegmentASC procedure bundles — keyed by index in the inline list. */
export const ASC_BUNDLE_IMG = [
  base('ASC-01'),
  base('ASC-02'),
  base('ASC-03'),
  base('ASC-04'),
  base('ASC-05'),
  base('ASC-06'),
];

/* SegmentEMS bundles — keyed by index. */
export const EMS_BUNDLE_IMG = [
  base('EMS-01'),
  base('EMS-02'),
  base('EMS-03'),
  base('EMS-04'),
];

/**
 * Returns paths to the four PDP gallery angles for a given SKU. With the
 * real Shopify catalog, each product has 1–10 actual photographs; we map
 * the first four to the front/back/detail/packaging slots that the legacy
 * UI expects. If a product has fewer than 4 photos, the remaining slots
 * fall back to the hero image.
 *
 * @returns {{ front: string, back: string, detail: string, packaging: string } | null}
 */
export function productThumbs(sku) {
  const gallery = PRODUCT_GALLERY[sku];
  if (!gallery || gallery.length === 0) return null;
  const hero = gallery[0];
  return {
    front:     gallery[0] || hero,
    back:      gallery[1] || hero,
    detail:    gallery[2] || hero,
    packaging: gallery[3] || hero,
  };
}

/** Return the full image gallery for a product. */
export function productGallery(sku) {
  return PRODUCT_GALLERY[sku] || [];
}

/** Return the handle (URL slug) for a product SKU. */
export function productHandle(sku) {
  return PRODUCT_HANDLE[sku] || '';
}
