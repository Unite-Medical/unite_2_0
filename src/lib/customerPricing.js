/**
 * Per-customer pricing resolver — PRD-26 §5.
 *
 * One resolver is the law: everything that shows or charges a price calls
 * `resolveCustomerPrice` — catalog, cart, quick order, reorder, rep entry.
 * No component does its own price math.
 *
 * Precedence (first match wins):
 *   1. contract     — explicit per-(org, sku) negotiated price (qty-banded)
 *   2. volume_break — quantity ≥ a SKU break threshold
 *   3. tier         — the org's tier via priceFor() (PRD-14 margin policy)
 *   4. list         — catalog default
 */

import { db } from './db.js';
import { auth } from './auth.js';
import { priceFor } from './pricing.js';

function todayIso() { return new Date().toISOString().slice(0, 10); }

/** Best active contract row for (org, sku) at qty, honoring qty bands + dates. */
function contractPrice(orgId, sku, qty) {
  if (!orgId || !sku) return null;
  const today = todayIso();
  const rows = db.list('customer_contract_prices', { where: { org_id: orgId, product_sku: sku } })
    .filter((r) => qty >= (r.min_qty || 1))
    .filter((r) => (!r.effective_from || r.effective_from <= today) && (!r.effective_to || r.effective_to >= today))
    .sort((a, b) => (b.min_qty || 1) - (a.min_qty || 1));
  return rows[0] || null;
}

/** Best volume break for a SKU at qty. Returns absolute price (resolving %). */
function volumeBreakPrice(sku, qty, list) {
  const rows = db.list('volume_breaks', { where: { product_sku: sku } })
    .filter((r) => qty >= r.min_qty)
    .sort((a, b) => b.min_qty - a.min_qty);
  const b = rows[0];
  if (!b) return null;
  let price = null;
  if (b.unit_price != null) price = Number(b.unit_price);
  else if (b.discount_pct != null && list != null) price = +(list * (1 - b.discount_pct / 100)).toFixed(2);
  return price != null ? { price: +price.toFixed(2), min_qty: b.min_qty } : null;
}

/**
 * Resolve the unit price a specific org pays for a SKU at a quantity.
 *
 * @returns {{ unit_price, list_price, basis, tier, contract_id?, break_min_qty? }}
 *   basis ∈ { 'contract', 'volume_break', 'tier', 'list' }
 */
export function resolveCustomerPrice({ org, sku, qty = 1, basePrice = null }) {
  const resolvedOrg = org === undefined ? auth.org() : org;
  // priceFor handles tier multiplier + tier contracts + qty-break list price.
  const tierPriced = priceFor({ sku, qty, basePrice, org: resolvedOrg });
  const list = tierPriced.list_price;

  // 1. Per-customer contract (highest authority).
  const contract = contractPrice(resolvedOrg?.id, sku, qty);
  if (contract) {
    return {
      unit_price: +Number(contract.unit_price).toFixed(2),
      list_price: list,
      basis: 'contract',
      contract_id: contract.id,
      tier: tierPriced.tier,
      changed_pct: list > 0 ? +((1 - contract.unit_price / list) * 100).toFixed(1) : 0,
    };
  }

  // 2. Volume break — only if it beats the tier price.
  const vb = volumeBreakPrice(sku, qty, list);
  if (vb && vb.price < tierPriced.unit_price) {
    return {
      unit_price: vb.price,
      list_price: list,
      basis: 'volume_break',
      break_min_qty: vb.min_qty,
      tier: tierPriced.tier,
      changed_pct: list > 0 ? +((1 - vb.price / list) * 100).toFixed(1) : 0,
    };
  }

  // 3. Tier (priceFor applied a tier multiplier or tier contract) / 4. List.
  return {
    unit_price: tierPriced.unit_price,
    list_price: list,
    basis: tierPriced.unit_price < list ? 'tier' : 'list',
    tier: tierPriced.tier,
    changed_pct: tierPriced.tier_discount_pct || 0,
  };
}

/** Price a whole cart for an org. `lines`: [{ sku, qty, basePrice? }]. */
export function priceCart(org, lines = []) {
  return lines.map((l) => ({
    ...l,
    ...resolveCustomerPrice({ org, sku: l.sku, qty: l.qty, basePrice: l.basePrice ?? l.list_price ?? l.unit_price }),
  }));
}

/** Admin authoring helpers for per-customer contract prices + volume breaks. */
export const contractPricing = {
  forOrg(orgId) { return db.list('customer_contract_prices', { where: { org_id: orgId }, orderBy: 'product_sku' }); },
  setContract({ org_id, product_sku, unit_price, min_qty = 1, effective_from = null, effective_to = null, created_by = null }) {
    const existing = db.list('customer_contract_prices', { where: { org_id, product_sku } })
      .find((r) => (r.min_qty || 1) === (min_qty || 1));
    const patch = { org_id, product_sku, unit_price: +Number(unit_price).toFixed(2), min_qty, effective_from, effective_to, created_by };
    return existing ? db.update('customer_contract_prices', existing.id, patch)
      : db.insert('customer_contract_prices', { id: `ccp_${org_id}_${product_sku}_${min_qty}`, ...patch });
  },
  removeContract(id) { db.remove('customer_contract_prices', id); },
  breaksFor(sku) { return db.list('volume_breaks', { where: { product_sku: sku }, orderBy: 'min_qty' }); },
  setBreak({ product_sku, min_qty, unit_price = null, discount_pct = null }) {
    const existing = db.list('volume_breaks', { where: { product_sku, min_qty } })[0];
    const patch = { product_sku, min_qty, unit_price, discount_pct };
    return existing ? db.update('volume_breaks', existing.id, patch)
      : db.insert('volume_breaks', { id: `vb_${product_sku}_${min_qty}`, ...patch });
  },
  removeBreak(id) { db.remove('volume_breaks', id); },
};
