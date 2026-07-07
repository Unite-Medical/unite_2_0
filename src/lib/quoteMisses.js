/**
 * "No quote returned" feedback loop — briefing §6.
 *
 * Customers must be able to flag (and we must auto-capture) any requested
 * item that didn't come back with a quote. Every miss routes to Unite to
 * (a) source it, (b) add a cross-reference from our database, or (c) find
 * a supplier. Never silently drop a requested item — every miss is a
 * demand signal that feeds the stocking flywheel (what to bring in-house).
 *
 * Table: quote_misses
 *   { id, customer_name, email, source, raw_text, code, description, qty,
 *     candidates: [{sku,name,score}], reason, status: open|resolved,
 *     resolution, resolved_sku, resolved_by, resolved_at }
 */

import { db } from './db.js';
import { uid } from './format.js';

export const MISS_REASONS = {
  no_match: 'No catalog/vendor match found',
  low_confidence: 'Only low-confidence matches found',
  parse_skipped: 'Line could not be parsed from the uploaded sheet',
  customer_flagged: 'Customer reported a missing quote line',
};

/**
 * Record one missed line. `candidates` keeps whatever near-misses we had
 * so the desk can start from something instead of a cold search.
 */
export function recordQuoteMiss({
  customer_name = '',
  email = '',
  source = 'quote-request',   // 'quote-request' | 'shortage-list' | 'vendor-sheet' | 'customer-flag'
  request_id = null,
  raw_text = '',
  code = '',
  description = '',
  qty = null,
  candidates = [],
  reason = 'no_match',
} = {}) {
  return db.insert('quote_misses', {
    id: uid('miss'),
    customer_name,
    email,
    source,
    request_id,
    raw_text,
    code: code || null,
    description: description || null,
    qty,
    candidates: (candidates || []).slice(0, 3).map((c) => ({
      sku: c.sku ?? c.product?.sku ?? null,
      name: c.name ?? c.product?.name ?? null,
      score: c.score != null ? Math.round(c.score) : null,
    })),
    reason,
    status: 'open',
    resolution: null,
    resolved_sku: null,
    resolved_by: null,
    resolved_at: null,
  });
}

/**
 * Capture misses from a matched shortage list (matching.matchShortageList
 * output): lines that ended in 'sourcing' (no match) or 'equivalent'
 * (low-confidence only) are demand signals we must not drop.
 */
export function captureShortageListMisses({ lines = [], customer_name = '', email = '', request_id = null } = {}) {
  const missed = lines.filter((l) => l.status === 'sourcing' || l.status === 'equivalent');
  return missed.map((l) => recordQuoteMiss({
    customer_name,
    email,
    source: 'shortage-list',
    request_id,
    raw_text: l.raw,
    code: l.code,
    description: l.desc,
    qty: l.qty,
    candidates: (l.alternates || []).map((p) => ({ sku: p.sku, name: p.name })),
    reason: l.status === 'sourcing' ? 'no_match' : 'low_confidence',
  }));
}

/**
 * Capture rows the vendor-sheet parser skipped (parse warnings mean a
 * product the vendor listed never made it into the quote).
 */
export function captureParserSkips({ parseResult, vendor = '', request_id = null } = {}) {
  if (!parseResult || !parseResult.totals || parseResult.totals.skipped === 0) return [];
  const skipWarnings = (parseResult.warnings || []).filter((w) => /skipped\.$/.test(w));
  return skipWarnings.map((w) => recordQuoteMiss({
    customer_name: vendor,
    source: 'vendor-sheet',
    request_id,
    raw_text: w,
    reason: 'parse_skipped',
  }));
}

/** Customer-facing "I didn't get a quote for X" report. */
export function flagMissingQuoteLine({ customer_name, email, quote_id, description, code = '', qty = null }) {
  return recordQuoteMiss({
    customer_name,
    email,
    source: 'customer-flag',
    request_id: quote_id,
    raw_text: description,
    code,
    description,
    qty,
    reason: 'customer_flagged',
  });
}

/** Open misses, newest first — the desk work queue. */
export function listOpenMisses({ limit = 100 } = {}) {
  return db.list('quote_misses', { where: { status: 'open' }, orderBy: 'created_at', dir: 'desc', limit });
}

/**
 * Close a miss with an outcome. `resolution`:
 *   'sourced' (found a supplier) · 'cross_referenced' (mapped to a Unite
 *   SKU) · 'declined' (won't pursue).
 */
export function resolveMiss(id, { resolution, resolved_sku = null, resolved_by = 'desk', note = '' } = {}) {
  const miss = db.get('quote_misses', id);
  if (!miss) return { ok: false, reason: 'not_found' };
  if (!['sourced', 'cross_referenced', 'declined'].includes(resolution)) {
    return { ok: false, reason: 'bad_resolution' };
  }
  const updated = db.update('quote_misses', id, {
    status: 'resolved',
    resolution,
    resolved_sku,
    resolved_by,
    note: note || null,
    resolved_at: new Date().toISOString(),
  });
  // A cross-referenced miss feeds the PRD-29 data moat directly.
  if (resolution === 'cross_referenced' && resolved_sku && (miss.code || miss.description)) {
    db.insert('cross_references', {
      id: uid('xref'),
      customer_code: miss.code,
      customer_desc: miss.description,
      unite_sku: resolved_sku,
      validated: false,
      source: 'quote-miss',
      request_id: miss.request_id,
      submitted_by: resolved_by,
      created_at: new Date().toISOString(),
    });
  }
  db.insert('audit_log', { id: uid('aud'), kind: 'quote_miss.resolved', ref_id: id, payload: { resolution, resolved_sku, resolved_by } });
  return { ok: true, miss: updated };
}

/** Demand-signal rollup: what are customers asking for that we miss most? */
export function missDemandSignals({ limit = 20 } = {}) {
  const all = db.list('quote_misses');
  const byKey = new Map();
  for (const m of all) {
    const key = (m.code || m.description || m.raw_text || '').toString().trim().toLowerCase();
    if (!key) continue;
    const entry = byKey.get(key) || { key, description: m.description || m.raw_text, code: m.code, requests: 0, total_qty: 0, open: 0 };
    entry.requests += 1;
    entry.total_qty += Number(m.qty) || 0;
    if (m.status === 'open') entry.open += 1;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.requests - a.requests || b.total_qty - a.total_qty).slice(0, limit);
}
