/**
 * Cart store backed by the in-browser DB so the cart survives refreshes
 * and matches the schema in the brief (carts, cart_items).
 *
 * For the demo we operate on a single cart_id ('cart_demo' or one created
 * for the logged-in user). When the user logs in we adopt their cart.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { db } from '../lib/db.js';
import { auth } from '../lib/auth.js';
import { uid } from '../lib/format.js';
import { resolveCustomerPrice } from '../lib/customerPricing.js';
import { commerceAccessFor } from '../lib/accessPolicy.js';

const subs = new Set();
let activeCartId = null;

function notify() { subs.forEach((fn) => fn()); }

function ensureCartFor(user) {
  const userId = user?.user_id || null;
  if (!userId) return null;
  let cart = db.list('carts', { where: { customer_id: userId } })[0];
  if (!cart) cart = db.insert('carts', { id: uid('cart'), customer_id: userId, org_id: user.org_id || null });
  return cart.id;
}

function reseat() {
  activeCartId = ensureCartFor(auth.current());
  notify();
}

reseat();

export const cartStore = {
  cartId: () => activeCartId,
  reseatForUser: () => reseat(),

  get items() {
    if (!activeCartId) return [];
    return db.list('cart_items', { where: { cart_id: activeCartId } });
  },

  /**
   * Add a product (or product variant) to the cart.
   * @param {string} productId    The product's primary id (== product.sku)
   * @param {number} qty          Quantity to add (default 1)
   * @param {object} [variant]    Optional selected variant
   * @param {string} variant.sku  Variant SKU (used as the cart line key)
   * @param {string} variant.title  Variant display title (e.g. "Case (450 Tests)")

   */
  add(productId, qty = 1, variant) {
    const session = auth.current();
    const organization = session?.org_id ? db.get('organizations', session.org_id) : null;
    if (!commerceAccessFor(session, organization).can_use_cart) {
      return { ok: false, reason: 'approved_account_required' };
    }
    if (!activeCartId) activeCartId = ensureCartFor(session);
    const product = db.get('products', productId);
    if (!product) return { ok: false, reason: 'product_not_found' };
    const lineSku = variant?.sku || product.sku;
    const lineName = variant?.title ? `${product.name} · ${variant.title}` : product.name;
    const existing = db.list('cart_items', { where: { cart_id: activeCartId, sku: lineSku } })[0];
    const nextQty = (existing?.qty || 0) + qty;
    const priced = resolveCustomerPrice({ sku: lineSku, qty: nextQty, basePrice: null });
    const lineUnit = priced.unit_price;
    if (!(lineUnit > 0)) return { ok: false, reason: 'account_pricing_required' };
    if (existing) {
      db.update('cart_items', existing.id, { qty: nextQty, unit_price: lineUnit, list_price: priced.list_price, pricing_tier: priced.tier });
    } else {
      db.insert('cart_items', {
        id: uid('ci'),
        cart_id: activeCartId,
        sku: lineSku,
        product_id: product.id,
        variant_title: variant?.title || null,
        qty,
        unit_price: lineUnit,
        list_price: priced.list_price,
        pricing_tier: priced.tier,
        name: lineName,
      });
    }
    notify();
    return { ok: true };
  },

  setQty(sku, qty) {
    if (!activeCartId) return { ok: false, reason: 'approved_account_required' };
    const existing = db.list('cart_items', { where: { cart_id: activeCartId, sku } })[0];
    if (!existing) return;
    if (qty <= 0) { db.remove('cart_items', existing.id); notify(); return; }
    const nextQty = Math.max(1, qty);
    // Re-tier the line: crossing a qty break (or signing in to a
    // tiered account) changes the unit price. Variant lines keep their
    // own list price (no parent qty breaks), tier discount still applies.
    const priced = resolveCustomerPrice({ sku, qty: nextQty, basePrice: null });
    if (!(priced.unit_price > 0)) return { ok: false, reason: 'account_pricing_required' };
    db.update('cart_items', existing.id, { qty: nextQty, unit_price: priced.unit_price, list_price: priced.list_price, pricing_tier: priced.tier });
    notify();
  },

  remove(sku) {
    if (!activeCartId) return;
    const existing = db.list('cart_items', { where: { cart_id: activeCartId, sku } })[0];
    if (existing) db.remove('cart_items', existing.id);
    notify();
  },

  clear() {
    if (!activeCartId) return;
    db.list('cart_items', { where: { cart_id: activeCartId } }).forEach((ci) => db.remove('cart_items', ci.id));
    notify();
  },

  subscribe(fn) {
    subs.add(fn);
    const off = db.subscribe('cart_items', notify);
    return () => { subs.delete(fn); off(); };
  },
};

/** Reactive React hook (drop-in for old useCart()). */
export function useCart() {
  const subscribe = (cb) => cartStore.subscribe(cb);
  const items = cartStore.items;
  const getSnapshot = () => `${activeCartId}:${items.length}:${items.reduce((a, b) => a + b.qty, 0)}`;
  useSyncExternalStore(subscribe, getSnapshot);
  const it = cartStore.items;
  return {
    items: it,
    subtotal: +it.reduce((a, b) => a + b.qty * b.unit_price, 0).toFixed(2),
    count: it.reduce((a, b) => a + b.qty, 0),
  };
}

/** Re-seat the cart whenever the auth session changes. */
export function useCartAuthSync() {
  const session = auth.use();
  useEffect(() => { reseat(); }, [session?.user_id]);
}
