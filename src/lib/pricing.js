/**
 * Role-based pricing — brief §3 ("Helium Customer Fields" replacement:
 * the B2B portal natively supports role-based pricing per account).
 *
 * Two stacked discounts:
 *   1. Quantity breaks   — from the `pricing` table (tier 1/2/3 by min_qty)
 *   2. Account tier      — org.tier set at approval time / by the rep
 *
 * The org-tier multiplier applies on top of the qty-break price, so a
 * Tier-A hospital ordering 250+ units gets both. Distributors carry the
 * deepest contract discount per the dealer program.
 */

import { db } from './db.js';
import { auth } from './auth.js';

export const TIER_MULTIPLIER = {
  A: 0.92,            // top accounts — negotiated 8% off list
  B: 0.96,            // standard wholesale accounts
  C: 1.0,             // new / unrated accounts pay list
  distributor: 0.88,  // dealer program contract pricing
};

export function tierMultiplier(org) {
  if (!org?.tier) return 1.0;
  return TIER_MULTIPLIER[org.tier] ?? 1.0;
}

/** Quantity-break price for a SKU at a given qty (list, before tier). */
export function qtyBreakPrice(sku, qty = 1, fallback = null) {
  const tiers = db.list('pricing', { where: { sku }, orderBy: 'min_qty' });
  const active = tiers.slice().reverse().find((t) => qty >= t.min_qty);
  return active?.unit_price ?? fallback;
}

/**
 * Final unit price for the current account.
 *
 * @param {object} args
 * @param {string} args.sku
 * @param {number} [args.qty]
 * @param {number} [args.basePrice]  Fallback when no pricing rows exist
 *                                   (e.g. variant price).
 * @param {object} [args.org]        Defaults to the signed-in user's org.
 * @returns {{ unit_price: number, list_price: number, tier: string, tier_discount_pct: number }}
 */
export function priceFor({ sku, qty = 1, basePrice = null, org = undefined }) {
  const resolvedOrg = org === undefined ? auth.org() : org;
  const list = qtyBreakPrice(sku, qty, basePrice) ?? basePrice ?? 0;
  const tier = resolvedOrg?.tier || 'C';

  // PRD-14: an explicit per-SKU contract price for this tier wins over the
  // generic tier multiplier. Honors an optional min_qty on the contract.
  const contract = tierPriceOverride(sku, tier, qty);
  if (contract != null) {
    return {
      unit_price: +Number(contract).toFixed(2),
      list_price: +Number(list).toFixed(2),
      tier,
      tier_discount_pct: list > 0 ? +((1 - contract / list) * 100).toFixed(1) : 0,
      contract: true,
    };
  }

  const mult = tierMultiplier(resolvedOrg);
  return {
    unit_price: +(list * mult).toFixed(2),
    list_price: +Number(list).toFixed(2),
    tier,
    tier_discount_pct: +((1 - mult) * 100).toFixed(1),
    contract: false,
  };
}

// ---------------------------------------------------------------------------
// PRD-14 · per-SKU tier contracts (`tier_pricing` table)
// ---------------------------------------------------------------------------

/**
 * Look up a negotiated per-unit price for (sku, tier) honoring an
 * optional `min_qty`. Returns the price or null when no contract exists.
 * Rows: { sku, tier, unit_price, min_qty }.
 */
export function tierPriceOverride(sku, tier, qty = 1) {
  if (!sku || !tier) return null;
  const rows = db.list('tier_pricing', { where: { sku, tier } });
  if (!rows.length) return null;
  const eligible = rows
    .filter((r) => qty >= (r.min_qty || 0))
    .sort((a, b) => (b.min_qty || 0) - (a.min_qty || 0));
  return eligible[0]?.unit_price ?? null;
}

// ---------------------------------------------------------------------------
// PRD-14 · catalog visibility gating (`catalog_visibility` table)
// ---------------------------------------------------------------------------

/**
 * Whether a product is visible to an org/segment. Default-open: a product
 * is visible unless an explicit rule hides it. Rules:
 *   { sku?, category?, segment?, tier?, mode: 'hide'|'show_only' }
 * - 'hide'      → hidden from the matched segment/tier
 * - 'show_only' → visible ONLY to the matched segment/tier
 */
export function isProductVisible(product, org = undefined) {
  const resolvedOrg = org === undefined ? auth.org() : org;
  const segment = resolvedOrg?.segment || 'public';
  const tier = resolvedOrg?.tier || 'C';
  const rules = db.list('catalog_visibility');
  if (!rules.length) return true;

  const matches = (r) =>
    (!r.sku || r.sku === product.sku)
    && (!r.category || r.category === product.category);

  // show_only rules: if any exist for this product, the org must match one.
  const showOnly = rules.filter((r) => r.mode === 'show_only' && matches(r));
  if (showOnly.length) {
    const allowed = showOnly.some((r) => (!r.segment || r.segment === segment) && (!r.tier || r.tier === tier));
    if (!allowed) return false;
  }

  // hide rules: any matching hide for this org hides the product.
  const hidden = rules.some((r) => r.mode === 'hide' && matches(r)
    && (!r.segment || r.segment === segment) && (!r.tier || r.tier === tier));
  return !hidden;
}

/** Filter a product list down to what the org may see. */
export function filterVisibleProducts(products, org = undefined) {
  const rules = db.list('catalog_visibility');
  if (!rules.length) return products;
  return products.filter((p) => isProductVisible(p, org));
}
