/**
 * Vendor quote template — PRD-18 §6 / PRD-16 §6, upgraded to the v2
 * master field spec from the vendor-onboarding briefing (53 columns,
 * Product · Pricing · Classification · Compliance · Logistics).
 *
 * Four sheets:
 *   1. "Product Data"   — color-coded headers (red = REQUIRED, amber =
 *                         REQUESTED, plum = UNITE FILLS) + one sample row
 *                         + data validation
 *   2. "Instructions"   — field-by-field guide + version marker
 *   3. "Reference"      — country codes (drives the dropdown), common FDA
 *                         + HTS codes
 *   4. "Data Sources & Validation" — how Unite validates every claim
 *                         (USITC, openFDA, Flexport, GS1) — internal ref
 *
 * Every header is the EXACT canonical key `vendorSheet.js` parses, so
 * uploads map with zero fuzzy-match risk (briefing §2 Tier A+B).
 *
 * The version marker on the Instructions sheet lets the parser detect
 * outdated templates (`detectTemplateVersion`).
 */

import { writeXlsx } from './xlsxWrite.js';

export const TEMPLATE_VERSION = 'v4.0';
export const TEMPLATE_VERSION_MARKER = `Unite Medical · Vendor Quote Template ${TEMPLATE_VERSION}`;

// Requirement levels → header style + label.
const REQ = { level: 'required', style: 'headerReq', label: 'REQUIRED' };
const OPT = { level: 'requested', style: 'headerOpt', label: 'REQUESTED' };
const UNITE = { level: 'unite', style: 'headerUnite', label: 'UNITE FILLS' };

const YN_VALIDATION = {
  type: 'list', formula1: '"Y,N"',
  errorTitle: 'Y or N', error: 'Enter Y or N.',
};

// Column definitions — order here is the template's column order and
// matches the v2 master spec exactly.
export const TEMPLATE_COLUMNS = [
  // ---- Product -----------------------------------------------------------
  { key: 'product_name', req: REQ, group: 'Product', width: 32,
    help: 'Clear name in English if possible (we translate if not).',
    sample: 'Adjustable Hinged Knee Brace' },
  { key: 'manufacturer_model_no', req: REQ, group: 'Product', width: 16, style: 'text',
    help: "The manufacturer's own model or part number.",
    sample: 'BQ-KB-200' },
  { key: 'description', req: REQ, group: 'Product', width: 40,
    help: 'Materials, sizes, medical grade, key specs.',
    sample: 'Neoprene, universal, dual aluminum hinges, medical grade' },
  { key: 'product_type', req: REQ, group: 'Product', width: 30,
    help: 'Category path (also used for Flexport classification).',
    sample: 'Medical > Orthopedic > Knee Brace' },
  { key: 'image_link', req: OPT, group: 'Product', width: 28,
    help: 'Link to a product image (feeds Flexport classification).',
    sample: 'https://example.com/knee-brace.jpg' },
  // ---- Pricing -----------------------------------------------------------
  { key: 'fob_price_usd', req: REQ, group: 'Pricing', width: 14,
    help: 'Unit price at FOB port. Number only; currency in next col.',
    sample: 2.85,
    validation: { type: 'decimal', operator: 'greaterThan', formula1: '0',
      errorTitle: 'Invalid FOB price', error: 'Enter a number greater than 0 (per unit).' } },
  { key: 'currency', req: REQ, group: 'Pricing', width: 10,
    help: 'USD, CNY, EUR, KRW, VND, MYR, TWD.',
    sample: 'USD',
    validation: { type: 'list', formula1: '"USD,CNY,EUR,KRW,VND,MYR,TWD,JPY,THB,INR"',
      errorTitle: 'Unknown currency', error: 'Pick an ISO currency code (e.g. USD, CNY, EUR).' } },
  { key: 'price_break_qty_1', req: OPT, group: 'Pricing', width: 14,
    help: 'First volume tier quantity.', sample: 5000 },
  { key: 'price_break_fob_1', req: OPT, group: 'Pricing', width: 14,
    help: 'FOB unit price at tier-1 quantity.', sample: 2.70 },
  { key: 'price_break_qty_2', req: OPT, group: 'Pricing', width: 14,
    help: 'Second volume tier quantity.', sample: 25000 },
  { key: 'price_break_fob_2', req: OPT, group: 'Pricing', width: 14,
    help: 'FOB unit price at tier-2 quantity.', sample: 2.55 },
  { key: 'tooling_setup_cost_usd', req: REQ, group: 'Pricing', width: 16,
    help: 'One-time tooling/plate/mold/setup cost for private label. 0 if none.', sample: 800 },
  { key: 'sample_cost_usd', req: REQ, group: 'Pricing', width: 14,
    help: 'Cost of a pre-production sample. 0 if free.', sample: 50 },
  { key: 'sample_lead_time_days', req: REQ, group: 'Pricing', width: 16,
    help: 'Days to produce a sample.', sample: 10 },
  { key: 'lead_time_days', req: REQ, group: 'Pricing', width: 14,
    help: 'PRODUCTION lead time in days (order → ready to ship). Drives quote ETAs.', sample: 30,
    validation: { type: 'whole', operator: 'greaterThanOrEqual', formula1: '0',
      errorTitle: 'Invalid lead time', error: 'Enter a whole number of days (0 or more).' } },
  { key: 'moq', req: REQ, group: 'Pricing', width: 10,
    help: 'Minimum order qty for PRIVATE-LABEL production (not stock MOQ).', sample: 1000,
    validation: { type: 'whole', operator: 'greaterThan', formula1: '0',
      errorTitle: 'Invalid MOQ', error: 'Enter a whole number greater than 0.' } },
  { key: 'fob_price_valid_until', req: REQ, group: 'Pricing', width: 16, style: 'text',
    help: 'Date this FOB price holds through (YYYY-MM-DD).', sample: '2026-12-31' },
  { key: 'payment_terms', req: REQ, group: 'Pricing', width: 26,
    help: 'Deposit % / balance terms.', sample: '30% deposit, 70% before shipment' },
  // ---- Classification ----------------------------------------------------
  { key: 'mfr_hs_code', req: REQ, group: 'Classification', width: 14, style: 'text',
    help: "YOUR country's HS code. We confirm the US HTSUS ourselves.", sample: '9021.10' },
  { key: 'hts_code', req: UNITE, group: 'Classification', width: 14, style: 'text',
    help: 'Leave blank — Unite validates via USITC/Flexport.', sample: '' },
  { key: 'country_of_origin', req: REQ, group: 'Classification', width: 16,
    help: 'Where goods are manufactured. ISO-2 or full name.', sample: 'CN',
    validation: { type: 'list', formula1: 'Reference!$A$2:$A$200',
      errorTitle: 'Unknown country', error: 'Pick an ISO-2 code from the Reference sheet (e.g. CN, VN, MY).' } },
  { key: 'alternate_factory_locations', req: OPT, group: 'Classification', width: 20,
    help: 'Other countries/plants you can produce this in (tariff routing).', sample: 'VN' },
  // ---- Compliance --------------------------------------------------------
  { key: 'device_class', req: REQ, group: 'Compliance', width: 12, style: 'text',
    help: 'US FDA device class: 1 or 2. Ask us if unsure.', sample: '2',
    validation: { type: 'list', formula1: '"1,2"',
      errorTitle: 'Device class', error: 'Enter 1 or 2.' } },
  { key: 'fda_product_code', req: OPT, group: 'Compliance', width: 14, style: 'text',
    help: '3-letter US FDA code IF known; else blank, we classify.', sample: 'FPA' },
  { key: 'premarket_510k_or_exempt', req: REQ, group: 'Compliance', width: 18, style: 'text',
    help: "510(k)/PMA number, or 'Exempt' if 510(k)-exempt.", sample: 'K210381' },
  { key: 'actual_manufacturer_name', req: REQ, group: 'Compliance', width: 26,
    help: 'The real legal manufacturer (not the broker/exporter).', sample: 'Bq Plus Medical Co., Ltd.' },
  { key: 'actual_manufacturer_address', req: REQ, group: 'Compliance', width: 34,
    help: 'Full address of the actual manufacturing site.', sample: '#18 Cheye Rd, Songjiang, Shanghai, CN' },
  { key: 'manufacturer_fda_registration', req: OPT, group: 'Compliance', width: 18, style: 'text',
    help: 'FDA establishment reg # IF registered; we can look this up.', sample: '3015058854' },
  { key: 'us_agent', req: UNITE, group: 'Compliance', width: 18,
    help: 'Leave blank — Unite pulls from FDA listing / acts as importer.', sample: '' },
  { key: 'sterile', req: REQ, group: 'Compliance', width: 9, style: 'text',
    help: 'Is the product supplied sterile? Y/N.', sample: 'N', validation: YN_VALIDATION },
  { key: 'single_use', req: REQ, group: 'Compliance', width: 10, style: 'text',
    help: 'Single-use/disposable or reusable? Y/N.', sample: 'N', validation: YN_VALIDATION },
  { key: 'rx_or_otc', req: REQ, group: 'Compliance', width: 10, style: 'text',
    help: 'Prescription or over-the-counter?', sample: 'OTC',
    validation: { type: 'list', formula1: '"Rx,OTC"', errorTitle: 'Rx or OTC', error: 'Enter Rx or OTC.' } },
  { key: 'latex', req: REQ, group: 'Compliance', width: 9, style: 'text',
    help: 'Any natural rubber latex content? Y/N.', sample: 'N', validation: YN_VALIDATION },
  { key: 'dehp_phthalates', req: REQ, group: 'Compliance', width: 12, style: 'text',
    help: 'Contains DEHP or phthalates? Y/N.', sample: 'N', validation: YN_VALIDATION },
  { key: 'shelf_life_months', req: OPT, group: 'Compliance', width: 14,
    help: 'Shelf life / expiry window, if applicable.', sample: 36 },
  { key: 'certifications', req: REQ, group: 'Compliance', width: 22,
    help: 'ISO 13485; CE; ASTM; etc.', sample: 'ISO 13485; CE' },
  { key: 'gtin', req: UNITE, group: 'Compliance', width: 16, style: 'text',
    help: 'Leave blank for new private label — Unite issues via GS1.', sample: '' },
  // ---- Logistics ---------------------------------------------------------
  { key: 'packaging', req: REQ, group: 'Logistics', width: 16,
    help: 'How the item is sold (each, pair, box of N).', sample: 'Each (1 unit)' },
  { key: 'unit_net_weight_g', req: REQ, group: 'Logistics', width: 14,
    help: 'Net weight of one selling unit (grams).', sample: 180 },
  { key: 'unit_l_cm', req: OPT, group: 'Logistics', width: 10, help: 'Individual unit length (cm).', sample: 28 },
  { key: 'unit_w_cm', req: OPT, group: 'Logistics', width: 10, help: 'Individual unit width (cm).', sample: 20 },
  { key: 'unit_h_cm', req: OPT, group: 'Logistics', width: 10, help: 'Individual unit height (cm).', sample: 5 },
  { key: 'units_per_carton', req: REQ, group: 'Logistics', width: 14,
    help: 'Selling units in one export carton.', sample: 100,
    validation: { type: 'whole', operator: 'greaterThan', formula1: '0',
      errorTitle: 'Invalid carton qty', error: 'Enter a whole number greater than 0.' } },
  { key: 'carton_l_cm', req: REQ, group: 'Logistics', width: 11, help: 'Master carton outer length (cm).', sample: 60 },
  { key: 'carton_w_cm', req: REQ, group: 'Logistics', width: 11, help: 'Master carton outer width (cm).', sample: 40 },
  { key: 'carton_h_cm', req: REQ, group: 'Logistics', width: 11, help: 'Master carton outer height (cm).', sample: 50 },
  { key: 'carton_gross_weight_kg', req: REQ, group: 'Logistics', width: 14,
    help: 'Gross weight of one full carton (kg).', sample: 12.5 },
  { key: 'cartons_per_pallet', req: OPT, group: 'Logistics', width: 14,
    help: 'Cartons per pallet (blank if floor-loaded).', sample: 24 },
  { key: 'cartons_per_20ft', req: REQ, group: 'Logistics', width: 14,
    help: "Cartons that fit a 20' container.", sample: 900 },
  { key: 'cartons_per_40ft', req: REQ, group: 'Logistics', width: 14,
    help: "Cartons that fit a 40'/40'HC container.", sample: 1900 },
  { key: 'shipping_port', req: REQ, group: 'Logistics', width: 18,
    help: 'Origin port goods ship from.', sample: 'Shenzhen (Yantian)' },
  { key: 'incoterm', req: REQ, group: 'Logistics', width: 10,
    help: 'Trade term price is quoted on. FOB preferred.', sample: 'FOB',
    validation: { type: 'list', formula1: '"FOB,EXW,FCA,CIF,CFR,DAP,DDP"',
      errorTitle: 'Incoterm', error: 'Pick an incoterm (FOB preferred).' } },
  { key: 'hazmat_lithium', req: REQ, group: 'Logistics', width: 12, style: 'text',
    help: 'Contains batteries/reagents/dangerous goods? Y/N.', sample: 'N', validation: YN_VALIDATION },
  { key: 'cross_reference_skus', req: OPT, group: 'Logistics', width: 22,
    help: 'Competitor / customer part numbers this substitutes for (feeds SKU matching).', sample: '' },
  { key: 'notes', req: OPT, group: 'Logistics', width: 24,
    help: 'Anything else we should know.', sample: '' },
];

export const REQUIRED_COUNT = TEMPLATE_COLUMNS.filter((c) => c.req.level === 'required').length;

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

// How Unite validates the data — mirrored from the briefing §3 table so
// vendors and the desk see the same source of truth.
const DATA_SOURCES = [
  ['US HTSUS + duty rate', 'USITC HTS REST (free)', 'hts.usitc.gov/reststop — confirms real US 10-digit code + MFN/general duty. We validate the mfr\'s HS code against this.'],
  ['Section 301 / AD-CVD', 'Free pre-filter + Flexport ($20/entry)', 'No clean free 301 lookup. Our Chapter 99 pre-filter flags exposure on ALL SKUs; Flexport confirms full duty before we commit a quote.'],
  ['510(k) → real manufacturer', 'openFDA 510k (free)', 'api.fda.gov/device/510k — exposes the actual clearance holder behind a broker/exporter.'],
  ['Device class / product code', 'openFDA classification (free)', 'Validates FDA product code → class + regulation number.'],
  ['Establishment / US Agent', 'openFDA registrationlisting (free)', 'Pulls registration, establishment type, points of contact (public).'],
  ['UDI / GUDID', 'openFDA udi (free) + Unite GS1/GUDID account', 'Unite issues UPC (GS1) + registers UDI/GUDID under Unite — compliance-as-a-service.'],
  ['Recalls', 'openFDA enforcement (free)', 'Recall history per device/firm.'],
  ['Freight / landed cost', 'Flexport API (Unite account)', 'Ocean/air LCL+FCL, brokerage, drayage, ETA.'],
  ['FX / currency', 'exchangerate-api (free, cached)', 'Converts non-USD FOB → USD.'],
];

const H = (v) => ({ v, s: 'header' });
const T = (v) => ({ v, s: 'title' });
const SUB = (v) => ({ v, s: 'subtle' });
const SAMPLE = (v) => ({ v, s: 'sample' });

function buildProductDataSheet() {
  const headerRow = TEMPLATE_COLUMNS.map((c) => ({ v: c.key, s: c.req.style }));
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
    [SUB('Fill in the "Product Data" tab — one row per product. Row 2 is an EXAMPLE — overwrite or delete it.')],
    [SUB('RED headers = REQUIRED (we can\'t quote without them). AMBER = REQUESTED (fill if it applies). PLUM = Unite fills/validates — leave blank.')],
    [SUB('Non-English product names/descriptions are welcome — we translate them automatically.')],
    [],
    [H('Field'), H('Requirement'), H('Group'), H('What to enter')],
    ...TEMPLATE_COLUMNS.map((c) => [c.key, c.req.label, c.group, c.help]),
    [],
    [SUB('Questions? sourcing@unitemedical.net')],
  ];
  return {
    name: 'Instructions',
    cols: [{ width: 28 }, { width: 14 }, { width: 14 }, { width: 78 }],
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

function buildDataSourcesSheet() {
  return {
    name: 'Data Sources & Validation',
    freezeHeader: true,
    cols: [{ width: 26 }, { width: 36 }, { width: 90 }],
    rows: [
      [H('Field'), H('Source'), H('Notes')],
      ...DATA_SOURCES,
    ],
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
    sheets: [buildProductDataSheet(), buildInstructionsSheet(), buildReferenceSheet(), buildDataSourcesSheet()],
  };
}

/** Generate the template as an .xlsx Blob. */
export async function generateTemplateXlsx() {
  return writeXlsx(buildTemplateWorkbook());
}

/** Generate the template as CSV text (header + sample row). */
export function generateTemplateCsv() {
  const headers = TEMPLATE_COLUMNS.map((c) => c.key);
  const sample = TEMPLATE_COLUMNS.map((c) => {
    const v = c.sample ?? '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  });
  return `${headers.join(',')}\n${sample.join(',')}\n`;
}

/**
 * Scan parsed workbook sheets for the template version marker. Matches
 * both our marker ("Template v4.0") and the emailed master's style
 * ("Vendor Template  (v2)").
 * @param {{ name, rows }[]} sheets
 * @returns {{ version: string|null, isCurrent: boolean }}
 */
export function detectTemplateVersion(sheets = []) {
  for (const sheet of sheets) {
    for (const row of sheet.rows || []) {
      for (const cell of row) {
        const m = String(cell || '').match(/template\s*[^a-z0-9]{0,3}v(\d+(?:\.\d+)?)/i);
        if (m) {
          const version = `v${m[1]}`;
          return { version, isCurrent: version === TEMPLATE_VERSION };
        }
      }
    }
  }
  return { version: null, isCurrent: false };
}
