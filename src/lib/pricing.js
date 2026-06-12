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
  const mult = tierMultiplier(resolvedOrg);
  return {
    unit_price: +(list * mult).toFixed(2),
    list_price: +Number(list).toFixed(2),
    tier: resolvedOrg?.tier || 'C',
    tier_discount_pct: +((1 - mult) * 100).toFixed(1),
  };
}
