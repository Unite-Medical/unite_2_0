/**
 * Catalog matching engine — the "no-EDI intake" play (Cato-gap feature).
 *
 * Two jobs:
 *   1. parse + match a free-text shortage / backorder list against the
 *      stocked catalog (exact SKU, HCPCS, or fuzzy description match), and
 *   2. suggest stocked functional equivalents ("substitutes") for any
 *      product or unmatched description.
 *
 * Pure, deterministic, synchronous — runs entirely in the browser so the
 * matcher feels instant (results re-rank on every keystroke). On the real
 * backend this same scoring moves behind POST /v1/shortage-lists with
 * pg_trgm doing the heavy lifting; the Claude layer (prompts/) can then
 * re-rank ambiguous lines. See PRD-13.
 */

import { REAL_PRODUCTS } from '../data/realCatalog.js';

/* ------------------------------------------------------------------ */
/* Tokenizing                                                          */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'for', 'and', 'or', 'with', 'by', 'per', 'to', 'in',
  'box', 'case', 'each', 'ea', 'pack', 'pk', 'ct', 'count', 'unit', 'units',
  'need', 'needed', 'qty', 'quantity', 'backorder', 'backordered', 'b/o',
]);

// Domain synonyms — buyers write "flu test", catalog says "influenza".
const SYNONYMS = {
  flu: 'influenza',
  exam: 'examination',
  gloves: 'glove',
  braces: 'brace',
  tests: 'test',
  kits: 'kit',
  masks: 'mask',
  gowns: 'gown',
  strep: 'strep',
  covid: 'covid',
  knee: 'knee',
  ankle: 'ankle',
  wrist: 'wrist',
  back: 'back',
  nitrile: 'nitrile',
  latex: 'latex',
  xl: 'xlarge',
};

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((t) => SYNONYMS[t] || t)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* ------------------------------------------------------------------ */
/* Search index (built once per session)                               */
/* ------------------------------------------------------------------ */

let INDEX = null;

function buildIndex() {
  if (INDEX) return INDEX;
  INDEX = REAL_PRODUCTS.map((p) => ({
    product: p,
    sku: normCode(p.sku),
    hcpcs: normCode(p.hcpcs && p.hcpcs !== '—' ? p.hcpcs : ''),
    nameTokens: new Set(tokenize(p.name)),
    bodyTokens: new Set(tokenize(`${p.product_type || ''} ${(p.tags || []).join(' ')} ${p.summary || ''}`)),
    category: p.category,
  }));
  return INDEX;
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

function scoreEntry(entry, tokens, code) {
  let score = 0;
  if (code) {
    if (entry.sku === code) return 100;                       // exact SKU
    if (entry.hcpcs && entry.hcpcs === code) score += 40;     // HCPCS match
    else if (entry.sku.includes(code) && code.length >= 4) score += 25;
  }
  let nameHits = 0;
  let bodyHits = 0;
  for (const t of tokens) {
    if (entry.nameTokens.has(t)) nameHits += 1;
    else if (entry.bodyTokens.has(t)) bodyHits += 1;
  }
  if (tokens.length) {
    score += (nameHits / tokens.length) * 50;   // coverage of the query
    score += Math.min(bodyHits, 3) * 4;
    if (nameHits >= 2) score += 8;              // multi-token name agreement
  }
  return score;
}

/**
 * Rank the stocked catalog against a free-text query (+ optional code).
 * Returns [{ product, score }] best-first.
 */
export function rankCatalog(query, { code = '', limit = 5 } = {}) {
  const idx = buildIndex();
  const tokens = tokenize(query);
  const nCode = normCode(code);
  if (!tokens.length && !nCode) return [];
  return idx
    .map((e) => ({ product: e.product, score: scoreEntry(e, tokens, nCode) }))
    .filter((r) => r.score >= 12)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Stocked functional equivalents for a known catalog product:
 * same category first, ranked by shared name/body tokens.
 */
export function findSubstitutes(product, limit = 4) {
  if (!product) return [];
  const idx = buildIndex();
  const tokens = new Set(tokenize(`${product.name} ${product.product_type || ''}`));
  return idx
    .filter((e) => e.product.sku !== product.sku)
    .map((e) => {
      let shared = 0;
      for (const t of tokens) if (e.nameTokens.has(t) || e.bodyTokens.has(t)) shared += 1;
      let score = shared * 10;
      if (e.category === product.category) score += 25;
      if (e.product.product_type && e.product.product_type === product.product_type) score += 20;
      return { product: e.product, score };
    })
    .filter((r) => r.score >= 35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.product);
}

/* ------------------------------------------------------------------ */
/* Shortage-list parsing                                               */
/* ------------------------------------------------------------------ */

/**
 * Parse one pasted line into { raw, qty, code, desc }.
 * Handles common shapes:
 *   "12 x nitrile exam gloves large"
 *   "KGN-200, qty 6"
 *   "A4466  back brace  24"
 *   "Influenza A&B rapid test (25ct) — 4 boxes"
 */
function parseLine(raw) {
  let s = raw.trim().replace(/\s{2,}|\t+/g, '  ');
  let qty = null;

  // "qty 12" / "x12" / "12x" / trailing bare integer
  const qtyPatterns = [
    /\bqty[.:\s]*(\d{1,5})\b/i,
    /\bx\s?(\d{1,5})\b/i,
    /^(\d{1,5})\s?x\b/i,
    /^(\d{1,5})\b/,
    /[,\s](\d{1,5})\s*$/,
  ];
  for (const re of qtyPatterns) {
    const m = s.match(re);
    if (m) { qty = Number(m[1]); s = s.replace(m[0], ' '); break; }
  }

  // A part-number-looking token: letters+digits, length >= 4 (e.g. KGN-200, A4466)
  let code = '';
  const codeMatch = s.match(/\b([A-Za-z]*\d[A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)\b/);
  if (codeMatch && normCode(codeMatch[1]).length >= 4) {
    code = codeMatch[1];
  }

  const desc = s.replace(/[,;|]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return { raw: raw.trim(), qty: qty || 1, code, desc };
}

export function parseShortageList(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(item|description|sku|part|qty|quantity)[\s,;|]*$/i.test(l))
    .slice(0, 200)
    .map(parseLine);
}

/* ------------------------------------------------------------------ */
/* Full pipeline: parse → match → summarize                            */
/* ------------------------------------------------------------------ */

const MATCH_THRESHOLD = 38;

/**
 * Match a pasted shortage list against the stocked catalog.
 * Each output line: { ...parsed, status, match, score, alternates }.
 *   status: 'stocked' (confident match) | 'equivalent' (substitute only) | 'sourcing' (no match)
 */
export function matchShortageList(text) {
  const lines = parseShortageList(text).map((line) => {
    const ranked = rankCatalog(line.desc, { code: line.code, limit: 4 });
    const top = ranked[0];
    if (top && top.score >= MATCH_THRESHOLD) {
      return {
        ...line,
        status: 'stocked',
        match: top.product,
        score: Math.round(top.score),
        alternates: findSubstitutes(top.product, 2),
      };
    }
    if (top) {
      return {
        ...line,
        status: 'equivalent',
        match: null,
        score: Math.round(top.score),
        alternates: ranked.slice(0, 3).map((r) => r.product),
      };
    }
    return { ...line, status: 'sourcing', match: null, score: 0, alternates: [] };
  });

  const summary = {
    total: lines.length,
    stocked: lines.filter((l) => l.status === 'stocked').length,
    equivalent: lines.filter((l) => l.status === 'equivalent').length,
    sourcing: lines.filter((l) => l.status === 'sourcing').length,
  };
  return { lines, summary };
}
