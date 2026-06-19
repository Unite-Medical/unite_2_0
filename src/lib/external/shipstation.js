/**
 * ShipStation v1 client — PRD-04 Phase 3 (direct, bypassing Shopify).
 *
 * Docs:
 *   https://docs.shipstation.com/apis/shipstation-v1/openapi
 *
 * Auth: Basic auth — base64(API_KEY:API_SECRET) in Authorization header.
 * Base: https://ssapi.shipstation.com
 *
 * Endpoints used here:
 *   POST /orders/createorder         create/update one order
 *   POST /orders/createorders        batch
 *   POST /shipments/getrates         rate shop FedEx/UPS/USPS
 *   POST /shipments/createlabel      create + buy a label (returns base64 PDF)
 *
 * Webhook events handled server-side:
 *   ORDER_NOTIFY, SHIP_NOTIFY
 */

import { db } from '../db.js';
import { delay, uid } from '../format.js';
import { API_BASE, env, fetchJson, realOrStub } from './_http.js';

const SHIPSTATION_BASE = 'https://ssapi.shipstation.com';

function isConfigured() {
  return Boolean(env('SHIPSTATION_API_KEY') && env('SHIPSTATION_API_SECRET'));
}

function viaBackendProxy() {
  return Boolean(API_BASE);
}

function basicAuth() {
  const creds = `${env('SHIPSTATION_API_KEY')}:${env('SHIPSTATION_API_SECRET')}`;
  // btoa is browser-safe; Buffer would be needed in Node. We only
  // call this from a Node backend in real-mode, but include btoa for
  // server-side-rendered fallback dev.
  if (typeof btoa === 'function') return btoa(creds);
  // eslint-disable-next-line no-undef
  return Buffer.from(creds, 'utf-8').toString('base64');
}

async function callSS({ method = 'POST', path, body }) {
  if (viaBackendProxy()) {
    return fetchJson(`${API_BASE}/proxy/shipstation${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  return fetchJson(`${SHIPSTATION_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const FALLBACK_RATES = [
  { service: 'fedex_ground',     label: 'FedEx Ground',                amount: 0,  transit_days: 4 },
  { service: 'ups_ground',       label: 'UPS Ground',                  amount: 0,  transit_days: 4 },
  { service: 'fedex_2day',       label: 'FedEx 2Day',                  amount: 38, transit_days: 2 },
  { service: 'fedex_overnight',  label: 'FedEx Standard Overnight',    amount: 95, transit_days: 1 },
];

export const shipstation = {
  /** Rate shop across carriers. */
  async getRates({ weight_lbs = 12, from_zip = '30122', to_zip = '30301', carrier_code }) {
    const body = {
      carrierCode: carrier_code, // optional — omit to fetch all carriers
      fromPostalCode: from_zip,
      toPostalCode: to_zip,
      weight: { value: weight_lbs, units: 'pounds' },
      packageCode: 'package',
    };
    return realOrStub({
      scope: 'shipstation',
      label: 'getRates',
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const resp = await callSS({ path: '/shipments/getrates', body });
        return (resp || []).map((r) => ({
          service: r.serviceCode,
          label: r.serviceName,
          amount: r.shipmentCost,
          transit_days: r.transitDays || r.deliveryDays || null,
        }));
      },
      stub: async () => {
        await delay(140, 320);
        return FALLBACK_RATES.map((r) => ({ ...r, amount: r.amount + Math.max(0, (weight_lbs - 10) * 0.6) }));
      },
    });
  },

  /** Create order + label in one shot (typical fulfillment path). */
  async createLabel({ order_id, carrier = 'fedex', service = 'fedex_ground', warehouse_id = 'wh_atl', weight_lbs = 12, ship_to, ship_from, bill_to_third_party }) {
    const body = {
      carrierCode: carrier,
      serviceCode: service,
      packageCode: 'package',
      confirmation: 'delivery',
      shipDate: new Date().toISOString().slice(0, 10),
      weight: { value: weight_lbs, units: 'pounds' },
      // PRD-27 §6: ship-from identity may be a distributor's brand for blind
      // shipments; defaults to Unite's warehouse.
      shipFrom: ship_from || {
        name: 'Unite Medical',
        company: 'Unite Medical',
        street1: '1487 Trae Lane',
        city: 'Lithia Springs',
        state: 'GA',
        postalCode: '30122',
        country: 'US',
      },
      shipTo: ship_to || {
        name: 'Customer', street1: '1 Customer Way', city: 'Atlanta', state: 'GA', postalCode: '30301', country: 'US',
      },
      // PRD-27 §8: third-party billing — charge the distributor's carrier
      // account instead of Unite's.
      ...(bill_to_third_party ? {
        advancedOptions: {
          billToParty: 'third_party',
          billToAccount: bill_to_third_party.account_number,
          billToPostalCode: bill_to_third_party.billing_zip,
        },
      } : {}),
      testLabel: !isConfigured(),
    };
    return realOrStub({
      scope: 'shipstation',
      label: `createLabel(${order_id})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const resp = await callSS({ path: '/shipments/createlabel', body });
        const row = db.insert('shipstation_labels', {
          id: `ssl_${order_id}`,
          shipstation_order_id: String(resp.shipmentId),
          order_id,
          carrier,
          service,
          tracking_number: resp.trackingNumber,
          label_url: `data:application/pdf;base64,${resp.labelData}`,
          warehouse_id,
          weight_lbs,
          status: 'label_created',
          cost: resp.shipmentCost,
        });
        return { tracking_number: row.tracking_number, label_url: row.label_url, carrier, cost: row.cost };
      },
      stub: async () => {
        await delay(320, 720);
        const tracking = `1Z${Math.floor(Math.random() * 9e10).toString().padStart(11, '0')}`;
        const row = db.insert('shipstation_labels', {
          id: uid('ssl'),
          order_id,
          carrier,
          service,
          tracking_number: tracking,
          warehouse_id,
          weight_lbs,
          status: 'label_created',
          cost: 12.45,
        });
        return { tracking_number: tracking, label_url: `https://ss-labels.example/${row.id}.pdf`, carrier };
      },
    });
  },

  /** Webhook entrypoint (server-side). */
  async handleWebhookEvent(event) {
    const { resource_type, resource_url } = event || {};
    if (resource_type === 'SHIP_NOTIFY') {
      db.insert('audit_log', { id: uid('aud'), kind: 'shipstation.shipped', ref_id: resource_url, payload: event });
      return { ok: true, kind: 'ship' };
    }
    if (resource_type === 'ORDER_NOTIFY') {
      db.insert('audit_log', { id: uid('aud'), kind: 'shipstation.order_change', ref_id: resource_url, payload: event });
      return { ok: true, kind: 'order' };
    }
    return { ok: false, reason: `unhandled_${resource_type}` };
  },

  __isConfigured: isConfigured,
};
