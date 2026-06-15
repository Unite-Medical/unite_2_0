/**
 * Exchange-rate client — PRD-22 (multi-currency vendor sheets).
 *
 * Vendors quote in their home currency (CNY, EUR, INR, …). To compare
 * landed cost we normalize every FOB price to USD. Rates come from the
 * free open.er-api.com endpoint (no key), cached in the `exchange_rates`
 * table for 12h. If the network is unavailable we fall back to a static
 * table so the quoting engine always produces a number — flagged as
 * `stale` so the rep knows to refresh before sending.
 */

import { db } from '../db.js';
import { uid } from '../format.js';

export const BASE = 'USD';
const TTL_MS = 12 * 60 * 60 * 1000;
const ENDPOINT = 'https://open.er-api.com/v6/latest/USD';

// USD → currency multipliers. Refreshed periodically; only a fallback.
const FALLBACK = {
  USD: 1, EUR: 0.92, GBP: 0.79, CNY: 7.24, JPY: 157.2, KRW: 1370, INR: 83.4,
  VND: 25400, TWD: 32.3, HKD: 7.81, SGD: 1.35, AUD: 1.51, CAD: 1.37,
  CHF: 0.90, MXN: 18.6, BRL: 5.45, THB: 36.5, MYR: 4.71, IDR: 16250,
  PHP: 58.4, PKR: 278, TRY: 32.3, ZAR: 18.4, PLN: 3.98, SEK: 10.6,
  NOK: 10.8, DKK: 6.87, AED: 3.67, SAR: 3.75, ILS: 3.72, NZD: 1.64,
};

// Currency aliases / symbols vendors actually type in spreadsheets.
export const CURRENCY_ALIASES = {
  '$': 'USD', us$: 'USD', usd: 'USD', dollar: 'USD', dollars: 'USD',
  '€': 'EUR', eur: 'EUR', euro: 'EUR', euros: 'EUR',
  '£': 'GBP', gbp: 'GBP', pound: 'GBP', sterling: 'GBP',
  '¥': 'CNY', cny: 'CNY', rmb: 'CNY', yuan: 'CNY', renminbi: 'CNY', '人民币': 'CNY', '元': 'CNY',
  jpy: 'JPY', yen: 'JPY', '円': 'JPY',
  krw: 'KRW', won: 'KRW', '₩': 'KRW', '원': 'KRW',
  inr: 'INR', rupee: 'INR', rupees: 'INR', '₹': 'INR',
  vnd: 'VND', dong: 'VND', '₫': 'VND',
  twd: 'TWD', ntd: 'TWD', hkd: 'HKD', sgd: 'SGD', aud: 'AUD', cad: 'CAD',
  chf: 'CHF', mxn: 'MXN', brl: 'BRL', thb: 'THB', baht: 'THB',
  myr: 'MYR', ringgit: 'MYR', idr: 'IDR', rupiah: 'IDR', php: 'PHP', peso: 'PHP',
};

/** Normalize a free-text currency token to an ISO code, or null. */
export function normalizeCurrency(token) {
  if (!token) return null;
  const t = String(token).trim();
  if (/^[A-Za-z]{3}$/.test(t) && FALLBACK[t.toUpperCase()]) return t.toUpperCase();
  const key = t.toLowerCase();
  return CURRENCY_ALIASES[key] || CURRENCY_ALIASES[t] || null;
}

function cached() {
  const row = db.list('exchange_rates', { orderBy: 'fetched_at', dir: 'desc' })[0];
  if (!row) return null;
  const fresh = Date.now() - new Date(row.fetched_at).getTime() < TTL_MS;
  return { rates: row.rates, fresh, fetched_at: row.fetched_at };
}

/**
 * Return a USD-based rate table { CODE: usdPerUnitMultiplier } plus a
 * `stale` flag. Fetches once per TTL; falls back to static rates.
 */
export async function getRates() {
  const c = cached();
  if (c?.fresh) return { rates: c.rates, stale: false };

  if (typeof fetch === 'function') {
    try {
      const res = await fetch(ENDPOINT);
      if (res.ok) {
        const data = await res.json();
        if (data?.rates && data.result !== 'error') {
          db.insert('exchange_rates', { id: uid('fx'), base: BASE, rates: data.rates, fetched_at: new Date().toISOString(), source: 'open.er-api.com' });
          return { rates: data.rates, stale: false };
        }
      }
    } catch { /* offline — fall through */ }
  }
  return { rates: c?.rates || FALLBACK, stale: true };
}

/** Convert `amount` from one currency to another. */
export async function convert(amount, from, to = BASE) {
  const f = normalizeCurrency(from) || String(from || BASE).toUpperCase();
  const t = normalizeCurrency(to) || String(to || BASE).toUpperCase();
  if (f === t) return { amount: +amount, rate: 1, stale: false };
  const { rates, stale } = await getRates();
  const rf = rates[f] ?? FALLBACK[f];
  const rt = rates[t] ?? FALLBACK[t];
  if (!rf || !rt) return { amount: +amount, rate: 1, stale: true, unknown: true };
  // rates are USD→X, so X→Y = (1/rf) * rt
  const rate = rt / rf;
  return { amount: +(amount * rate).toFixed(4), rate: +rate.toFixed(6), stale };
}

/** Convenience: normalize an amount to USD. */
export async function toUsd(amount, currency) {
  return convert(amount, currency, BASE);
}

export const exchangeRates = { getRates, convert, toUsd, normalizeCurrency, BASE };
