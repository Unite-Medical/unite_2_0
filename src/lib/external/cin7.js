/**
 * Cin7 Core client — PRD-04.
 *
 * Docs:
 *   https://help.core.cin7.com/hc/en-us/articles/9982480315407-Connecting-to-the-Cin7-Core-API
 *   https://dearinventory.docs.apiary.io/
 *
 * Auth: two custom HTTP headers per request:
 *   api-auth-accountid: <Cin7 Core account ID>
 *   api-auth-applicationkey: <API Application key>
 *
 * Base: https://inventory.dearsystems.com/ExternalApi/v2 (v2)
 *       https://inventory.dearsystems.com/ExternalApi   (v1, legacy)
 *
 * Endpoints used here:
 *   GET    /Products                   list/search
 *   GET    /Products?ID={guid}         single
 *   POST   /Products                   create
 *   PUT    /Products                   update
 *   GET    /ProductAvailability        stock by SKU/location
 *   POST   /Purchase                   create PO
 *   POST   /Sale                       create sale (when an order ships)
 *   GET    /Locations                  warehouse list
 */

import { db } from '../db.js';
import { delay, uid } from '../format.js';
import { API_BASE, env, fetchJson, realOrStub } from './_http.js';

const CIN7_BASE = 'https://inventory.dearsystems.com/ExternalApi/v2';

function isConfigured() {
  return Boolean(env('CIN7_ACCOUNT_ID') && env('CIN7_APPLICATION_KEY'));
}

function viaBackendProxy() {
  return Boolean(API_BASE);
}

async function callCin7({ method = 'GET', path, body }) {
  if (viaBackendProxy()) {
    return fetchJson(`${API_BASE}/proxy/cin7${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  return fetchJson(`${CIN7_BASE}${path}`, {
    method,
    headers: {
      'api-auth-accountid': env('CIN7_ACCOUNT_ID'),
      'api-auth-applicationkey': env('CIN7_APPLICATION_KEY'),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const cin7 = {
  /** Sync inventory for a warehouse → write into our `inventory` table. */
  async syncInventory(warehouse_id) {
    return realOrStub({
      scope: 'cin7',
      label: `syncInventory(${warehouse_id})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const warehouse = db.get('warehouses', warehouse_id);
        const location = warehouse?.cin7_location_id || warehouse?.name;
        const data = await callCin7({ path: `/ProductAvailability?Location=${encodeURIComponent(location)}&Page=1&Limit=500` });
        const rows = data?.ProductAvailabilityList || [];
        let updated = 0;
        for (const item of rows) {
          const sku = item.SKU;
          if (!sku) continue;
          const existing = db.list('inventory', { where: { sku, warehouse_id } })[0];
          if (existing) {
            db.update('inventory', existing.id, {
              on_hand: Math.round(item.OnHand || 0),
              reserved: Math.round(item.Allocated || 0),
              last_synced_at: new Date().toISOString(),
            });
          } else {
            db.insert('inventory', {
              id: `inv_${warehouse_id}_${sku}`,
              sku,
              warehouse_id,
              on_hand: Math.round(item.OnHand || 0),
              reserved: Math.round(item.Allocated || 0),
              reorder_at: 0,
              reorder_qty: 0,
              last_synced_at: new Date().toISOString(),
            });
          }
          updated += 1;
        }
        return { synced_at: new Date().toISOString(), rows: updated };
      },
      stub: async () => {
        await delay(220, 480);
        const rows = db.list('inventory', { where: { warehouse_id } });
        // Mark them all "synced now" so the UI shows freshness.
        for (const r of rows) db.update('inventory', r.id, { last_synced_at: new Date().toISOString() });
        return { synced_at: new Date().toISOString(), rows: rows.length, stub: true };
      },
    });
  },

  /** Upsert a product in Cin7. */
  async upsertProduct(product) {
    const body = {
      Name: product.name,
      SKU: product.sku,
      Type: 'Stock',
      CostingMethod: 'FIFO',
      Description: product.description || product.summary || '',
      Category: product.category || product.cat || 'Medical Supplies',
      DefaultLocation: 'Main Warehouse',
      PriceTier1: product.price,
      Tags: (product.tags || []).join(','),
    };
    return realOrStub({
      scope: 'cin7',
      label: `upsertProduct(${product.sku})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const existing = db.list('products', { where: { sku: product.sku } })[0];
        const result = existing?.cin7_product_id
          ? await callCin7({ method: 'PUT', path: '/Products', body: { ...body, ID: existing.cin7_product_id } })
          : await callCin7({ method: 'POST', path: '/Products', body });
        db.update('products', product.sku, { cin7_product_id: result?.ID, updated_at: new Date().toISOString() });
        return { id: result?.ID, sku: product.sku };
      },
      stub: async () => {
        await delay(180, 380);
        return { id: `STUB-cin7-${product.sku}`, sku: product.sku, stub: true };
      },
    });
  },

  /** Create a Cin7 Purchase Order. */
  async createPO({ vendor_name, line_items, expected_delivery_date }) {
    const body = {
      Supplier: vendor_name,
      OrderDate: new Date().toISOString().slice(0, 10),
      ExpectedDeliveryDate: (expected_delivery_date || new Date(Date.now() + 30 * 86400000)).toISOString().slice(0, 10),
      Status: 'AUTHORISED',
      Order: { Lines: (line_items || []).map((li) => ({ SKU: li.sku, Quantity: li.qty, Price: li.cost })) },
    };
    return realOrStub({
      scope: 'cin7',
      label: `createPO(${vendor_name})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const result = await callCin7({ method: 'POST', path: '/Purchase', body });
        return { id: result?.ID, task_id: result?.TaskID };
      },
      stub: async () => {
        await delay(280, 520);
        return { id: uid('po'), stub: true };
      },
    });
  },

  /** List Cin7 locations (warehouses) so we can map to ours. */
  async listLocations() {
    return realOrStub({
      scope: 'cin7',
      label: 'listLocations',
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => (await callCin7({ path: '/Locations' }))?.LocationList || [],
      stub: async () => {
        await delay(140, 320);
        return db.list('warehouses').map((w) => ({ ID: w.id, Name: w.name, Code: w.code }));
      },
    });
  },

  /** Health/auth ping using the lightweight /Me endpoint. */
  async ping() {
    return realOrStub({
      scope: 'cin7',
      label: 'ping',
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const data = await callCin7({ path: '/Me' });
        return { ok: true, company: data?.Company, environment: 'production' };
      },
      stub: async () => ({ ok: false, stub: true, reason: 'no_credentials' }),
    });
  },

  __isConfigured: isConfigured,
};
