/**
 * Section 301 / Chapter 99 pre-filter — the free layer of the duty stack.
 *
 * There is NO clean free API that answers "does this HTS + China origin
 * trigger a 301 surcharge and at what rate" (briefing §3). This module is
 * the cheap, deterministic pre-filter that runs on EVERY SKU so the
 * quoting engine never silently ignores 301 exposure; the authoritative
 * confirmation (incl. exclusions + current Chapter 99 subheadings) comes
 * from Flexport's paid classification on the SKUs we actively quote.
 *
 * Table: HTS prefixes (4/6/8-digit) → { list, rate_pct, chapter99 }.
 * Rates per USTR action as of the 2026 schedule: Lists 1–3 at 25%,
 * List 4A at 7.5%. Medical-supply chapters relevant to Unite's catalog
 * are covered explicitly; anything unlisted returns applies:false but
 * still flags CN origin as "needs confirmation".
 *
 * Longest-prefix match wins, so a specific 8-digit carve-out can override
 * its 6-digit parent.
 */

// Keyed by digits-only HTS prefix. Sources: USTR Lists 1-4A (Ch. 99
// 9903.88.01–.04 + .15), trimmed to chapters Unite actually quotes.
const SECTION_301_PREFIXES = {
  // — List 1 (9903.88.01, 25%) — instruments/apparatus
  '9018': { list: '1', rate_pct: 25, chapter99: '9903.88.01' },
  '9022': { list: '1', rate_pct: 25, chapter99: '9903.88.01' },
  '9025': { list: '1', rate_pct: 25, chapter99: '9903.88.01' },
  '9027': { list: '1', rate_pct: 25, chapter99: '9903.88.01' },
  // — List 2 (9903.88.02, 25%) — plastics articles
  '3926': { list: '2', rate_pct: 25, chapter99: '9903.88.02' },
  // — List 3 (9903.88.03, 25%) — broad goods incl. textiles, rubber,
  //   furniture, containers
  '3005': { list: '3', rate_pct: 25, chapter99: '9903.88.03' },
  '3824': { list: '3', rate_pct: 25, chapter99: '9903.88.03' },
  '392330': { list: '3', rate_pct: 25, chapter99: '9903.88.03' },
  '4015': { list: '3', rate_pct: 25, chapter99: '9903.88.03' },
  '6307': { list: '3', rate_pct: 25, chapter99: '9903.88.03' },
  '9402': { list: '3', rate_pct: 25, chapter99: '9903.88.03' },
  // — List 4A (9903.88.15, 7.5%) — apparel/hosiery + misc consumer
  '6115': { list: '4A', rate_pct: 7.5, chapter99: '9903.88.15' },
  '9021': { list: '4A', rate_pct: 7.5, chapter99: '9903.88.15' },
};

// Origins the 301 action applies to (China incl. Hong Kong for goods of
// Chinese origin under the customs rules we quote against).
const COVERED_ORIGINS = new Set(['CN', 'CHINA', "PEOPLE'S REPUBLIC OF CHINA", 'PRC']);

function normOrigin(coo) {
  return String(coo || '').trim().toUpperCase();
}

function digitsOnly(hts) {
  return String(hts || '').replace(/\D/g, '');
}

/**
 * Pre-filter lookup: does this HTS + country-of-origin look like it
 * triggers a Section 301 surcharge?
 *
 * @param {string} hts  HTS code, dotted or bare digits (min 4 digits)
 * @param {string} coo  Country of origin (ISO-2 or name)
 * @returns {{
 *   applies: boolean, rate_pct: number, list: string|null,
 *   chapter99: string|null, matched_prefix: string|null,
 *   needs_confirmation: boolean, source: 'prefilter'
 * }}
 */
export function section301Lookup(hts, coo) {
  const origin = normOrigin(coo);
  const covered = COVERED_ORIGINS.has(origin);
  const base = {
    applies: false, rate_pct: 0, list: null, chapter99: null,
    matched_prefix: null, needs_confirmation: false, source: 'prefilter',
  };
  if (!covered) return base;

  const digits = digitsOnly(hts);
  // Longest prefix wins (8 → 6 → 4).
  for (const len of [8, 6, 4]) {
    if (digits.length < len) continue;
    const hit = SECTION_301_PREFIXES[digits.slice(0, len)];
    if (hit) {
      return {
        applies: true,
        rate_pct: hit.rate_pct,
        list: hit.list,
        chapter99: hit.chapter99,
        matched_prefix: digits.slice(0, len),
        // Exclusions + list revisions exist — Flexport confirms before
        // the quote is committed.
        needs_confirmation: true,
        source: 'prefilter',
      };
    }
  }
  // CN origin but no table hit: not asserted, but still confirm — the
  // table is a curated subset, not the full USTR annex.
  return { ...base, needs_confirmation: true };
}

/** Batch helper mirroring hts.lookupBatch. */
export function section301LookupBatch(pairs) {
  return (pairs || []).map(({ hts, coo }) => section301Lookup(hts, coo));
}

export const __SECTION_301_PREFIXES = SECTION_301_PREFIXES;
