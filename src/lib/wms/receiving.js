/**
 * UniteWMS — scan-to-receive + goods-receipt reconciliation (PRD-33).
 *
 * The receiving workstation scans a carton's barcode; this module turns that
 * scan into "a product has been received" in ONE step:
 *
 *   scan → resolveScan() → product SKU (+ lot/expiry from a GS1/UDI code)
 *        → purchaseOrders.receive() / lots.receiveLot()  (the ONLY writers)
 *        → scan_events provenance row
 *
 * Nothing here writes stock directly — receiving delegates to wms/lots +
 * wms/purchaseOrders, which post `receipt` movements through the append-only
 * ledger (wms/ledger). This module is a resolver + a reconciler, never a
 * second source of truth for on_hand.
 *
 * resolveScan() accepts, in priority order:
 *   1. a GS1-128 / GS1 DataMatrix / UDI payload  → parseGs1() → GTIN + lot + exp
 *   2. a bare UPC-A (12) / EAN-13 (13) / GTIN-14  → product by upc/gtin
 *   3. anything else                              → treated as a raw SKU
 *
 * reconcilePO() answers Damon's "does it reconcile?" — it compares what was
 * ORDERED on a PO against what the ledger actually RECEIVED (SUM of receipt
 * movements, not a trusted counter) and classifies every line as
 * exact / short / over, plus flags any off-PO ("unexpected") receipts.
 */

import { db } from '../db.js';
import { uid } from '../format.js';
import { parseGs1 } from '../scanning.js';
import { isValidGtin } from '../external/gs1.js';
import { purchaseOrders } from './purchaseOrders.js';
import { lots as lotsApi } from './lots.js';
import { ledger } from './ledger.js';

function num(v) { return Number(v) || 0; }

/** Strip a GTIN/UPC to digits and normalize to a 14-char GTIN for comparison. */
function toGtin14(code) {
  const digits = String(code || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(14, '0');
}

/** Find a product whose upc/gtin matches the scanned code (GTIN-14 normalized). */
function productByCode(code) {
  const want = toGtin14(code);
  if (!want) return null;
  return db.list('products').find((p) => {
    if (p.upc && toGtin14(p.upc) === want) return true;
    if (p.gtin && toGtin14(p.gtin) === want) return true;
    return false;
  }) || null;
}

/** Find a product by exact SKU (case-insensitive fallback). */
function productBySku(sku) {
  if (!sku) return null;
  const exact = db.get('products', sku) || db.list('products', { where: { sku } })[0];
  if (exact) return exact;
  const up = String(sku).trim().toUpperCase();
  return db.list('products').find((p) => String(p.sku).toUpperCase() === up) || null;
}

/**
 * Resolve a raw scanned string into a receivable line.
 *
 * @param {string} raw  whatever the scanner emitted (barcode wedge or camera)
 * @returns {{
 *   ok: boolean, matched: boolean, sku: (string|null),
 *   product: (object|null), gtin: (string|null),
 *   lot_number: (string|null), expiration_date: (string|null),
 *   capture_method: 'gs1_scan'|'upc'|'sku'|'unknown', raw: string, reason?: string
 * }}
 */
export function resolveScan(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, matched: false, sku: null, product: null, gtin: null, lot_number: null, expiration_date: null, capture_method: 'unknown', raw: s, reason: 'empty_scan' };

  // 1) Unambiguous BARE barcode — the whole scan is digits of a standard GTIN
  // length (UPC-A 12 / EAN-13 13 / GTIN-14 14 / GTIN-8 8) with a valid mod-10
  // check digit. Checked BEFORE GS1 parsing so a plain UPC that happens to
  // start with "01" is not misread as GS1 Application Identifier (01).
  const isBareBarcode = /^\d+$/.test(s) && [8, 12, 13, 14].includes(s.length) && isValidGtin(s);
  if (isBareBarcode) {
    const product = productByCode(s);
    return {
      ok: true,
      matched: Boolean(product),
      sku: product ? product.sku : null,
      product,
      gtin: toGtin14(s),
      lot_number: null,
      expiration_date: null,
      capture_method: 'upc',
      raw: s,
      reason: product ? undefined : 'upc_not_in_catalog',
    };
  }

  // 2) GS1 / UDI element string — has AIs, a symbology prefix (]C1/]d2/]Q3), or
  // a non-GTIN length. Carries GTIN (01) + lot (10) + expiry (17) in one scan.
  const parsed = parseGs1(s);
  if (parsed && parsed.gtin) {
    const product = productByCode(parsed.gtin);
    return {
      ok: true,
      matched: Boolean(product),
      sku: product ? product.sku : null,
      product,
      gtin: parsed.gtin,
      lot_number: parsed.lot || null,
      expiration_date: parsed.expiration || null,
      capture_method: 'gs1_scan',
      raw: s,
      reason: product ? undefined : 'gtin_not_in_catalog',
    };
  }

  // 3) Fallback: treat the scan as a raw SKU (a label we printed, or manual).
  const product = productBySku(s);
  return {
    ok: true,
    matched: Boolean(product),
    sku: product ? product.sku : s, // keep the raw value so blind receipts still work
    product,
    gtin: product?.gtin || null,
    lot_number: null,
    expiration_date: null,
    capture_method: 'sku',
    raw: s,
    reason: product ? undefined : 'sku_not_in_catalog',
  };
}

/**
 * Write a scan_events provenance row (PRD-27 §5 shape). Every physical scan at
 * the workstation is recorded whether or not it posted stock, so the receipt
 * ledger is auditable back to the exact barcode a worker scanned.
 */
function recordScanEvent({ kind = 'receive', resolution, qty, lot_id = null, ref_type = null, ref_id = null, station = 'RECV-1', by = null }) {
  return db.insert('scan_events', {
    id: uid('scan'),
    kind,
    inventory_lot_id: lot_id,
    order_id: null,
    ref_type,
    ref_id,
    raw_barcode: resolution?.raw || null,
    parsed: resolution ? { gtin: resolution.gtin, lot: resolution.lot_number, expiration: resolution.expiration_date, sku: resolution.sku } : null,
    capture_method: resolution?.capture_method || 'manual',
    matched: resolution?.matched ?? null,
    qty: num(qty),
    scanned_by: by,
    station,
    scanned_at: new Date().toISOString(),
  });
}

/**
 * Receive a batch of already-resolved scan lines. Each line is
 * { sku, qty, lot_number, expiration_date, unit_cost?, resolution? }.
 *
 * With a PO: delegates to purchaseOrders.receive (advances line received_qty,
 * flips partial/received, posts the QBO bill on full receipt). Without a PO:
 * a blind receipt via lots.receiveLot. Either way, every line also drops a
 * scan_events row. Idempotent through the underlying ledger idempotency keys.
 *
 * @returns {Promise<{ok:boolean, mode:'po'|'blind', received:number, po_status?:string, events:number, reason?:string}>}
 */
export async function receiveScans(lines, { po_id = null, warehouse_id = 'wh_atl', received_by = 'workstation', station = 'RECV-1' } = {}) {
  const clean = (lines || []).filter((l) => l && l.sku && num(l.qty) > 0);
  if (clean.length === 0) return { ok: false, mode: po_id ? 'po' : 'blind', received: 0, events: 0, reason: 'no_lines' };

  let received = 0;
  let events = 0;
  let poStatus;

  if (po_id) {
    const res = await purchaseOrders.receive(
      po_id,
      clean.map((l) => ({ sku: l.sku, qty: num(l.qty), lot_number: l.lot_number || null, expiration_date: l.expiration_date || null, unit_cost: l.unit_cost ?? null })),
      { warehouse_id, received_by },
    );
    if (!res.ok) return { ok: false, mode: 'po', received: 0, events: 0, reason: res.reason };
    received = res.received;
    poStatus = res.status;
    // Provenance: one scan_events row per scanned line, linked to the PO.
    for (const l of clean) {
      recordScanEvent({ resolution: l.resolution, qty: l.qty, ref_type: 'purchase_order', ref_id: po_id, station, by: received_by });
      events += 1;
    }
    return { ok: true, mode: 'po', received, po_status: poStatus, events };
  }

  // Blind receipt (no PO on file).
  for (const l of clean) {
    const r = lotsApi.receiveLot({
      sku: l.sku, lot_number: l.lot_number || null, expiration_date: l.expiration_date || null,
      warehouse_id, qty: num(l.qty), unit_cost: l.unit_cost ?? null,
      received_by, ref_type: 'manual', ref_id: 'blind_receipt',
    });
    if (r.ok && !r.duplicate) received += num(l.qty);
    recordScanEvent({ resolution: l.resolution, qty: l.qty, lot_id: r.lot?.id || null, ref_type: 'manual', ref_id: 'blind_receipt', station, by: received_by });
    events += 1;
  }
  return { ok: true, mode: 'blind', received, events };
}

/**
 * Reconcile a PO: ORDERED (line qty) vs RECEIVED (SUM of receipt movements in
 * the ledger, not the trusted counter) per SKU. Classifies each line and
 * surfaces off-PO ("unexpected") receipts. This is the goods-receipt
 * reconciliation Damon asked for — the answer to "did what we ordered match
 * what showed up?".
 *
 * @returns {{
 *   ok:boolean, po_id:string, status:string,
 *   lines: Array<{ sku, name, ordered, received, variance, state:'exact'|'short'|'over'|'unexpected' }>,
 *   totals: { ordered, received, variance },
 *   unexpected: Array<{ sku, received }>,
 *   balanced: boolean, reason?: string
 * }}
 */
export function reconcilePO(po_id) {
  const po = db.get('purchase_orders', po_id);
  if (!po) return { ok: false, po_id, reason: 'po_not_found', lines: [], totals: { ordered: 0, received: 0, variance: 0 }, unexpected: [], balanced: false };

  const wh = po.warehouse_id || 'wh_atl';

  // Ledger-truth received-per-sku for THIS PO (ref_type=purchase_order, ref_id=po_id).
  const receivedBySku = new Map();
  for (const mv of db.list('stock_movements')) {
    if (mv.reason !== ledger.REASONS.RECEIPT) continue;
    if (mv.ref_type !== 'purchase_order' || mv.ref_id !== po_id) continue;
    const sku = mv.sku || mv.product_sku;
    receivedBySku.set(sku, (receivedBySku.get(sku) || 0) + num(mv.qty_delta));
  }

  const orderedSkus = new Set();
  const lines = (po.line_items || []).map((l) => {
    orderedSkus.add(l.sku);
    const ordered = num(l.qty);
    const received = receivedBySku.get(l.sku) || 0;
    const variance = received - ordered;
    const state = variance === 0 ? 'exact' : variance < 0 ? 'short' : 'over';
    return { sku: l.sku, name: l.name || l.sku, ordered, received, variance, state };
  });

  // Off-PO receipts: SKUs that got a receipt movement against this PO but were
  // never on the PO. (Belt + braces — purchaseOrders.receive rejects these at
  // the workstation, but a manual/legacy movement could still exist.)
  const unexpected = [];
  for (const [sku, received] of receivedBySku) {
    if (!orderedSkus.has(sku)) {
      unexpected.push({ sku, received });
      lines.push({ sku, name: sku, ordered: 0, received, variance: received, state: 'unexpected' });
    }
  }

  const totals = lines.reduce(
    (a, l) => ({ ordered: a.ordered + l.ordered, received: a.received + l.received, variance: a.variance + l.variance }),
    { ordered: 0, received: 0, variance: 0 },
  );
  const balanced = lines.every((l) => l.state === 'exact');

  return { ok: true, po_id, status: po.status, lines, totals, unexpected, balanced, warehouse_id: wh };
}

export const receiving = { resolveScan, receiveScans, reconcilePO };
