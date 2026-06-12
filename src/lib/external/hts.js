/**
 * USITC Harmonized Tariff Schedule REST client.
 *
 * PRD-08 Phase 2. The USITC publishes the HTS as a free REST API
 * (hts.usitc.gov) but without CORS headers, so the browser routes
 * through our serverless hop at `${API_BASE}/proxy/hts`
 * (api/proxy/hts.js) which normalizes the response to
 * `{ hts_code, description, mfn, special }`. On any failure we fall
 * back to the embedded rate table so the demo + offline dev still
 * work and quoting never blocks on tariff lookups.
 */

import { API_BASE } from './_http.js';

const PROXY_BASE = API_BASE;
const REQUEST_TIMEOUT_MS = 4500;

// Embedded rate table — current as of April 2026 per the source spec.
// Rates here are 'mfn' (general column). Special-program rates are
// 0 unless we know otherwise.
const FALLBACK_RATES = {
  '9021.10': { description: 'Orthopedic appliances', mfn: 0, special: 0 },
  '3822.19': { description: 'Diagnostic reagents', mfn: 0, special: 0 },
  '4015.19': { description: 'Surgical gloves', mfn: 0, special: 0 },
  '3005.10': { description: 'Adhesive dressings', mfn: 0, special: 0 },
  '3004.90': { description: 'Pharmaceuticals (other)', mfn: 0, special: 0 },
  '6307.90': { description: 'PPE / textiles (other)', mfn: 7.0, special: 0 },
  '6115.10': { description: 'Compression hosiery', mfn: 14.6, special: 0 },
  '9025.19': { description: 'Thermometers', mfn: 0, special: 0 },
  '3824.99': { description: 'Therapy gel', mfn: 5.0, special: 0 },
  '9018.31': { description: 'Syringes', mfn: 0, special: 0 },
  '9018.39': { description: 'Catheters, cannulae', mfn: 0, special: 0 },
  '9018.90': { description: 'Other medical instruments', mfn: 0, special: 0 },
  '3923.30': { description: 'Pharmaceutical containers', mfn: 3.0, special: 0 },
  '3926.90': { description: 'Other plastic articles', mfn: 5.3, special: 0 },
  '9402.90': { description: 'Medical furniture', mfn: 0, special: 0 },
};

const cache = new Map(); // hts_code -> { at, data }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — tariff schedule rarely changes mid-day

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  return hit.data;
}
function cacheSet(key, data) { cache.set(key, { at: Date.now(), data }); }

function warn(msg) {
  const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
  if (isDev) console.warn(`[hts] ${msg}`);
}

// Try the backend proxy first (PRD-01); fall back to embedded table.
async function fetchViaProxy(htsCode) {
  if (!PROXY_BASE) return null; // no backend yet
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${PROXY_BASE}/proxy/hts?code=${encodeURIComponent(htsCode)}`, { signal: ctl.signal });
    if (!res.ok) throw new Error(`hts proxy ${res.status}`);
    return await res.json();
  } catch (err) {
    warn(`proxy lookup(${htsCode}) failed: ${err.message}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Look up a single HTS code.
 *
 * @param {string} htsCode  4-, 6-, 8-, or 10-digit HTS code (e.g. "6307.90")
 * @returns {Promise<{hts_code, description, mfn, special, retrieved_at, fallback?}>}
 */
async function lookup(htsCode) {
  if (!htsCode) return { hts_code: '', description: '(missing)', mfn: 0, special: 0, retrieved_at: new Date().toISOString(), fallback: true };
  const code = String(htsCode).trim();
  const cached = cacheGet(code);
  if (cached) return cached;

  // Try backend proxy
  const real = await fetchViaProxy(code);
  if (real) {
    const data = { ...real, retrieved_at: new Date().toISOString() };
    cacheSet(code, data);
    return data;
  }

  // Embedded fallback. We also do a "best prefix match" — e.g. if
  // someone queries 6307.9000 and we have 6307.90, use it.
  const exact = FALLBACK_RATES[code];
  if (exact) {
    const data = { hts_code: code, ...exact, retrieved_at: new Date().toISOString(), fallback: true };
    cacheSet(code, data);
    return data;
  }
  const prefixMatch = Object.entries(FALLBACK_RATES).find(([k]) => code.startsWith(k));
  if (prefixMatch) {
    const data = { hts_code: code, ...prefixMatch[1], retrieved_at: new Date().toISOString(), fallback: true, prefix_match: prefixMatch[0] };
    cacheSet(code, data);
    return data;
  }

  // Last resort: assume the "other" rate. 6.7% is the rough median
  // of medical-supply chapters per the USITC schedule.
  const data = { hts_code: code, description: 'Other (provisional)', mfn: 6.7, special: 0, retrieved_at: new Date().toISOString(), fallback: true };
  cacheSet(code, data);
  return data;
}

/** Batch helper — used by the quoting engine for vendor sheets. */
async function lookupBatch(codes) {
  return Promise.all((codes || []).map((c) => lookup(c)));
}

export const hts = {
  lookup,
  lookupBatch,
  __cache: cache,
  __FALLBACK_RATES: FALLBACK_RATES,
};
