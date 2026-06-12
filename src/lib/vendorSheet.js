/**
 * Vendor sheet parser — PRD-08 Phase 1.
 *
 * Accepts CSV or XLSX uploaded from the quoting wizard. CSV is parsed
 * inline (RFC-4180-ish handling for quoted fields with commas/newlines);
 * XLSX is read natively via src/lib/xlsx.js (ZIP + DOMParser, no deps)
 * so foreign vendors can upload their Excel templates as-is.
 *
 * Expected columns (order doesn't matter, headers are case-insensitive):
 *   product_name      (required)
 *   fda_product_code  (3-letter, optional but recommended)
 *   hts_code          (6 or 10 digit, optional)
 *   fob_price_usd     (required, number)
 *   moq               (optional, integer; default 1)
 *   lead_time_days    (optional)
 *   country_of_origin (optional, ISO-2 or full country)
 *   description       (optional)
 *   gtin              (optional)
 *   packaging         (optional)
 *   target_quantity   (optional, integer)
 *   notes             (optional)
 */

import { isValidGtin } from './external/gs1.js';
import { readXlsxRows } from './xlsx.js';

export const REQUIRED_COLUMNS = ['product_name', 'fob_price_usd'];

export const COLUMN_ALIASES = {
  product_name:      ['product_name', 'product', 'name', 'item', 'sku description'],
  fda_product_code:  ['fda_product_code', 'fda product code', 'fda code', 'product code'],
  hts_code:          ['hts_code', 'hts', 'htsus', 'tariff code'],
  fob_price_usd:     ['fob_price_usd', 'fob price', 'fob', 'unit cost', 'cost', 'price'],
  moq:               ['moq', 'min order qty', 'minimum order quantity'],
  lead_time_days:    ['lead_time_days', 'lead time', 'lead time (days)', 'lead'],
  country_of_origin: ['country_of_origin', 'country of origin', 'origin', 'coo'],
  description:       ['description', 'desc'],
  gtin:              ['gtin', 'upc', 'ean', 'barcode'],
  packaging:         ['packaging', 'pack size', 'pack'],
  target_quantity:   ['target_quantity', 'target qty', 'quantity', 'qty'],
  notes:             ['notes', 'comments'],
};

/** Build a header→canonical-field lookup. */
function resolveColumns(headers) {
  const lower = headers.map((h) => String(h || '').trim().toLowerCase());
  const map = {};
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = lower.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[canonical] = idx;
  }
  return map;
}

/**
 * Minimal RFC-4180 CSV parser. Handles:
 *   - quoted fields
 *   - embedded commas inside quotes
 *   - embedded newlines inside quotes
 *   - escaped double-quotes ("")
 *   - CRLF or LF line endings
 */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  let i = 0;
  const src = String(text || '');
  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { inQuotes = true; i += 1; continue; }
    if (c === ',') { row.push(field); field = ''; i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += c; i += 1;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function int(v) {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

function str(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * Parse pre-split rows (from CSV or XLSX) into the canonical line
 * shape consumed by `src/lib/quoting.js`.
 *
 * Returns: { ok, vendor, lines, errors, warnings, totals }
 */
export function parseVendorSheetRows({ rows, filename = 'sheet.csv', vendorHint = '' }) {
  const result = { ok: false, vendor: vendorHint || filename.replace(/\.[^.]+$/, ''), lines: [], errors: [], warnings: [], totals: { rows: 0, accepted: 0 } };

  if (rows.length < 2) {
    result.errors.push('Sheet must have a header row and at least one data row.');
    return result;
  }

  const headers = rows[0];
  const cols = resolveColumns(headers);

  for (const req of REQUIRED_COLUMNS) {
    if (!(req in cols)) {
      result.errors.push(`Missing required column: ${req} (accepted aliases: ${COLUMN_ALIASES[req].join(', ')})`);
    }
  }
  if (result.errors.length > 0) return result;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const cell = (key) => (key in cols ? row[cols[key]] : undefined);
    result.totals.rows += 1;

    const name = str(cell('product_name'));
    const fob = num(cell('fob_price_usd'));
    if (!name) { result.warnings.push(`Row ${r + 1}: missing product_name, skipped.`); continue; }
    if (fob === null) { result.warnings.push(`Row ${r + 1} (${name}): invalid fob_price_usd, skipped.`); continue; }

    const fda = str(cell('fda_product_code')).toUpperCase() || 'KGN';
    const hts = str(cell('hts_code'));
    const moq = int(cell('moq')) ?? 1;
    const target_qty = int(cell('target_quantity')) ?? moq;
    const gtin = str(cell('gtin'));
    const country = str(cell('country_of_origin'));

    // Light validation that doesn't kill the row, just warns.
    if (gtin && !isValidGtin(gtin)) {
      result.warnings.push(`Row ${r + 1} (${name}): GTIN check-digit invalid; pricing will proceed without GS1 validation.`);
    }
    if (hts && !/^\d{4}\.\d{2}(?:\.\d{2}(?:\d{2})?)?$/.test(hts)) {
      result.warnings.push(`Row ${r + 1} (${name}): HTS code "${hts}" doesn't match XXXX.XX or XXXX.XX.XX(XX); USITC lookup may fall through to default rate.`);
    }

    result.lines.push({
      name,
      fob,
      moq,
      target_qty,
      hts: hts || '6307.90',
      fda_product_code: fda,
      gtin: gtin || null,
      country_of_origin: country || null,
      description: str(cell('description')) || null,
      packaging: str(cell('packaging')) || null,
      lead_time_days: int(cell('lead_time_days')) ?? null,
      notes: str(cell('notes')) || null,
    });
    result.totals.accepted += 1;
  }

  result.ok = result.lines.length > 0;
  return result;
}

/** CSV text entrypoint (kept for paste-in flows + tests). */
export function parseVendorSheetText({ text, filename = 'sheet.csv', vendorHint = '' }) {
  return parseVendorSheetRows({ rows: parseCsv(text), filename, vendorHint });
}

/** Convenience: parse a File or Blob from an <input type="file">. */
export async function parseVendorSheetFile(file, { vendorHint = '' } = {}) {
  const filename = file?.name || 'sheet.csv';
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx') {
    try {
      const rows = await readXlsxRows(await file.arrayBuffer());
      return parseVendorSheetRows({ rows, filename, vendorHint });
    } catch (err) {
      return {
        ok: false,
        vendor: vendorHint || filename.replace(/\.[^.]+$/, ''),
        lines: [],
        errors: [`Couldn't read the workbook (${err.message}). Export as CSV and re-upload if it persists.`],
        warnings: [],
        totals: { rows: 0, accepted: 0 },
      };
    }
  }
  if (ext === 'xls') {
    return {
      ok: false,
      vendor: vendorHint || filename.replace(/\.[^.]+$/, ''),
      lines: [],
      errors: ['Legacy .xls (BIFF) isn\'t supported — save as .xlsx or CSV and re-upload.'],
      warnings: [],
      totals: { rows: 0, accepted: 0 },
    };
  }
  const text = await file.text();
  return parseVendorSheetText({ text, filename, vendorHint });
}
