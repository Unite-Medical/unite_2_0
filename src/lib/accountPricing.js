import { STOREFRONT_PRODUCTS } from './storefrontCatalog.js';
import { useEffect } from 'react';
import { auth } from './auth.js';
import { db } from './db.js';
import { commerceAccessFor } from './accessPolicy.js';
import { resolveCustomerPrice } from './customerPricing.js';

const STANDARD_QUANTITIES = [1, 10, 50, 250];

export function clearAccountPrices() {
  db.applyRemoteSnapshot({ account_prices: db.list('account_prices').map((row) => ({ id: row.id, __deleted: true })) });
}

export function accountPriceFor(sku, qty = 1) {
  const quantity = Math.max(1, Number(qty || 1));
  return db.list('account_prices', { where: { sku } })
    .filter((row) => row.ok !== false && Number(row.quantity || 1) <= quantity)
    .sort((a, b) => Number(b.quantity || 1) - Number(a.quantity || 1))[0] || null;
}

function pricingLinesForCatalog() {
  const lines = [];
  for (const product of STOREFRONT_PRODUCTS) {
    for (const qty of STANDARD_QUANTITIES) lines.push({ sku: product.sku, qty });
    for (const variant of product.variants || []) {
      if (!variant.sku || variant.sku === product.sku) continue;
      for (const qty of STANDARD_QUANTITIES) lines.push({ sku: variant.sku, qty });
    }
  }
  return lines;
}

function localDevelopmentPrices(lines) {
  return lines.map((line) => {
    const product = db.get('products', line.sku)
      || db.list('products').find((candidate) => (candidate.variants || []).some((variant) => variant.sku === line.sku));
    const variant = product?.variants?.find((candidate) => candidate.sku === line.sku);
    if (!product || product.quote_only || (variant?.price ?? product.price) == null) {
      return { ok: false, reason: product ? 'quote_only' : 'product_not_found', sku: line.sku, quantity: line.qty };
    }
    const priced = resolveCustomerPrice({
      sku: variant ? line.sku : product.sku,
      qty: line.qty,
      basePrice: variant?.price ?? product.price,
    });
    return {
      ok: true, sku: line.sku, quantity: line.qty,
      unit_price: priced.unit_price, list_price: priced.list_price,
      basis: priced.basis, tier: priced.tier,
    };
  });
}

export async function fetchAccountPricing(lines, { fetchImpl = fetch } = {}) {
  try {
    const prices = [];
    // The endpoint accepts 500 lines; large catalogs include several quantity
    // breaks for every variant. Never silently lose the later products.
    for (let offset = 0; offset < lines.length; offset += 500) {
      const response = await fetchImpl('/api/catalog/pricing', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: lines.slice(offset, offset + 500) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, reason: body.error || 'pricing_failed', status: response.status };
      prices.push(...(body.prices || []));
    }
    return { ok: true, prices };
  } catch (error) {
    if (import.meta.env?.DEV) return { ok: true, prices: localDevelopmentPrices(lines), local: true };
    return { ok: false, reason: 'pricing_unreachable', detail: error.message };
  }
}

export function useAccountPricingBootstrap() {
  const session = auth.use();
  const organization = auth.org();
  const access = commerceAccessFor(session, organization);

  useEffect(() => {
    let cancelled = false;
    if (!access.can_view_prices) {
      clearAccountPrices();
      return () => { cancelled = true; };
    }
    const lines = pricingLinesForCatalog();
    if (!lines.length) {
      clearAccountPrices();
      return () => { cancelled = true; };
    }
    fetchAccountPricing(lines).then((result) => {
      if (cancelled || !result.ok) return;
      clearAccountPrices();
      db.applyRemoteSnapshot({ account_prices: result.prices.map((price, index) => {
        if (!price?.sku) return null;
        return {
          id: `account_price_${price.sku}_${price.quantity || lines[index]?.qty || 1}`,
          ...price,
          org_id: session.org_id,
          fetched_at: new Date().toISOString(),
        };
      }).filter(Boolean) });
    });
    return () => { cancelled = true; };
  }, [access.can_view_prices, session?.org_id, session?.user_id]);
}
