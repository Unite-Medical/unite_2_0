/**
 * Customer-PO ingestion — PRD-27 §7.
 *
 * A distributor uploads their customer's PO (PDF/xlsx/image); the system
 * parses items, quantities, ship-to, and PO number, matches each line to a
 * SKU (distributor's own → consignment; Unite catalog → Unite stock;
 * unmatched → flagged for mapping), and produces a draft order for one-click
 * confirm. Learned mappings persist so repeat POs auto-match.
 *
 * File parsing (PDF/xlsx/OCR) is delegated to PRD-18 / PRD-11 in production;
 * this module accepts already-parsed input or a simple pasted text table and
 * owns the match → learn → draft pipeline.
 */

import { db } from './db.js';
import { uid } from './format.js';

/** Resolve an external part # to a Unite/distributor SKU, using learned maps. */
export function resolveSku(owner_org_id, external_sku) {
  const ext = String(external_sku || '').toUpperCase().trim();
  if (!ext) return { sku: null, kind: null, confidence: 0, source: 'empty' };
  const learned = db.list('distributor_sku_map', { where: { owner_org_id, external_sku: ext } })[0];
  if (learned?.resolved_sku) return { sku: learned.resolved_sku, kind: learned.resolved_kind, confidence: 1, source: 'learned' };
  if (db.get('products', ext)) return { sku: ext, kind: 'unite', confidence: 0.95, source: 'unite_catalog' };
  const dp = db.list('distributor_products', { where: { owner_org_id, distributor_sku: ext } })[0];
  if (dp) return { sku: dp.distributor_sku, kind: 'distributor', confidence: 0.95, source: 'distributor_catalog' };
  return { sku: null, kind: null, confidence: 0, source: 'unmatched' };
}

/** Persist a learned mapping (their part # → our SKU). */
export function learnMapping(owner_org_id, external_sku, resolved_sku, resolved_kind) {
  const ext = String(external_sku).toUpperCase().trim();
  const existing = db.list('distributor_sku_map', { where: { owner_org_id, external_sku: ext } })[0];
  const patch = { owner_org_id, external_sku: ext, resolved_sku, resolved_kind };
  return existing ? db.update('distributor_sku_map', existing.id, patch)
    : db.insert('distributor_sku_map', { id: uid('dsm'), ...patch });
}

function nameFor(owner_org_id, r) {
  if (!r.sku) return null;
  if (r.kind === 'unite') return db.get('products', r.sku)?.name || r.sku;
  return db.list('distributor_products', { where: { owner_org_id, distributor_sku: r.sku } })[0]?.name || r.sku;
}

/** Parse a pasted PO text table: optional "PO: x" / "Ship to: ..." + "SKU qty". */
export function parsePoText(text) {
  const out = { po_number: null, ship_to: null, lines: [] };
  for (const row of String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    const pm = row.match(/^PO\s*[:#]?\s*(\S+)/i);
    if (pm) { out.po_number = pm[1]; continue; }
    const sm = row.match(/^ship\s*to\s*[:]?\s*(.+)$/i);
    if (sm) { out.ship_to = sm[1]; continue; }
    const m = row.match(/^([A-Za-z0-9._/-]+)\s*(?:[,\t]|\s+x?|x)\s*(\d+)\s*$/i);
    if (m) out.lines.push({ external_sku: m[1], qty: parseInt(m[2], 10) });
  }
  return out;
}

function normalizeParsed(input, owner_org_id) {
  const raw = typeof input === 'string' ? parsePoText(input) : (input || {});
  const lines = (raw.lines || []).map((l) => {
    const r = resolveSku(owner_org_id, l.external_sku);
    return {
      external_sku: l.external_sku, qty: l.qty,
      resolved_sku: r.sku, resolved_kind: r.kind, confidence: r.confidence, source: r.source,
      name: nameFor(owner_org_id, r),
    };
  });
  return { po_number: raw.po_number || null, ship_to: raw.ship_to || null, lines };
}

/** Ingest a PO into a `distributor_po_uploads` row (status parsing→ready/needs_mapping). */
export function ingestPo({ owner_org_id, file_url = null, parsedInput }) {
  const upload = db.insert('distributor_po_uploads', {
    id: uid('po'), owner_org_id, file_url: file_url || '(pasted)', status: 'parsing', parsed: null, created_at: new Date().toISOString(),
  });
  const parsed = normalizeParsed(parsedInput, owner_org_id);
  const status = parsed.lines.length === 0 ? 'failed'
    : parsed.lines.some((l) => !l.resolved_sku) ? 'needs_mapping' : 'ready';
  db.update('distributor_po_uploads', upload.id, { parsed, status });
  return db.get('distributor_po_uploads', upload.id);
}

/** Map a previously-unmatched line, learn it, and re-evaluate the upload. */
export function mapAndRecheck(uploadId, external_sku, resolved_sku, resolved_kind) {
  const upload = db.get('distributor_po_uploads', uploadId);
  if (!upload) throw new Error('upload not found');
  learnMapping(upload.owner_org_id, external_sku, resolved_sku, resolved_kind);
  const parsed = normalizeParsed(upload.parsed, upload.owner_org_id);
  const status = parsed.lines.some((l) => !l.resolved_sku) ? 'needs_mapping' : 'ready';
  return db.update('distributor_po_uploads', uploadId, { parsed, status });
}

/** Produce placeOrder-ready lines from a ready upload (priced by caller). */
export function draftLinesFromUpload(uploadId) {
  const upload = db.get('distributor_po_uploads', uploadId);
  if (!upload || upload.status !== 'ready') return { ok: false, reason: 'not_ready' };
  const lines = (upload.parsed?.lines || []).filter((l) => l.resolved_sku).map((l) => ({
    sku: l.resolved_sku, kind: l.resolved_kind, qty: l.qty, name: l.name,
  }));
  return { ok: true, po_number: upload.parsed?.po_number, ship_to: upload.parsed?.ship_to, lines };
}

export const poIngestion = {
  resolveSku, learnMapping, parsePoText, ingestPo, mapAndRecheck, draftLinesFromUpload,
  forOrg(owner_org_id) { return db.list('distributor_po_uploads', { where: { owner_org_id } }); },
};
