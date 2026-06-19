/**
 * Shopify client — PRD-04 (headless commerce engine).
 *
 * Docs:
 *   Admin API (REST):  https://shopify.dev/docs/api/admin-rest
 *   Storefront API:    https://shopify.dev/docs/api/storefront
 *   Webhooks:          https://shopify.dev/docs/apps/build/webhooks
 *
 * Two surfaces, two auth models:
 *
 *   1. Admin API — server-side only. Dev Dashboard apps (legacy custom
 *      apps were deprecated Jan 2026) hand you a Client ID + Secret; the
 *      serverless proxy exchanges them for a short-lived Admin token via
 *      the client-credentials grant and injects `X-Shopify-Access-Token`.
 *      The browser calls `${API_BASE}/proxy/shopify/admin/api/<ver>/…`.
 *      (A manual SHOPIFY_ADMIN_TOKEN still works for legacy/offline tokens.)
 *      Read + write.
 *
 *   2. Storefront API — browser-safe. The Storefront access token is a
 *      public token by design, so the SPA can call the GraphQL endpoint
 *      directly (VITE_SHOPIFY_STOREFRONT_TOKEN + VITE_SHOPIFY_STORE_DOMAIN)
 *      for headless product/cart rendering — no proxy hop required.
 *
 * Webhooks (orders/create, orders/fulfilled, products/update, …) are
 * HMAC-verified server-side in `api/hooks/shopify.js` and dispatched here
 * via `handleWebhookEvent` — same contract as stripe/shipstation/flexport.
 */

import { db } from '../db.js';
import { delay, uid } from '../format.js';
import { API_BASE, env, fetchJson, realOrStub } from './_http.js';

// Override per Shopify's calendar releases; safe stable default.
const API_VERSION = env('SHOPIFY_API_VERSION') || '2025-01';

function storeDomain() {
  return env('SHOPIFY_STORE_DOMAIN'); // e.g. unitemedical.myshopify.com
}

function adminConfigured() {
  return Boolean(
    storeDomain()
    && (env('SHOPIFY_ADMIN_TOKEN') || (env('SHOPIFY_CLIENT_ID') && env('SHOPIFY_CLIENT_SECRET'))),
  );
}

function storefrontConfigured() {
  return Boolean(storeDomain() && env('SHOPIFY_STOREFRONT_TOKEN'));
}

function viaBackendProxy() {
  return Boolean(API_BASE);
}

function adminPath(resource) {
  return `/admin/api/${API_VERSION}/${resource.replace(/^\//, '')}`;
}

/** Admin REST call. Browser → proxy (token injected); Node → direct. */
async function callAdmin({ method = 'GET', resource, body, query }) {
  const path = adminPath(resource);
  const qs = query
    ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString()}`
    : '';
  if (viaBackendProxy()) {
    return fetchJson(`${API_BASE}/proxy/shopify${path}${qs}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  return fetchJson(`https://${storeDomain()}${path}${qs}`, {
    method,
    headers: {
      'X-Shopify-Access-Token': env('SHOPIFY_ADMIN_TOKEN'),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const shopify = {
  // ---------------------------------------------------------------------------
  // Admin API — read
  // ---------------------------------------------------------------------------

  /** Connectivity ping for /admin/integrations — returns the shop record. */
  async ping() {
    return realOrStub({
      scope: 'shopify',
      label: 'ping',
      predicate: () => adminConfigured() || viaBackendProxy(),
      real: async () => {
        const r = await callAdmin({ resource: 'shop.json' });
        return { shop: r?.shop?.myshopify_domain || r?.shop?.domain, plan: r?.shop?.plan_name };
      },
      stub: async () => ({ stub: true, shop: storeDomain() || 'not-configured' }),
    });
  },

  /** List products (Admin). Mirrors into `shopify_products`. */
  async listProducts({ limit = 50 } = {}) {
    return realOrStub({
      scope: 'shopify',
      label: 'listProducts',
      predicate: () => adminConfigured() || viaBackendProxy(),
      real: async () => {
        const r = await callAdmin({ resource: 'products.json', query: { limit } });
        const products = r?.products || [];
        for (const p of products) {
          db.upsert('shopify_products', {
            id: `shp_prod_${p.id}`,
            shopify_product_id: String(p.id),
            title: p.title,
            handle: p.handle,
            status: p.status,
            variants: (p.variants || []).map((v) => ({ id: v.id, sku: v.sku, price: v.price, inventory_item_id: v.inventory_item_id })),
            synced_at: new Date().toISOString(),
          });
        }
        return { count: products.length, products };
      },
      stub: async () => {
        await delay(160, 360);
        return { count: 0, products: [], stub: true };
      },
    });
  },

  /** List orders (Admin). Mirrors into `shopify_orders`. */
  async listOrders({ limit = 50, status = 'any' } = {}) {
    return realOrStub({
      scope: 'shopify',
      label: 'listOrders',
      predicate: () => adminConfigured() || viaBackendProxy(),
      real: async () => {
        const r = await callAdmin({ resource: 'orders.json', query: { limit, status } });
        const orders = r?.orders || [];
        for (const o of orders) mirrorOrder(o);
        return { count: orders.length, orders };
      },
      stub: async () => {
        await delay(160, 360);
        return { count: 0, orders: [], stub: true };
      },
    });
  },

  // ---------------------------------------------------------------------------
  // Admin API — write
  // ---------------------------------------------------------------------------

  /** Create a draft/real order in Shopify (write). */
  async createOrder({ line_items, email, financial_status = 'pending', tags, note }) {
    if (!Array.isArray(line_items) || !line_items.length) throw new Error('shopify.createOrder requires line_items');
    const body = { order: { line_items, email, financial_status, tags, note, send_receipt: false } };
    return realOrStub({
      scope: 'shopify',
      label: 'createOrder',
      predicate: () => adminConfigured() || viaBackendProxy(),
      real: async () => {
        const r = await callAdmin({ method: 'POST', resource: 'orders.json', body });
        return mirrorOrder(r.order);
      },
      stub: async () => {
        await delay(220, 480);
        return { id: `shp_order_STUB_${uid().slice(3)}`, stub: true };
      },
    });
  },

  /**
   * Set an inventory level (write). Keeps Shopify storefront stock in
   * sync with Cin7/our WMS as the source of truth.
   */
  async setInventoryLevel({ inventory_item_id, location_id, available }) {
    if (!inventory_item_id || !location_id) throw new Error('shopify.setInventoryLevel requires inventory_item_id + location_id');
    const body = { location_id, inventory_item_id, available };
    return realOrStub({
      scope: 'shopify',
      label: 'setInventoryLevel',
      predicate: () => adminConfigured() || viaBackendProxy(),
      real: async () => {
        const r = await callAdmin({ method: 'POST', resource: 'inventory_levels/set.json', body });
        return { inventory_item_id, location_id, available: r?.inventory_level?.available ?? available };
      },
      stub: async () => {
        await delay(160, 340);
        return { inventory_item_id, location_id, available, stub: true };
      },
    });
  },

  // ---------------------------------------------------------------------------
  // Storefront API — browser-safe GraphQL (headless product/cart)
  // ---------------------------------------------------------------------------

  /** Run a Storefront GraphQL query directly from the browser. */
  async storefrontQuery(query, variables = {}) {
    return realOrStub({
      scope: 'shopify',
      label: 'storefrontQuery',
      predicate: storefrontConfigured,
      real: async () => {
        const data = await fetchJson(`https://${storeDomain()}/api/${API_VERSION}/graphql.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Storefront-Access-Token': env('SHOPIFY_STOREFRONT_TOKEN'),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ query, variables }),
        });
        if (data.errors) throw new Error(`Storefront GraphQL: ${JSON.stringify(data.errors).slice(0, 200)}`);
        return data.data;
      },
      stub: async () => {
        await delay(140, 320);
        return { stub: true };
      },
    });
  },

  /** Convenience: fetch storefront products for headless rendering. */
  async storefrontProducts({ first = 12 } = {}) {
    const query = `
      query Products($first: Int!) {
        products(first: $first) {
          edges { node {
            id title handle description
            featuredImage { url altText }
            priceRange { minVariantPrice { amount currencyCode } }
          } }
        }
      }`;
    const data = await this.storefrontQuery(query, { first });
    if (data?.stub) return { products: [], stub: true };
    return { products: (data?.products?.edges || []).map((e) => e.node) };
  },

  // ---------------------------------------------------------------------------
  // Webhook dispatch (server-verified in api/hooks/shopify.js)
  // ---------------------------------------------------------------------------

  /**
   * Apply a verified Shopify webhook. `event` is the receiver envelope:
   *   { topic: 'orders/create', shop, data: <object> }
   */
  async handleWebhookEvent(event) {
    const topic = event?.topic || event?.type || '';
    const obj = event?.data || event?.payload || event || {};
    db.insert('audit_log', { id: uid('aud'), kind: `shopify.${topic}`, ref_id: obj?.id, payload: event });

    if (topic.startsWith('orders/')) {
      const row = mirrorOrder(obj, topic);
      return { ok: true, kind: topic, order_id: row?.shopify_order_id };
    }
    if (topic.startsWith('products/')) {
      if (obj?.id) {
        db.upsert('shopify_products', {
          id: `shp_prod_${obj.id}`,
          shopify_product_id: String(obj.id),
          title: obj.title,
          handle: obj.handle,
          status: obj.status,
          synced_at: new Date().toISOString(),
        });
      }
      return { ok: true, kind: topic };
    }
    return { ok: true, kind: topic || 'unknown', ignored: true };
  },

  __isConfigured: adminConfigured,
  __storefrontConfigured: storefrontConfigured,
};

function mirrorOrder(o, topic) {
  if (!o?.id) return null;
  return db.upsert('shopify_orders', {
    id: `shp_order_${o.id}`,
    shopify_order_id: String(o.id),
    name: o.name,
    email: o.email,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    total_price: o.total_price,
    currency: o.currency,
    line_item_count: (o.line_items || []).length,
    last_topic: topic || null,
    synced_at: new Date().toISOString(),
  });
}
