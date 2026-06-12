/**
 * USITC Harmonized Tariff Schedule lookup — PRD-08 Phase 2.
 *
 *   GET /api/proxy/hts?code=9021.10
 *
 * The USITC REST API (hts.usitc.gov) is free but does not send CORS
 * headers, so the browser can't call it directly — this endpoint is
 * the permitted server-side hop. Response is normalized to the shape
 * `src/lib/external/hts.js` expects:
 *
 *   { hts_code, description, mfn, special, source: 'usitc' }
 *
 * `mfn` is the general-column ad-valorem rate as a number (percent).
 * Compound/specific rates are returned verbatim in `general_raw` with
 * mfn set to the ad-valorem component when one can be extracted.
 */

import { sendJson, logEvent } from '../_lib/http.js';

const USITC_SEARCH = 'https://hts.usitc.gov/reststop/search';

// Tiny warm-instance cache; the schedule changes a few times a year.
const cache = new Map();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function parseAdValorem(rate) {
  if (!rate) return 0;
  const s = String(rate).trim().toLowerCase();
  if (s === 'free' || s === '') return 0;
  const m = s.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : 0;
}

export default async function handler(req, res) {
  const code = String(req.query.code || '').trim();
  if (!code) return sendJson(res, 400, { error: 'missing_code', hint: '?code=9021.10' });

  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return sendJson(res, 200, hit.data);

  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const upstream = await fetch(`${USITC_SEARCH}?keyword=${encodeURIComponent(code)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Unite-Medical/2.0 (+https://unitemedical.net)' },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!upstream.ok) throw new Error(`USITC ${upstream.status}`);
    const json = await upstream.json();
    const rows = Array.isArray(json) ? json : json?.results || [];

    // Pick the row for the queried code. USITC returns the heading plus
    // statistical children (e.g. query 9021.10 → 9021.10.00,
    // 9021.10.00.50, ...). The duty rate lives on the shallowest
    // matching row with a non-empty `general` column.
    const clean = (s) => String(s || '').replace(/\./g, '');
    const target = clean(code);
    const matches = rows.filter((r) => {
      if (!r.htsno) return false;
      const h = clean(r.htsno);
      return h.startsWith(target) || target.startsWith(h);
    });
    const best = matches.sort((a, b) => {
      const aHasRate = String(a.general || '').trim() ? 0 : 1;
      const bHasRate = String(b.general || '').trim() ? 0 : 1;
      return aHasRate - bHasRate || clean(a.htsno).length - clean(b.htsno).length;
    })[0];

    if (!best) return sendJson(res, 404, { error: 'no_match', hts_code: code });

    const data = {
      hts_code: code,
      matched_htsno: best.htsno,
      description: best.description || '',
      mfn: parseAdValorem(best.general),
      special: parseAdValorem(best.special),
      general_raw: best.general ?? null,
      special_raw: best.special ?? null,
      units: best.units || null,
      source: 'usitc',
    };
    cache.set(code, { at: Date.now(), data });
    logEvent('hts', 'lookup', { code, matched: best.htsno, mfn: data.mfn });
    sendJson(res, 200, data);
  } catch (err) {
    logEvent('hts', 'lookup_failed', { code, error: err.message });
    sendJson(res, 502, { error: 'usitc_unreachable', detail: err.message });
  }
}
