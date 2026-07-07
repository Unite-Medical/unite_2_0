/**
 * Flexport classification auto-exporter (briefing §4).
 *
 * The Flexport Classification Template requires exactly:
 *   price, sku, title, description, product_type, link, image_link,
 *   condition, coo, hs_hint
 *
 * Every one of those is already captured by the v2/v4 vendor template, so
 * this module generates the Flexport upload directly from parsed vendor
 * lines — no re-keying. This is the automated cross-check loop: free APIs
 * pre-filter all SKUs, then this file goes to Flexport for authoritative
 * duty (incl. Section 301) on the SKUs we're actively quoting.
 */

import { writeXlsx } from './xlsxWrite.js';

export const FLEXPORT_CLASSIFICATION_COLUMNS = [
  'price', 'sku', 'title', 'description', 'product_type',
  'link', 'image_link', 'condition', 'coo', 'hs_hint',
];

/**
 * Map parsed vendor-sheet lines → Flexport classification rows.
 * Pure + synchronous. Lines with no usable identity (no name) are skipped.
 *
 * @param {Array} lines  Output of parseVendorSheetRows / ingestVendorFile
 * @param {object} [opts]
 * @param {string} [opts.linkBase]  Optional product-page base URL
 * @returns {Array<object>} one object per line, keys = template columns
 */
export function buildFlexportClassificationRows(lines = [], { linkBase = '' } = {}) {
  return (lines || [])
    .filter((l) => l && (l.name || l.model_no))
    .map((l) => ({
      price: l.fob ?? '',
      sku: l.model_no || l.gtin || l.name,
      title: l.name || l.model_no,
      description: l.description || l.name || '',
      product_type: l.product_type || '',
      link: linkBase && l.model_no ? `${linkBase.replace(/\/$/, '')}/${encodeURIComponent(l.model_no)}` : '',
      image_link: l.image_link || '',
      condition: 'new',
      coo: l.country_of_origin || '',
      // The mfr's own HS code (6-digit harmonized) is the best hint we
      // have pre-classification; fall back to whatever HTS we resolved.
      hs_hint: l.mfr_hs_code || l.hts || '',
    }));
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Flexport classification upload as CSV text. */
export function generateFlexportClassificationCsv(lines, opts) {
  const rows = buildFlexportClassificationRows(lines, opts);
  const header = FLEXPORT_CLASSIFICATION_COLUMNS.join(',');
  const body = rows.map((r) => FLEXPORT_CLASSIFICATION_COLUMNS.map((c) => csvCell(r[c])).join(','));
  return [header, ...body].join('\n') + '\n';
}

/** Flexport classification upload as an .xlsx Blob. */
export async function generateFlexportClassificationXlsx(lines, opts) {
  const rows = buildFlexportClassificationRows(lines, opts);
  return writeXlsx({
    creator: 'Unite Medical',
    sheets: [{
      name: 'Classification',
      freezeHeader: true,
      cols: FLEXPORT_CLASSIFICATION_COLUMNS.map((c) => ({ width: c === 'description' || c === 'title' ? 40 : 16 })),
      rows: [
        FLEXPORT_CLASSIFICATION_COLUMNS.map((c) => ({ v: c, s: 'header' })),
        ...rows.map((r) => FLEXPORT_CLASSIFICATION_COLUMNS.map((c) => {
          const v = r[c];
          // hs_hint / coo / sku keep leading zeros + formatting as text.
          if (['hs_hint', 'coo', 'sku'].includes(c)) return { v: String(v ?? ''), s: 'text' };
          return v ?? '';
        })),
      ],
    }],
  });
}
