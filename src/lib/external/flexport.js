/**
 * Flexport client — PRD-03.
 *
 * Docs:
 *   https://developers.flexport.com/s/api
 *   https://developers.flexport.com/tutorials/shipment-api-tutorial/
 *   https://developers.flexport.com/tutorials/using-api-credentials/
 *
 * Auth: Bearer token. Either:
 *   - permanent API key (FLEXPORT_API_KEY), or
 *   - OAuth client_credentials → JWT exchange against /oauth/token
 *     (FLEXPORT_CLIENT_ID + FLEXPORT_CLIENT_SECRET)
 *
 * Header: `Flexport-Version: 2`
 *
 * Endpoints used here:
 *   GET    /shipments
 *   GET    /shipments/{id}
 *   POST   /booking_quotes               (freight quote for our quoting engine)
 *   POST   /shipments                    (create booking when PO ships)
 *   GET    /invoices
 *   GET    /products
 *   POST   /products                     (sync our SKU → Flexport)
 *
 * Webhook events handled (server-side; receiver at /hooks/flexport):
 *   shipment.departed, shipment.arrived, shipment.cleared,
 *   shipment.delivered, shipment.exception.
 */

import { db } from '../db.js';
import { delay, uid } from '../format.js';
import { API_BASE, env, fetchJson, realOrStub, warn } from './_http.js';

const FLEXPORT_BASE = 'https://api.flexport.com';
const FLEXPORT_API_VERSION = '2';

let tokenCache = null;

function isConfigured() {
  return Boolean(env('FLEXPORT_API_KEY') || (env('FLEXPORT_CLIENT_ID') && env('FLEXPORT_CLIENT_SECRET')));
}

function viaBackendProxy() {
  return Boolean(API_BASE);
}

async function getAccessToken() {
  const direct = env('FLEXPORT_API_KEY');
  if (direct) return direct;

  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const body = {
    client_id: env('FLEXPORT_CLIENT_ID'),
    client_secret: env('FLEXPORT_CLIENT_SECRET'),
    audience: 'https://api.flexport.com',
    grant_type: 'client_credentials',
  };
  const resp = await fetchJson(`${FLEXPORT_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const { access_token, expires_in = 86400 } = resp;
  tokenCache = { token: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

async function callFlexport({ method = 'GET', path, body }) {
  if (viaBackendProxy()) {
    return fetchJson(`${API_BASE}/proxy/flexport${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  const token = await getAccessToken();
  return fetchJson(`${FLEXPORT_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Flexport-Version': FLEXPORT_API_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const flexport = {
  /** List recent shipments. Used to mirror upstream state into our DB. */
  async listShipments({ limit = 50 } = {}) {
    return realOrStub({
      scope: 'flexport',
      label: 'listShipments',
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const resp = await callFlexport({ path: `/shipments?per=${limit}&sort=updated_at&direction=desc` });
        return resp?.data?.data || [];
      },
      stub: async () => {
        await delay(180, 360);
        return db.list('flexport_shipments', { orderBy: 'created_at', dir: 'desc', limit });
      },
    });
  },

  /**
   * Get a freight quote (used by the quoting engine, PRD-08 §7).
   * Real upstream uses /booking_quotes; the response shape mirrors
   * what the engine already expects.
   */
  async getFreightQuote({ origin = 'CNSHA', destination = 'USATL', mode = 'LCL', cbm = 1.8, weight_kg = 220 }) {
    const body = { origin, destination, mode, cbm, weight_kg };
    return realOrStub({
      scope: 'flexport',
      label: `getFreightQuote(${origin}→${destination})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const resp = await callFlexport({ method: 'POST', path: '/booking_quotes', body });
        // Real shape varies — normalize to {data: {rates: [...]}}.
        return { data: { id: resp?.data?.id || uid('flx_quote'), origin_port: origin, destination_port: destination, mode, rates: resp?.data?.rates || [] } };
      },
      stub: async () => {
        await delay(280, 520);
        // AIR is priced per kg (chargeable weight), ocean per shipment+CBM.
        const base = mode === 'FCL' ? 4200 : mode === 'AIR' ? Math.max(900, weight_kg * 5.8) : 412;
        const std = mode === 'FCL' ? 32 : mode === 'AIR' ? 6 : 28;
        const exp = mode === 'FCL' ? 22 : mode === 'AIR' ? 3 : 18;
        return {
          data: {
            id: uid('flx_quote'),
            origin_port: origin,
            destination_port: destination,
            mode,
            cbm,
            weight_kg,
            rates: [
              { service: 'standard',  total_usd: +(base * (1 + cbm / 25)).toFixed(2),       transit_days: std, valid_until: new Date(Date.now() + 7 * 86400000).toISOString() },
              { service: 'expedited', total_usd: +(base * 1.4 * (1 + cbm / 25)).toFixed(2), transit_days: exp, valid_until: new Date(Date.now() + 7 * 86400000).toISOString() },
            ],
          },
        };
      },
    });
  },

  /** Create a real booking against a PO. */
  async createShipment({ vendor_id, mode, line_items, origin, destination }) {
    const body = {
      mode,
      origin_port: origin,
      destination_port: destination,
      vendor_id,
      line_items: (line_items || []).map((li) => ({
        product_sku: li.product_sku || li.sku,
        qty: li.qty,
        description: li.name,
      })),
    };
    return realOrStub({
      scope: 'flexport',
      label: 'createShipment',
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const resp = await callFlexport({ method: 'POST', path: '/shipments', body });
        const row = db.insert('flexport_shipments', {
          id: uid('flx_shp'),
          flexport_shipment_id: resp?.data?.id,
          vendor_id, mode,
          origin_port: origin, destination_port: destination,
          line_items_count: line_items?.length || 0,
          status: 'booked',
          eta: resp?.data?.eta_at,
          customer_facing: false,
        });
        return { data: row };
      },
      stub: async () => {
        await delay(320, 600);
        const row = db.insert('flexport_shipments', {
          id: uid('flx_shp'),
          flexport_shipment_id: `STUB-${uid('flx_shp')}`,
          vendor_id, mode,
          origin_port: origin || 'CNSHA',
          destination_port: destination || 'USATL',
          line_items_count: line_items?.length || 0,
          status: 'booked',
          eta: new Date(Date.now() + 28 * 86400000).toISOString(),
          customer_facing: false,
        });
        return { data: row };
      },
    });
  },

  /**
   * Webhook event handler. Called by the server-side /hooks/flexport
   * receiver once the signature is verified.
   */
  async handleWebhookEvent(event) {
    const { type, data } = event || {};
    if (!type) return { ok: false, reason: 'no_event_type' };
    const shipment_id = data?.shipment?.id || data?.id;
    const mirror = db.list('flexport_shipments', { where: { flexport_shipment_id: shipment_id } })[0];
    if (!mirror) {
      warn('flexport', `webhook ${type} for unknown shipment ${shipment_id}`);
      return { ok: false, reason: 'unknown_shipment' };
    }
    const statusByEvent = {
      'shipment.departed':  'departed',
      'shipment.arrived':   'arrived',
      'shipment.cleared':   'cleared',
      'shipment.delivered': 'delivered',
      'shipment.exception': 'exception',
    };
    const status = statusByEvent[type];
    if (!status) return { ok: false, reason: `unhandled_event_${type}` };

    db.update('flexport_shipments', mirror.id, {
      status,
      eta: data?.shipment?.eta_at || mirror.eta,
      raw_events: [...(mirror.raw_events || []), event],
    });
    db.insert('audit_log', { id: uid('aud'), kind: `flexport.${status}`, ref_id: mirror.id, payload: event });

    // Downstream side-effects per PRD-03 §4 — the "enter data once"
    // chain: inventory receive → QBO landed-cost bill → run-rate
    // reorder recalc. Dynamic import avoids a static cycle
    // (receiving.js → services.js → flexport.js).
    if (status === 'cleared') {
      try {
        const { receiveClearedShipment } = await import('../receiving.js');
        const fresh = db.get('flexport_shipments', mirror.id);
        const result = await receiveClearedShipment(fresh);
        return { ok: true, status, receiving: result };
      } catch (err) {
        warn('flexport', `receiving chain failed for ${mirror.id}: ${err.message}`);
        db.insert('audit_log', { id: uid('aud'), kind: 'flexport.cleared.receiving_failed', ref_id: mirror.id, payload: { error: err.message } });
      }
    }

    return { ok: true, status };
  },

  __isConfigured: isConfigured,
};
