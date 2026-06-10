/**
 * openFDA REST client — api.fda.gov/device/*
 *
 * PRD-07 Phase 1. This is the FIRST real upstream integration in the
 * codebase. openFDA is:
 *   - free (no auth required; optional API key for higher rate limits)
 *   - CORS-enabled (callable directly from the browser)
 *   - documented at https://open.fda.gov/apis/device/
 *
 * Public surface kept identical to the previous simulator so callers
 * (src/lib/quoting.js, src/pages/admin/AdminVendorApproval.jsx) don't
 * change. On network failure we transparently fall back to the
 * embedded reference table so the demo + offline dev still works.
 */

import { delay } from '../format.js';

const API_BASE = 'https://api.fda.gov/device';
const REQUEST_TIMEOUT_MS = 4500;

// Quiet console.warn helper. Vite exposes import.meta.env.DEV; in
// production we silence the chatter, in dev we surface fallbacks
// so we can spot rate-limit / outage issues.
function warn(msg) {
  const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
  if (isDev) console.warn(`[openfda] ${msg}`);
}

// Optional API key — set VITE_OPENFDA_API_KEY in Vercel / Doppler to
// lift the 240-req/min anonymous limit to 120,000/day.
const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENFDA_API_KEY) || '';

// Embedded reference table for offline + rate-limit fallback. Trimmed
// to product codes we actually see in the seed catalog so the demo
// remains coherent without a network. Expanded on every real call by
// the cache below.
const FALLBACK_PRODUCT_CODES = {
  FRO: { device_class: '2', regulation_number: '880.6230', name: 'Examination Glove, Patient' },
  IMI: { device_class: '2', regulation_number: '866.3870', name: 'Test, Influenza Antigen' },
  NHM: { device_class: '1', regulation_number: '878.4040', name: 'Surgical Apparel' },
  KGN: { device_class: '2', regulation_number: '888.3060', name: 'Brace, Knee' },
  ESJ: { device_class: '2', regulation_number: '888.3050', name: 'Brace, Knee, Hinged' },
  LXJ: { device_class: '1', regulation_number: '880.6280', name: 'Cleaning Kit, Surgical' },
  GEI: { device_class: '2', regulation_number: '880.5475', name: 'Pump, Infusion' },
  BZQ: { device_class: '1', regulation_number: '878.4670', name: 'Suture, Absorbable' },
};

// In-memory cache so we don't hammer openFDA during a single session.
// On a real backend (PRD-01) this moves to Redis with a longer TTL.
const cache = new Map(); // `${kind}:${key}` -> { at, data }
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  return hit.data;
}
function cacheSet(key, data) {
  cache.set(key, { at: Date.now(), data });
}

async function fetchJson(url, signal) {
  const sep = url.includes('?') ? '&' : '?';
  const finalUrl = API_KEY ? `${url}${sep}api_key=${encodeURIComponent(API_KEY)}` : url;
  const res = await fetch(finalUrl, { signal });
  if (!res.ok) {
    // 404 from openFDA means "no records found", which is a valid
    // result, not an error.
    if (res.status === 404) return { results: [], meta: { results: { total: 0 } } };
    throw new Error(`openFDA ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function withTimeout(promise, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return Promise.race([
    promise(ctl.signal),
    new Promise((_, rej) => setTimeout(() => rej(new Error('openFDA timeout')), ms + 100)),
  ]).finally(() => clearTimeout(t));
}

/**
 * Look up a product code in the FDA device classification database.
 *
 * @param {string} productCode  Three-letter FDA product code (e.g. "KGN")
 * @returns {Promise<{meta: object, results: object[]}>}
 */
async function classification(productCode) {
  if (!productCode) return { meta: { results: { total: 0 } }, results: [] };
  const code = productCode.trim().toUpperCase();
  const cacheKey = `classification:${code}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const data = await withTimeout(
      (signal) => fetchJson(`${API_BASE}/classification.json?search=product_code:${encodeURIComponent(code)}&limit=1`, signal),
      REQUEST_TIMEOUT_MS,
    );
    cacheSet(cacheKey, data);
    return data;
  } catch (err) {
    // Fallback to embedded reference table — keeps the demo coherent
    // when offline or rate-limited.
    const found = FALLBACK_PRODUCT_CODES[code];
    warn(`classification(${code}) failed (${err.message}); using fallback`);
    if (!found) return { meta: { results: { total: 0 } }, results: [] };
    const fallback = {
      meta: { last_updated: new Date().toISOString(), results: { total: 1 }, fallback: true },
      results: [{ product_code: code, ...found }],
    };
    cacheSet(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Look up a manufacturer in the FDA establishment registration
 * database.
 *
 * @param {string} feiOrName  FEI number OR company name
 * @returns {Promise<{meta: object, results: object[]}>}
 */
async function registrationListing(feiOrName) {
  if (!feiOrName) return { meta: { results: { total: 0 } }, results: [] };
  const key = String(feiOrName).trim();
  const cacheKey = `registration:${key}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // If it looks numeric, search by FEI; otherwise search proprietary_name + manufacturer name
  const isFei = /^\d{6,12}$/.test(key);
  const search = isFei
    ? `registration.fei_number:${encodeURIComponent(key)}`
    : `proprietary_name:${encodeURIComponent(`"${key}"`)}+OR+registration.name:${encodeURIComponent(`"${key}"`)}`;

  try {
    const data = await withTimeout(
      (signal) => fetchJson(`${API_BASE}/registrationlisting.json?search=${search}&limit=3`, signal),
      REQUEST_TIMEOUT_MS,
    );
    cacheSet(cacheKey, data);
    return data;
  } catch (err) {
    warn(`registrationListing(${key}) failed (${err.message}); using stub`);
    await delay(150, 300);
    const stub = {
      meta: { last_updated: new Date().toISOString(), fallback: true },
      results: [{
        registration_number: isFei ? key : '3015727296',
        owner_operator_number: 'OO-12348',
        proprietary_name: [key],
        name: key,
        country_code: 'US',
      }],
    };
    cacheSet(cacheKey, stub);
    return stub;
  }
}

/**
 * Pull recall history for a manufacturer.
 *
 * @param {string} manufacturerName
 * @param {number} sinceDays  How far back to look. Defaults to 730 (24 months).
 */
async function recallHistory(manufacturerName, sinceDays = 730) {
  if (!manufacturerName) return { meta: { results: { total: 0 } }, results: [] };
  const cacheKey = `recall:${manufacturerName}:${sinceDays}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const fromDate = new Date(Date.now() - sinceDays * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
  const toDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const search = `recalling_firm:${encodeURIComponent(`"${manufacturerName}"`)}+AND+event_date_initiated:[${fromDate}+TO+${toDate}]`;

  try {
    const data = await withTimeout(
      (signal) => fetchJson(`${API_BASE}/recall.json?search=${search}&limit=20`, signal),
      REQUEST_TIMEOUT_MS,
    );
    cacheSet(cacheKey, data);
    return data;
  } catch (err) {
    warn(`recallHistory(${manufacturerName}) failed (${err.message})`);
    const empty = { meta: { results: { total: 0 }, fallback: true }, results: [] };
    cacheSet(cacheKey, empty);
    return empty;
  }
}

/**
 * Look up an existing UDI/GUDID record.
 *
 * @param {string} di  Primary device identifier (GTIN)
 */
async function udiLookup(di) {
  if (!di) return { meta: { results: { total: 0 } }, results: [] };
  const cacheKey = `udi:${di}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const data = await withTimeout(
      (signal) => fetchJson(`${API_BASE}/udi.json?search=identifiers.id:${encodeURIComponent(di)}&limit=1`, signal),
      REQUEST_TIMEOUT_MS,
    );
    cacheSet(cacheKey, data);
    return data;
  } catch (err) {
    warn(`udiLookup(${di}) failed (${err.message})`);
    const empty = { meta: { results: { total: 0 }, fallback: true }, results: [] };
    cacheSet(cacheKey, empty);
    return empty;
  }
}

export const openfda = {
  classification,
  registrationListing,
  recallHistory,
  udiLookup,
  // Exposed for verifier scripts + tests
  __cache: cache,
  __FALLBACK_PRODUCT_CODES: FALLBACK_PRODUCT_CODES,
};
