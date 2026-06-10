/**
 * GS1 US Data Hub client — PRD-07.
 *
 * Docs:
 *   https://www.gs1us.org/tools/gs1-us-data-hub/gs1-us-apis
 *   https://documents.gs1us.org (PDF user guides)
 *
 * Auth: two headers:
 *   APIKey: <api key from GS1 US Developer Portal>
 *   X-Product-Owner-Account-Id: <8-digit GS1 account number>
 *
 * Base: https://api.gs1us.org
 *
 * Endpoints used here:
 *   GET  /api/v1/myproduct/{gtin}        verify our own product
 *   POST /api/v1/myproduct/{gtin}        create
 *   PUT  /api/v1/myproduct/{gtin}        update
 *   GET  /verified-by-gs1/v1/gtin/{gtin} verify a third-party GTIN globally
 *
 * GS1 also provides GTIN check-digit validation as a pure algorithm
 * (mod-10) which we run locally — no API call needed for the format
 * check.
 */

import { delay } from '../format.js';
import { API_BASE, env, fetchJson, realOrStub } from './_http.js';

const GS1_BASE = 'https://api.gs1us.org';

function isConfigured() {
  return Boolean(env('GS1_API_KEY') && env('GS1_ACCOUNT_ID'));
}

function viaBackendProxy() {
  return Boolean(API_BASE);
}

async function callGs1({ method = 'GET', path, body }) {
  if (viaBackendProxy()) {
    return fetchJson(`${API_BASE}/proxy/gs1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  return fetchJson(`${GS1_BASE}${path}`, {
    method,
    headers: {
      APIKey: env('GS1_API_KEY'),
      'X-Product-Owner-Account-Id': env('GS1_ACCOUNT_ID'),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** GTIN-14 check-digit validation (mod-10). Pure, no API. */
export function isValidGtin(gtin) {
  if (typeof gtin !== 'string') return false;
  const digits = gtin.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return false;
  // Normalize to 14 chars by left-padding with zeros.
  const padded = digits.padStart(14, '0');
  const checkDigit = Number(padded[13]);
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const d = Number(padded[i]);
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  const computed = (10 - (sum % 10)) % 10;
  return computed === checkDigit;
}

export const gs1 = {
  /** Format-validate a GTIN locally + (if configured) verify against GS1 registry. */
  async validateGTIN(gtin) {
    const formatValid = isValidGtin(gtin);
    if (!formatValid) {
      return { gtin, valid: false, reason: 'invalid_check_digit', validated_at: new Date().toISOString() };
    }
    return realOrStub({
      scope: 'gs1',
      label: `validateGTIN(${gtin})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        try {
          const data = await callGs1({ path: `/verified-by-gs1/v1/gtin/${gtin}` });
          return {
            gtin,
            valid: true,
            registry_status: data?.gtinStatus || 'unknown',
            brand_name: data?.brandName,
            company_name: data?.companyName,
            product_description: data?.productDescription,
            validated_at: new Date().toISOString(),
          };
        } catch (err) {
          if (err.status === 404) {
            return { gtin, valid: false, reason: 'not_in_registry', validated_at: new Date().toISOString() };
          }
          throw err;
        }
      },
      stub: async () => {
        await delay(120, 240);
        return { gtin, valid: true, registry_status: 'stub', validated_at: new Date().toISOString(), stub: true };
      },
    });
  },

  /** Batch validation (up to 1000 per call). */
  async validateBatch(gtins) {
    return Promise.all((gtins || []).map((g) => this.validateGTIN(g)));
  },

  /** Look up our own product in MyProduct. */
  async getMyProduct(gtin) {
    return realOrStub({
      scope: 'gs1',
      label: `getMyProduct(${gtin})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        try {
          return await callGs1({ path: `/api/v1/myproduct/${gtin}` });
        } catch (err) {
          if (err.status === 404) return null;
          throw err;
        }
      },
      stub: async () => {
        await delay(120, 240);
        return { gtin, stub: true };
      },
    });
  },

  __isConfigured: isConfigured,
  __isValidGtin: isValidGtin,
};
