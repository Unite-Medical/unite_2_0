/**
 * Scan-in / scan-out — PRD-27 §5 (zero manual entry).
 *
 * Barcode-driven receiving and picking. Parses GS1/UDI Application Identifiers
 * (01) GTIN, (10) lot, (17) expiration from the scanned payload; falls back to
 * photo+OCR or a Unite-generated encoded barcode, and only as a last resort to
 * flagged manual entry. Every receive + pick writes a `scan_events` row for
 * provenance.
 */

import { db } from './db.js';
import { uid } from './format.js';

const GS = String.fromCharCode(29); // FNC1 / group separator
const FIXED = { '01': 14, '17': 6, '11': 6, '15': 6, '7003': 10 };

/** Parse a GS1-128 / GS1 DataMatrix payload into { gtin, lot, expiration }. */
export function parseGs1(barcode) {
  if (!barcode) return null;
  let s = String(barcode).replace(/^\]C1/, '').replace(/^\]d2/, '').replace(/^\]Q3/, '');
  const out = {};
  let i = 0;
  while (i < s.length) {
    let ai = s.slice(i, i + 2);
    let consumed = 2;
    if (!(ai in FIXED) && ai !== '10' && ai !== '21') {
      // try 4-digit AI (e.g. 7003)
      const ai4 = s.slice(i, i + 4);
      if (ai4 in FIXED) { ai = ai4; consumed = 4; } else break;
    }
    i += consumed;
    if (ai in FIXED) {
      const val = s.slice(i, i + FIXED[ai]);
      i += FIXED[ai];
      if (ai === '01') out.gtin = val;
      else if (ai === '17') out.expiration = `20${val.slice(0, 2)}-${val.slice(2, 4)}-${val.slice(4, 6)}`;
      else if (ai === '11') out.production = `20${val.slice(0, 2)}-${val.slice(2, 4)}-${val.slice(4, 6)}`;
    } else if (ai === '10' || ai === '21') {
      let end = s.indexOf(GS, i);
      if (end === -1) end = s.length;
      const val = s.slice(i, end);
      i = end;
      if (s[i] === GS) i += 1;
      if (ai === '10') out.lot = val; else out.serial = val;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Encode a Unite lot barcode (GS1 AIs) for warehouse printing. */
export function generateLotBarcode({ gtin = '00000000000000', lot, expiration } = {}) {
  let s = `01${String(gtin).replace(/\D/g, '').padStart(14, '0').slice(0, 14)}`;
  if (expiration) s += `17${String(expiration).replace(/-/g, '').slice(2, 8)}`;
  if (lot) s += `10${lot}`; // variable-length AI placed last (no separator needed)
  return s;
}

/**
 * Receive (scan-in): create an owner-tagged inventory_lots row + a scan_events
 * row. Lot + expiration come from the barcode (no keyboard entry).
 */
export function receiveScan({
  owner_type = 'distributor', owner_org_id = null, barcode = null, photo_url = null,
  parsedOverride = null, station = 'RECV-1', by = null, sku = null, distributor_sku = null,
  warehouse_id = 'wh_atl', qty = 1, bin_location = null,
}) {
  let parsed = parsedOverride;
  let capture_method = 'manual';
  if (barcode) { parsed = parseGs1(barcode) || parsed; capture_method = parsed ? 'gs1_scan' : 'manual'; }
  else if (photo_url) { capture_method = 'photo_ocr'; }
  else if (parsedOverride) { capture_method = 'unite_barcode'; }

  const scanId = uid('scan');
  const lot = db.insert('inventory_lots', {
    id: uid('ilot'), owner_type, owner_org_id, product_sku: sku, distributor_sku,
    lot_number: parsed?.lot || null, expiration_date: parsed?.expiration || null,
    qty_on_hand: qty, qty_reserved: 0, warehouse_id, bin_location,
    attributes: parsed?.gtin ? { gtin: parsed.gtin } : null,
    received_via_scan_id: scanId, created_at: new Date().toISOString(),
  });
  db.insert('scan_events', {
    id: scanId, kind: 'receive', inventory_lot_id: lot.id, order_id: null,
    raw_barcode: barcode, parsed: parsed || null, capture_method, photo_url,
    scanned_by: by, station, scanned_at: new Date().toISOString(),
  });
  return { lot, scan_id: scanId, capture_method, parsed };
}

/**
 * Pick (scan-out): decrement the specific lot, write a scan_events + a
 * lot_tracking (recall trace) row, and advance the order. FEFO-suggested
 * picks (see suggestPick) send near-dated lots first.
 */
export function pickScan({ order_id, barcode = null, lot_id = null, qty = 1, station = 'PICK-1', by = null }) {
  let lot = lot_id ? db.get('inventory_lots', lot_id) : null;
  let parsed = null;
  if (!lot && barcode) {
    parsed = parseGs1(barcode);
    lot = db.list('inventory_lots')
      .filter((l) => (parsed?.lot ? l.lot_number === parsed.lot : true) && (Number(l.qty_on_hand) - Number(l.qty_reserved)) > 0)[0] || null;
  }
  if (!lot) throw new Error('No matching lot for scan');
  const take = Math.min(qty, Number(lot.qty_on_hand) || 0);
  db.update('inventory_lots', lot.id, {
    qty_on_hand: (Number(lot.qty_on_hand) || 0) - take,
    qty_reserved: Math.max(0, (Number(lot.qty_reserved) || 0) - take),
  });
  const scanId = uid('scan');
  db.insert('scan_events', {
    id: scanId, kind: 'pick', inventory_lot_id: lot.id, order_id,
    raw_barcode: barcode, parsed, capture_method: parsed ? 'gs1_scan' : 'manual',
    scanned_by: by, station, scanned_at: new Date().toISOString(),
  });
  db.insert('lot_tracking', {
    id: uid('lt'), lot_number: lot.lot_number, product_sku: lot.product_sku || lot.distributor_sku,
    expiration_date: lot.expiration_date, warehouse_id: lot.warehouse_id, order_id, qty: take,
    scanned_by: by, shipped_at: new Date().toISOString(),
  });
  return { lot_id: lot.id, picked: take, scan_id: scanId };
}

/** FEFO pick suggestion for an owner's stock of a SKU. */
export function suggestPick({ owner_type = 'distributor', owner_org_id = null, sku = null, distributor_sku = null }) {
  return db.list('inventory_lots')
    .filter((l) => (!owner_type || l.owner_type === owner_type)
      && (owner_org_id == null || l.owner_org_id === owner_org_id)
      && (sku == null || l.product_sku === sku)
      && (distributor_sku == null || l.distributor_sku === distributor_sku)
      && (Number(l.qty_on_hand) - Number(l.qty_reserved)) > 0)
    .sort((a, b) => ((a.expiration_date || '9999-12-31') < (b.expiration_date || '9999-12-31') ? -1 : 1));
}

export const scanning = { parseGs1, generateLotBarcode, receiveScan, pickScan, suggestPick };
