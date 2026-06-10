/**
 * ImportGenius client — CTO brief §7 (trade data intelligence).
 *
 * Docs: https://www.importgenius.com/api (REST, key-based; requires a
 * Premium+ subscription — see ALEX_ACTIONS.md).
 *
 * Two jobs from the brief:
 *   1. Vendor discovery — who is manufacturing/exporting product X,
 *      at what volume, shipping to which US competitors.
 *   2. Customer discovery — which US importers are bringing in the
 *      categories we stock (they buy from someone; could be us).
 *
 * Auth: X-API-Key header. Until the subscription exists the stub
 * generates deterministic, plausible shipment records so the
 * discovery workflow (search → rank → push lead to CRM) is fully
 * exercisable today.
 */

import { db } from '../db.js';
import { delay, uid } from '../format.js';
import { API_BASE, env, fetchJson, realOrStub } from './_http.js';

const IG_BASE = 'https://api.importgenius.com/v1';

function isConfigured() {
  return Boolean(env('IMPORTGENIUS_API_KEY'));
}

function viaBackendProxy() {
  return Boolean(API_BASE);
}

async function callIg({ path, body }) {
  if (viaBackendProxy()) {
    return fetchJson(`${API_BASE}/proxy/importgenius${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return fetchJson(`${IG_BASE}${path}`, {
    method: 'POST',
    headers: { 'X-API-Key': env('IMPORTGENIUS_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Deterministic stub data
// ---------------------------------------------------------------------------

const STUB_SHIPPERS = [
  ['Ningbo Surgical Devices Co', 'CN', 'Ningbo'],
  ['Jiangsu MedTex Manufacturing', 'CN', 'Shanghai'],
  ['Taichung Diagnostics Ltd', 'TW', 'Kaohsiung'],
  ['Penang Glove Industries', 'MY', 'Penang'],
  ['Guangzhou Ortho Supply', 'CN', 'Shenzhen'],
  ['Hanoi Medical Textiles', 'VN', 'Haiphong'],
  ['Shandong Diagnostic Reagents', 'CN', 'Qingdao'],
  ['Mumbai Surgical Exports', 'IN', 'Nhava Sheva'],
];

const STUB_CONSIGNEES = [
  ['Coastal Medical Distributors', 'Savannah, GA'],
  ['Meridian Health Supply', 'Memphis, TN'],
  ['TriState Surgical Partners', 'Newark, NJ'],
  ['Pacific Care Logistics', 'Long Beach, CA'],
  ['Heartland Hospital Supply', 'Kansas City, MO'],
  ['Gulf Medical Importers', 'Houston, TX'],
  ['Northstar Clinical Products', 'Chicago, IL'],
];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function stubRecords({ keyword = '', hs_code = '', role = 'shipper', limit = 12 }) {
  const q = `${keyword}|${hs_code}|${role}`;
  const seedN = hashStr(q || 'default');
  const pool = role === 'shipper' ? STUB_SHIPPERS : STUB_CONSIGNEES;
  const out = [];
  for (let i = 0; i < limit; i++) {
    const k = (seedN + i * 7) % pool.length;
    const entry = pool[k];
    const shipments = 4 + ((seedN >> (i % 16)) % 38);
    const teu = +(shipments * (0.4 + ((seedN + i) % 10) / 12)).toFixed(1);
    out.push({
      id: uid('tr'),
      role,
      company: entry[0],
      country: role === 'shipper' ? entry[1] : 'US',
      port: role === 'shipper' ? entry[2] : entry[1],
      hs_code: hs_code || ['9021.10', '4015.19', '3005.10', '3822.19'][(seedN + i) % 4],
      product_keyword: keyword || 'medical supplies',
      shipments_12mo: shipments,
      teu_12mo: teu,
      est_annual_usd: Math.round(teu * 38000),
      last_shipment: new Date(Date.now() - ((seedN + i * 13) % 60) * 86400000).toISOString(),
      sample_description: `${(keyword || 'MEDICAL SUPPLIES').toUpperCase()} HS ${hs_code || '9021.10'} — ${shipments} BLS`,
    });
  }
  out.sort((a, b) => b.teu_12mo - a.teu_12mo);
  return out;
}

// ---------------------------------------------------------------------------

export const importgenius = {
  /**
   * Search US customs records.
   * @param {object} q
   * @param {string} q.keyword   Product description keyword
   * @param {string} q.hs_code   HS/HTS prefix filter
   * @param {string} q.role      'shipper' (find vendors) | 'consignee' (find customers)
   */
  async searchShipments({ keyword = '', hs_code = '', role = 'shipper', limit = 12 } = {}) {
    const records = await realOrStub({
      scope: 'importgenius',
      label: `searchShipments(${role}:${keyword || hs_code})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const resp = await callIg({
          path: '/shipments/search',
          body: {
            query: keyword,
            hs_code,
            group_by: role,
            country: 'US',
            date_range: 'last_12_months',
            limit,
          },
        });
        return resp?.results || [];
      },
      stub: async () => {
        await delay(420, 900);
        return stubRecords({ keyword, hs_code, role, limit });
      },
    });

    // Mirror into trade_records so discovery sessions persist.
    for (const r of records) db.upsert('trade_records', r);
    return records;
  },

  async ping() {
    return realOrStub({
      scope: 'importgenius',
      label: 'ping',
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => ({ ok: true }),
      stub: async () => ({ ok: false, stub: true, reason: 'no_credentials' }),
    });
  },

  __isConfigured: isConfigured,
};
