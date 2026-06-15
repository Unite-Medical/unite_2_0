/**
 * Vendor quote template — PRD-18 §6 / PRD-16 §6.
 *
 * The downloadable Excel template we hand approved vendors so their
 * uploads map cleanly with zero column-guessing. Built with the
 * zero-dependency writer in `xlsxWrite.js`. Three sheets:
 *
 *   1. "Product Data"  — headers + one sample row + data validation
 *   2. "Instructions"  — field-by-field guide + version marker
 *   3. "Reference"     — country codes (drives the dropdown), plus
 *                        common FDA + HTS codes for Unite's categories
 *
 * The version marker on the Instructions sheet lets the parser detect
 * outdated templates (`detectTemplateVersion`).
 */

import { writeXlsx } from './xlsxWrite.js';

export const TEMPLATE_VERSION = 'v3.0';
export const TEMPLATE_VERSION_MARKER = `Unite Medical · Vendor Quote Template ${TEMPLATE_VERSION}`;

// Column definitions — order here is the template's column order.
export const TEMPLATE_COLUMNS = [
  { key: 'product_name', header: 'product_name', required: true, width: 32,
    help: 'Full product name / description. Required.', sample: 'Compression stockings 20-30mmHg' },
  { key: 'fda_product_code', header: 'fda_product_code', width: 16, style: 'text',
    help: '3-letter FDA product code (e.g. NHM). Leave blank if unknown — we classify it.', sample: 'NHM' },
  { key: 'hts_code', header: 'hts_code', width: 16, style: 'text',
    help: 'US HTS tariff code, format XXXX.XX or XXXX.XX.XXXX. Leave blank if unknown.', sample: '6115.10' },
  { key: 'fob_price_usd', header: 'fob_price_usd', required: true, width: 14,
    help: 'FOB unit price in USD. Numbers only, greater than 0. Required.', sample: 2.40,
    validation: { type: 'decimal', operator: 'greaterThan', formula1: '0',
      errorTitle: 'Invalid FOB price', error: 'Enter a number greater than 0 (USD per unit).' } },
  { key: 'moq', header: 'moq', width: 10,
    help: 'Minimum order quantity (whole number).', sample: 5000,
    validation: { type: 'whole', operator: 'greaterThan', formula1: '0',
      errorTitle: 'Invalid MOQ', error: 'Enter a whole number greater than 0.' } },
  { key: 'target_quantity', header: 'target_quantity', width: 14,
    help: 'Quantity to quote (defaults to MOQ if blank).', sample: 5000,
    validation: { type: 'whole', operator: 'greaterThan', formula1: '0',
      errorTitle: 'Invalid quantity', error: 'Enter a whole number greater than 0.' } },
  { key: 'lead_time_days', header: 'lead_time_days', width: 14,
    help: 'Production + ready-to-ship lead time in days.', sample: 35,
    validation: { type: 'whole', operator: 'greaterThanOrEqual', formula1: '0',
      errorTitle: 'Invalid lead time', error: 'Enter a whole number of days (0 or more).' } },
  { key: 'country_of_origin', header: 'country_of_origin', width: 18,
    help: 'ISO-2 country code of manufacture. Pick from the dropdown.', sample: 'CN',
    validation: { type: 'list', formula1: 'Reference!$A$2:$A$200',
      errorTitle: 'Unknown country', error: 'Pick an ISO-2 code from the Reference sheet (e.g. CN, VN, MY).' } },
  { key: 'gtin', header: 'gtin', width: 18, style: 'text',
    help: 'GTIN/UPC/EAN barcode. We validate the check digit.', sample: '' },
  { key: 'packaging', header: 'packaging', width: 18,
    help: 'Pack size / packaging notes (e.g. "10/box, 100/case").', sample: '10/box' },
  { key: 'description', header: 'description', width: 36,
    help: 'Extra detail, specs, or original-language name. Non-English is OK — we translate.', sample: '' },
  { key: 'notes', header: 'notes', width: 24,
    help: 'Anything else we should know.', sample: '' },
];

// ISO-2 codes that drive the country dropdown. Medical-manufacturing
// hubs first, then a broad fallback set.
export const COUNTRY_CODES = [
  ['CN', 'China'], ['VN', 'Vietnam'], ['MY', 'Malaysia'], ['TH', 'Thailand'],
  ['IN', 'India'], ['ID', 'Indonesia'], ['KR', 'South Korea'], ['TW', 'Taiwan'],
  ['JP', 'Japan'], ['PK', 'Pakistan'], ['BD', 'Bangladesh'], ['PH', 'Philippines'],
  ['DE', 'Germany'], ['IT', 'Italy'], ['FR', 'France'], ['ES', 'Spain'],
  ['GB', 'United Kingdom'], ['IE', 'Ireland'], ['CH', 'Switzerland'], ['NL', 'Netherlands'],
  ['BE', 'Belgium'], ['PL', 'Poland'], ['CZ', 'Czechia'], ['HU', 'Hungary'],
  ['TR', 'Turkey'], ['IL', 'Israel'], ['AE', 'United Arab Emirates'], ['EG', 'Egypt'],
  ['MX', 'Mexico'], ['BR', 'Brazil'], ['CA', 'Canada'], ['US', 'United States'],
  ['CR', 'Costa Rica'], ['DO', 'Dominican Republic'], ['CO', 'Colombia'],
  ['AU', 'Australia'], ['NZ', 'New Zealand'], ['ZA', 'South Africa'],
  ['SG', 'Singapore'], ['LK', 'Sri Lanka'], ['KH', 'Cambodia'], ['MM', 'Myanmar'],
  ['PT', 'Portugal'], ['SE', 'Sweden'], ['DK', 'Denmark'], ['FI', 'Finland'],
  ['AT', 'Austria'], ['RO', 'Romania'], ['SK', 'Slovakia'], ['SI', 'Slovenia'],
];

// Common FDA product codes for Unite's categories (reference only).
const FDA_REFERENCE = [
  ['NHM', 'Compression stocking / hose'],
  ['KGN', 'General medical / thermometry accessory'],
  ['FRO', 'Examination gloves (non-surgical)'],
  ['LYY', 'Surgeon\'s gloves'],
  ['BSZ', 'Surgical mask'],
  ['MSH', 'N95 respirator (surgical)'],
  ['FXX', 'Adhesive bandage'],
  ['KGX', 'Hot/cold therapy pack'],
  ['DXN', 'Pulse oximeter'],
  ['DQA', 'Blood pressure cuff'],
];

// Common HTS codes for medical supplies (reference only).
const HTS_REFERENCE = [
  ['9018.90', 'Medical/surgical instruments & appliances'],
  ['9021.10', 'Orthopedic / fracture appliances'],
  ['6115.10', 'Graduated compression hosiery'],
  ['6307.90', 'Made-up textile articles (masks, etc.)'],
  ['4015.12', 'Medical examination/surgical gloves (rubber)'],
  ['3926.20', 'Plastic gloves & apparel'],
  ['9025.19', 'Thermometers'],
  ['3005.10', 'Adhesive dressings'],
  ['9018.19', 'Electro-diagnostic apparatus (oximeters)'],
  ['3824.99', 'Chemical preparations (gel packs)'],
];

const H = (v) => ({ v, s: 'header' });
const T = (v) => ({ v, s: 'title' });
const SUB = (v) => ({ v, s: 'subtle' });
const SAMPLE = (v) => ({ v, s: 'sample' });

function buildProductDataSheet() {
  const headerRow = TEMPLATE_COLUMNS.map((c) => H(c.header));
  // One sample row (styled) so vendors see the expected shape.
  const sampleRow = TEMPLATE_COLUMNS.map((c) => {
    if (c.sample === '' || c.sample == null) return SAMPLE('');
    return c.style === 'text' ? { v: String(c.sample), s: 'text' } : SAMPLE(c.sample);
  });

  // Build validations, applied to rows 2..1000 of each relevant column.
  const validations = [];
  TEMPLATE_COLUMNS.forEach((c, i) => {
    if (!c.validation) return;
    const col = colLetter(i);
    validations.push({ ...c.validation, sqref: `${col}2:${col}1000` });
  });

  return {
    name: 'Product Data',
    freezeHeader: true,
    cols: TEMPLATE_COLUMNS.map((c) => ({ width: c.width })),
    rows: [headerRow, sampleRow],
    validations,
  };
}

function buildInstructionsSheet() {
  const rows = [
    [T(TEMPLATE_VERSION_MARKER)],
    [SUB('Fill in the "Product Data" tab — one row per product. The first sample row can be overwritten.')],
    [SUB('Only product_name and fob_price_usd are required. We auto-classify FDA + HTS codes when blank.')],
    [],
    [H('Field'), H('Required'), H('Notes')],
    ...TEMPLATE_COLUMNS.map((c) => [c.header, c.required ? 'Yes' : 'No', c.help]),
    [],
    [SUB('Non-English product names/descriptions are welcome — we translate them automatically.')],
    [SUB('Questions? sourcing@unitemedical.net')],
  ];
  return {
    name: 'Instructions',
    cols: [{ width: 22 }, { width: 12 }, { width: 70 }],
    rows,
  };
}

function buildReferenceSheet() {
  const maxLen = Math.max(COUNTRY_CODES.length, FDA_REFERENCE.length, HTS_REFERENCE.length);
  const rows = [[H('country_code'), H('country_name'), H('fda_code'), H('fda_desc'), H('hts_code'), H('hts_desc')]];
  for (let i = 0; i < maxLen; i++) {
    rows.push([
      COUNTRY_CODES[i]?.[0] ?? '', COUNTRY_CODES[i]?.[1] ?? '',
      FDA_REFERENCE[i] ? { v: FDA_REFERENCE[i][0], s: 'text' } : '', FDA_REFERENCE[i]?.[1] ?? '',
      HTS_REFERENCE[i] ? { v: HTS_REFERENCE[i][0], s: 'text' } : '', HTS_REFERENCE[i]?.[1] ?? '',
    ]);
  }
  return {
    name: 'Reference',
    freezeHeader: true,
    cols: [{ width: 14 }, { width: 22 }, { width: 12 }, { width: 34 }, { width: 12 }, { width: 38 }],
    rows,
  };
}

function colLetter(i) {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Build the full template workbook spec. */
export function buildTemplateWorkbook() {
  return {
    creator: 'Unite Medical',
    sheets: [buildProductDataSheet(), buildInstructionsSheet(), buildReferenceSheet()],
  };
}

/** Generate the template as an .xlsx Blob. */
export async function generateTemplateXlsx() {
  return writeXlsx(buildTemplateWorkbook());
}

/** Generate the template as CSV text (header + sample row). */
export function generateTemplateCsv() {
  const headers = TEMPLATE_COLUMNS.map((c) => c.header);
  const sample = TEMPLATE_COLUMNS.map((c) => {
    const v = c.sample ?? '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  });
  return `${headers.join(',')}\n${sample.join(',')}\n`;
}

/**
 * Scan parsed workbook sheets for the template version marker.
 * @param {{ name, rows }[]} sheets
 * @returns {{ version: string|null, isCurrent: boolean }}
 */
export function detectTemplateVersion(sheets = []) {
  for (const sheet of sheets) {
    for (const row of sheet.rows || []) {
      for (const cell of row) {
        const m = String(cell || '').match(/template\s*[·:-]?\s*v(\d+(?:\.\d+)?)/i);
        if (m) {
          const version = `v${m[1]}`;
          return { version, isCurrent: version === TEMPLATE_VERSION };
        }
      }
    }
  }
  return { version: null, isCurrent: false };
}
