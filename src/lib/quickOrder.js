/**
 * Quick order — PRD-26 §3/§4.
 *
 * Buyers who know their part numbers paste/type SKU + qty rows (or scan) and
 * skip browsing. Each parsed line is matched to a product and priced by the
 * one resolver (contract → volume break → tier → list). Unmatched SKUs are
 * flagged, never silently dropped.
 *
 * Accepted line formats (one per line):
 *   UM-0001, 12        UM-0001 12        UM-0001 x12        UM-0001\t12
 */

import { db } from './db.js';
import { resolveCustomerPrice } from './customerPricing.js';

const LINE_RE = /^\s*([A-Za-z0-9][A-Za-z0-9._/-]*)\s*(?:[,\t]|\s+x?|x)\s*(\d+)\s*$/i;

/** Parse pasted text into priced, validated order lines for an org. */
export function parseQuickOrder(text, org) {
  const rows = String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const lines = rows.map((raw) => {
    const m = raw.match(LINE_RE);
    if (!m) return { raw, valid: false, error: 'Could not read "SKU qty"' };
    const sku = m[1].toUpperCase();
    const qty = parseInt(m[2], 10);
    const product = db.get('products', sku);
    if (!product) return { raw, sku, qty, valid: false, error: 'Unknown SKU' };
    if (!(qty > 0)) return { raw, sku, qty, valid: false, error: 'Quantity must be > 0' };
    const priced = resolveCustomerPrice({ org, sku, qty, basePrice: product.price });
    return {
      raw, sku, qty, valid: true,
      name: product.name,
      unit_price: priced.unit_price,
      list_price: priced.list_price,
      basis: priced.basis,
      ext_price: +(priced.unit_price * qty).toFixed(2),
    };
  });
  const valid = lines.filter((l) => l.valid);
  return {
    lines,
    valid,
    validCount: valid.length,
    invalidCount: lines.length - valid.length,
    subtotal: +valid.reduce((a, b) => a + b.ext_price, 0).toFixed(2),
  };
}
