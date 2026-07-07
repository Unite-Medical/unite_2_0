/**
 * Vendor sheet parser — PRD-08 Phase 1 + PRD-18 (advanced parsing).
 *
 * Accepts CSV or XLSX uploaded from the quoting wizard. CSV is parsed
 * inline (RFC-4180 handling for quoted fields with commas/newlines);
 * XLSX is read natively via src/lib/xlsx.js (ZIP + DOMParser, no deps)
 * so foreign vendors can upload their Excel templates as-is.
 *
 * Column mapping is layered (PRD-18 §5):
 *   1. Exact alias match — English + Chinese/Vietnamese/Korean aliases
 *   2. Fuzzy match — normalized Levenshtein for typos/spacing variants
 *   3. Claude fallback — only if required columns are still unmapped
 *
 * Non-English product names/descriptions are translated via Claude while
 * preserving the original (PRD-18 §3). Multi-sheet workbooks auto-detect
 * the real data sheet. Template version is detected + warned on.
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
 *   cross_reference_skus (optional — competitor / customer part numbers this
 *                      product substitutes for; feeds the cross-reference
 *                      SKU database, PRD-29 §4.1.3)
 *
 * Tier B (vendor template v2/v4 — landed-cost + compliance inputs):
 *   manufacturer_model_no, product_type, image_link, price_break_qty_1/2,
 *   price_break_fob_1/2, tooling_setup_cost_usd, sample_cost_usd,
 *   sample_lead_time_days, fob_price_valid_until, payment_terms,
 *   mfr_hs_code (the manufacturer's OWN country HS code — used as a hint,
 *   never as the final US HTSUS), alternate_factory_locations, device_class,
 *   premarket_510k_or_exempt, actual_manufacturer_name/_address,
 *   manufacturer_fda_registration, us_agent, sterile, single_use, rx_or_otc,
 *   latex, dehp_phthalates, shelf_life_months, certifications,
 *   unit_net_weight_g, unit_l/w/h_cm, units_per_carton, carton_l/w/h_cm,
 *   carton_gross_weight_kg, cartons_per_pallet, cartons_per_20ft/40ft,
 *   shipping_port, incoterm, hazmat_lithium
 */

import { isValidGtin } from './external/gs1.js';
import { readXlsxWorkbook } from './xlsx.js';
import { ai } from './ai/client.js';
import { detectTemplateVersion, TEMPLATE_VERSION } from './quoteTemplate.js';
import { normalizeCurrency, convert } from './external/exchangeRates.js';

export const REQUIRED_COLUMNS = ['product_name', 'fob_price_usd'];

// Soft cap from PRD-18 §3 — we still process more, but warn.
export const SOFT_ROW_LIMIT = 500;
// Below/above these FOB values we flag the row for human review.
const SUSPICIOUS_FOB_LOW = 0.001;
const SUSPICIOUS_FOB_HIGH = 100000;

export const COLUMN_ALIASES = {
  product_name:      ['product_name', 'product', 'name', 'item', 'item name', 'sku description', 'description of goods', 'product description'],
  fda_product_code:  ['fda_product_code', 'fda product code', 'fda code', 'product code', 'device code'],
  hts_code:          ['hts_code', 'hts', 'htsus', 'tariff code', 'hs code', 'hs_code', 'harmonized code', 'customs code'],
  fob_price_usd:     ['fob_price_usd', 'fob price', 'fob', 'unit cost', 'cost', 'price', 'unit price', 'fob usd', 'ex-works price', 'exw'],
  moq:               ['moq', 'min order qty', 'minimum order quantity', 'min qty', 'minimum order'],
  lead_time_days:    ['lead_time_days', 'lead time', 'lead time (days)', 'lead', 'delivery time', 'production time'],
  country_of_origin: ['country_of_origin', 'country of origin', 'origin', 'coo', 'made in', 'manufacture country'],
  description:       ['description', 'desc', 'details', 'specification', 'specs', 'remark'],
  gtin:              ['gtin', 'upc', 'ean', 'barcode', 'gtin/upc'],
  packaging:         ['packaging', 'pack size', 'pack', 'packing', 'carton', 'unit of measure', 'uom'],
  target_quantity:   ['target_quantity', 'target qty', 'quantity', 'qty', 'order quantity', 'requested qty'],
  notes:             ['notes', 'comments', 'comment', 'note'],
  currency:          ['currency', 'ccy', 'cur', 'currency code', 'fob currency', 'price currency', 'unit'],
  // PRD-29 §4.1.3 — cross-reference SKUs on the manufacturer product sheet
  // (competitor / customer part numbers this product substitutes for).
  cross_reference_skus: ['cross_reference_skus', 'cross reference', 'cross-reference', 'cross ref', 'xref', 'equivalent sku', 'equivalent skus', 'substitute for', 'competitor part number', 'competitor sku', 'oem part number'],

  // --- Tier B — vendor template v2/v4 (landed-cost + compliance) ---------
  // Product
  manufacturer_model_no: ['manufacturer_model_no', 'model no', 'model number', 'model #', 'part number', 'part no', 'mfr model', 'item number', 'item no', 'sku'],
  product_type:          ['product_type', 'product category', 'category', 'category path'],
  image_link:            ['image_link', 'image url', 'product image url', 'image', 'photo url', 'picture url'],
  // Pricing
  price_break_qty_1:     ['price_break_qty_1', 'price break qty 1', 'tier 1 qty', 'volume qty 1'],
  price_break_fob_1:     ['price_break_fob_1', 'price break fob 1', 'tier 1 price', 'volume price 1'],
  price_break_qty_2:     ['price_break_qty_2', 'price break qty 2', 'tier 2 qty', 'volume qty 2'],
  price_break_fob_2:     ['price_break_fob_2', 'price break fob 2', 'tier 2 price', 'volume price 2'],
  tooling_setup_cost_usd: ['tooling_setup_cost_usd', 'tooling cost', 'setup cost', 'tooling / setup', 'nre', 'mold cost'],
  sample_cost_usd:       ['sample_cost_usd', 'sample cost', 'sample price'],
  sample_lead_time_days: ['sample_lead_time_days', 'sample lead time', 'sample lead time (days)'],
  fob_price_valid_until: ['fob_price_valid_until', 'price valid until', 'valid until', 'price validity', 'quote valid until'],
  payment_terms:         ['payment_terms', 'payment term', 'payment', 'terms of payment'],
  // Classification — mfr_hs_code is THEIR country's HS code (hint only).
  mfr_hs_code:           ['mfr_hs_code', 'mfr hs code', 'manufacturer hs code', 'origin hs code', 'export hs code', 'local hs code', 'your hs code'],
  alternate_factory_locations: ['alternate_factory_locations', 'alternate factory locations', 'alt factory', 'other factories'],
  // Compliance
  device_class:          ['device_class', 'device class', 'fda class', 'fda device class'],
  premarket_510k_or_exempt: ['premarket_510k_or_exempt', '510k', '510(k)', '510k number', '510(k) # or exempt', 'premarket'],
  actual_manufacturer_name: ['actual_manufacturer_name', 'actual manufacturer', 'legal manufacturer', 'manufacturer name', 'manufacturer'],
  actual_manufacturer_address: ['actual_manufacturer_address', 'manufacturer address', 'factory address', 'actual mfr address'],
  manufacturer_fda_registration: ['manufacturer_fda_registration', 'fda registration', 'fda reg #', 'establishment registration', 'fei number', 'fei'],
  us_agent:              ['us_agent', 'us agent'],
  sterile:               ['sterile', 'sterile?', 'sterile y/n', 'supplied sterile'],
  single_use:            ['single_use', 'single use', 'single-use?', 'disposable'],
  rx_or_otc:             ['rx_or_otc', 'rx or otc', 'rx/otc', 'prescription or otc'],
  latex:                 ['latex', 'contains latex', 'latex?', 'natural rubber latex'],
  dehp_phthalates:       ['dehp_phthalates', 'dehp', 'phthalates', 'dehp/phthalates'],
  shelf_life_months:     ['shelf_life_months', 'shelf life', 'shelf life (months)', 'expiry months'],
  certifications:        ['certifications', 'certs', 'certificates', 'quality certifications'],
  // Logistics (container math)
  unit_net_weight_g:     ['unit_net_weight_g', 'unit net weight', 'net weight (g)', 'unit weight g'],
  unit_l_cm:             ['unit_l_cm', 'unit l (cm)', 'unit length cm'],
  unit_w_cm:             ['unit_w_cm', 'unit w (cm)', 'unit width cm'],
  unit_h_cm:             ['unit_h_cm', 'unit h (cm)', 'unit height cm'],
  units_per_carton:      ['units_per_carton', 'units per carton', 'qty per carton', 'pcs per carton', 'pcs/ctn', 'carton pack qty'],
  carton_l_cm:           ['carton_l_cm', 'carton l (cm)', 'carton length cm', 'ctn l'],
  carton_w_cm:           ['carton_w_cm', 'carton w (cm)', 'carton width cm', 'ctn w'],
  carton_h_cm:           ['carton_h_cm', 'carton h (cm)', 'carton height cm', 'ctn h'],
  carton_gross_weight_kg: ['carton_gross_weight_kg', 'carton gross weight', 'gross weight (kg)', 'carton gw', 'gw kg'],
  cartons_per_pallet:    ['cartons_per_pallet', 'cartons per pallet', 'ctns per pallet'],
  cartons_per_20ft:      ['cartons_per_20ft', "cartons per 20'", 'cartons per 20ft', 'ctns per 20', '20ft loadability'],
  cartons_per_40ft:      ['cartons_per_40ft', "cartons per 40'", 'cartons per 40ft', 'ctns per 40', '40ft loadability', '40hq loadability'],
  shipping_port:         ['shipping_port', 'fob port', 'port of loading', 'origin port', 'loading port', 'shipping port'],
  incoterm:              ['incoterm', 'incoterms', 'trade term', 'trade terms'],
  hazmat_lithium:        ['hazmat_lithium', 'hazmat', 'dangerous goods', 'lithium', 'hazmat / lithium'],
};

// PRD-18 §5 Layer 2 — multilingual aliases (Chinese / Korean / Vietnamese).
export const COLUMN_ALIASES_INTL = {
  product_name:      ['产品名称', '品名', '商品名', '名称', '产品', '제품명', '품명', 'tên sản phẩm', 'sản phẩm'],
  fda_product_code:  ['fda编码', 'fda代码', 'fda 코드'],
  hts_code:          ['海关编码', 'hs编码', 'hs 编码', '关税编码', '税则号', '관세코드', 'hs코드', 'mã hs', 'mã hải quan'],
  fob_price_usd:     ['单价', '价格', 'fob价格', 'fob 价格', '出厂价', '美元单价', '단가', '가격', 'giá', 'giá fob', 'đơn giá'],
  moq:               ['最小起订量', '起订量', '最低订量', '최소주문수량', 'số lượng tối thiểu', 'moq数量'],
  lead_time_days:    ['交期', '交货期', '生产周期', '리드타임', 'thời gian giao hàng'],
  country_of_origin: ['原产国', '产地', '原产地', '원산지', 'xuất xứ', 'nước xuất xứ'],
  description:       ['描述', '说明', '规格', '备注说明', '설명', '규격', 'mô tả', 'thông số'],
  gtin:              ['条形码', '条码', '바코드', 'mã vạch'],
  packaging:         ['包装', '包装规格', '装箱', '포장', 'đóng gói', 'quy cách'],
  target_quantity:   ['数量', '订购数量', '需求数量', '수량', '주문수량', 'số lượng'],
  notes:             ['备注', '其他', '비고', 'ghi chú'],
  currency:          ['币种', '货币', '通货', '통화', '화폐', 'tiền tệ', 'đơn vị tiền'],
};

// All canonical fields the AI mapper is allowed to choose from.
export const CANONICAL_FIELDS = Object.keys(COLUMN_ALIASES);

// ---------------------------------------------------------------------------
// String similarity (fuzzy header matching)
// ---------------------------------------------------------------------------

function normalizeHeader(h) {
  return String(h || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\u3400-\u9fff\uac00-\ud7af]+/g, '') // keep latin + CJK + Hangul
    .trim();
}

/**
 * Damerau-Levenshtein (optimal string alignment) distance — like plain
 * edit distance but treats an adjacent transposition ("prodcut" ↔
 * "product") as a single edit, which is the most common header typo.
 */
function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  return 1 - editDistance(a, b) / maxLen;
}

// ---------------------------------------------------------------------------
// Column resolution (layers 1 + 2)
// ---------------------------------------------------------------------------

const FUZZY_THRESHOLD = 0.82;

/**
 * Resolve headers → canonical fields using exact aliases (EN + intl)
 * then fuzzy matching. Never assigns the same column twice.
 *
 * @returns {{ map: Record<string,number>, meta: Record<string,object>, unmappedRequired: string[] }}
 */
export function resolveColumns(headers) {
  const norm = headers.map(normalizeHeader);
  const map = {};
  const meta = {};
  const usedCols = new Set();

  // Layer 1 — exact alias match (English + international).
  for (const field of CANONICAL_FIELDS) {
    const aliases = [...COLUMN_ALIASES[field], ...(COLUMN_ALIASES_INTL[field] || [])].map(normalizeHeader);
    const idx = norm.findIndex((h, i) => h && !usedCols.has(i) && aliases.includes(h));
    if (idx >= 0) {
      map[field] = idx;
      meta[field] = { via: 'alias', header: headers[idx], score: 1 };
      usedCols.add(idx);
    }
  }

  // Layer 2 — fuzzy match for anything still unmapped.
  for (const field of CANONICAL_FIELDS) {
    if (field in map) continue;
    const aliases = [...COLUMN_ALIASES[field], ...(COLUMN_ALIASES_INTL[field] || [])].map(normalizeHeader);
    let best = { idx: -1, score: 0 };
    norm.forEach((h, i) => {
      if (!h || usedCols.has(i)) return;
      for (const a of aliases) {
        const score = similarity(h, a);
        if (score > best.score) best = { idx: i, score };
      }
    });
    if (best.idx >= 0 && best.score >= FUZZY_THRESHOLD) {
      map[field] = best.idx;
      meta[field] = { via: 'fuzzy', header: headers[best.idx], score: +best.score.toFixed(2) };
      usedCols.add(best.idx);
    }
  }

  const unmappedRequired = REQUIRED_COLUMNS.filter((f) => !(f in map));
  return { map, meta, unmappedRequired };
}

/**
 * Layer 3 — Claude fallback. Only invoked when required columns are
 * still unmapped after layers 1+2. Merges AI suggestions on top of the
 * deterministic map (never overrides a confident alias match).
 */
export async function resolveColumnsWithAi(headers, { onProgress = () => {} } = {}) {
  const base = resolveColumns(headers);
  if (base.unmappedRequired.length === 0) return { ...base, aiUsed: false };

  onProgress({ step: 'columns', label: 'Mapping ambiguous columns with AI…' });
  const usedCols = new Set(Object.values(base.map));
  try {
    const { data } = await ai.run('quoting/column_map', {
      input: {
        headers: JSON.stringify(headers),
        fields: JSON.stringify(CANONICAL_FIELDS),
      },
      source: 'vendor-sheet',
    });
    for (const m of data?.mappings || []) {
      const { field, column_index: idx } = m;
      if (!CANONICAL_FIELDS.includes(field)) continue;
      if (field in base.map) continue;
      if (!Number.isInteger(idx) || idx < 0 || idx >= headers.length) continue;
      if (usedCols.has(idx)) continue;
      base.map[field] = idx;
      base.meta[field] = { via: 'ai', header: headers[idx], score: +(m.confidence ?? 0.6).toFixed(2) };
      usedCols.add(idx);
    }
  } catch {
    // AI mapping is best-effort; deterministic map already stands.
  }
  base.unmappedRequired = REQUIRED_COLUMNS.filter((f) => !(f in base.map));
  return { ...base, aiUsed: true };
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  // Tolerate currency symbols, thousands separators, and stray spaces.
  const n = Number(String(v).replace(/[^0-9.-]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function int(v) {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

function str(v) {
  return v == null ? '' : String(v).trim();
}

/** Coerce Y/N-ish cells ("Y", "yes", "true", "N", "no") → boolean|null. */
function yn(v) {
  const s = str(v).toLowerCase();
  if (!s) return null;
  if (['y', 'yes', 'true', '1', 'si', '是', '예', 'có'].includes(s)) return true;
  if (['n', 'no', 'false', '0', '否', '아니오', 'không'].includes(s)) return false;
  return null;
}

/**
 * Normalize an HS/HTS code to dotted form for USITC lookup:
 * "902110" → "9021.10", "9021.10.00" → "9021.10.00". Returns '' when the
 * cell doesn't contain at least 4 digits.
 */
export function normalizeHsCode(v) {
  const digits = String(v || '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  const parts = [digits.slice(0, 4)];
  if (digits.length >= 6) parts.push(digits.slice(4, 6));
  if (digits.length >= 8) parts.push(digits.slice(6, Math.min(10, digits.length)));
  return parts.join('.');
}

function hasNonAscii(s) {
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) return true;
  }
  return false;
}

/**
 * Detect a currency from a raw price cell (e.g. "¥12.50", "€9,90",
 * "RMB 8.0"). Returns an ISO code or null. Used as a fallback when there
 * is no dedicated currency column.
 */
function detectCurrencyToken(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const symbol = s.match(/[$€£¥₩₹₫]/);
  if (symbol) return normalizeCurrency(symbol[0]);
  const code = s.match(/\b([A-Za-z]{3})\b/);
  if (code) { const c = normalizeCurrency(code[1]); if (c) return c; }
  const word = s.match(/(rmb|yuan|renminbi|euro|won|yen|dong|rupee|baht|ringgit|rupiah|peso|sterling)/i);
  if (word) return normalizeCurrency(word[1]);
  return null;
}

// ---------------------------------------------------------------------------
// Core row parser
// ---------------------------------------------------------------------------

/**
 * Parse pre-split rows (from CSV or XLSX) into the canonical line shape
 * consumed by `src/lib/quoting.js`.
 *
 * @param {object} opts
 * @param {string[][]} opts.rows
 * @param {object} [opts.resolved]  Precomputed column resolution (from
 *   `resolveColumnsWithAi`). If omitted, computed synchronously.
 * @returns {{ ok, vendor, lines, errors, warnings, totals, column_map, mapping }}
 */
export function parseVendorSheetRows({ rows, filename = 'sheet.csv', vendorHint = '', resolved = null }) {
  const result = {
    ok: false,
    vendor: vendorHint || filename.replace(/\.[^.]+$/, ''),
    lines: [],
    errors: [],
    warnings: [],
    totals: { rows: 0, accepted: 0, skipped: 0 },
    column_map: {},
    mapping: {},
  };

  if (!Array.isArray(rows) || rows.length < 2) {
    result.errors.push('Sheet must have a header row and at least one data row.');
    return result;
  }

  const headers = rows[0];
  const res = resolved || resolveColumns(headers);
  const cols = res.map;
  result.column_map = cols;
  result.mapping = res.meta || {};

  if (res.unmappedRequired?.length) {
    for (const req of res.unmappedRequired) {
      result.errors.push(`Couldn't find a column for "${req}" (accepted: ${COLUMN_ALIASES[req].join(', ')}).`);
    }
    return result;
  }

  const seenGtins = new Map();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const cell = (key) => (key in cols ? row[cols[key]] : undefined);
    result.totals.rows += 1;

    const name = str(cell('product_name'));
    const rawFob = cell('fob_price_usd');
    const fob = num(rawFob);
    const currencyCell = str(cell('currency'));
    const fobCurrency = normalizeCurrency(currencyCell) || detectCurrencyToken(rawFob) || 'USD';
    if (!name) { result.warnings.push(`Row ${r + 1}: missing product_name, skipped.`); result.totals.skipped += 1; continue; }
    if (fob === null) { result.warnings.push(`Row ${r + 1} (${name}): invalid fob_price_usd, skipped.`); result.totals.skipped += 1; continue; }
    if (fob <= 0) { result.warnings.push(`Row ${r + 1} (${name}): fob_price_usd must be > 0, skipped.`); result.totals.skipped += 1; continue; }
    if (fob < SUSPICIOUS_FOB_LOW || fob > SUSPICIOUS_FOB_HIGH) {
      result.warnings.push(`Row ${r + 1} (${name}): FOB $${fob} looks out of range — please double-check the unit price.`);
    }

    const fdaProvided = Boolean(str(cell('fda_product_code')));
    const fda = str(cell('fda_product_code')).toUpperCase() || 'KGN';
    const moq = int(cell('moq')) ?? 1;
    const target_qty = int(cell('target_quantity')) ?? moq;
    const gtin = str(cell('gtin'));
    const country = str(cell('country_of_origin'));
    const description = str(cell('description'));

    // HTS resolution (template v2 fix): the vendor's `hts_code` column is
    // usually BLANK by design (Unite fills the US HTSUS). Never silently
    // default duty math to 6307.90 when the manufacturer supplied their own
    // country's HS code — the 6-digit prefix is internationally harmonized,
    // so it's a legitimate USITC lookup hint pending Unite confirmation.
    const vendorHts = str(cell('hts_code'));
    const mfrHs = normalizeHsCode(cell('mfr_hs_code'));
    let htsResolved;
    let htsSource;
    if (vendorHts) {
      htsResolved = vendorHts;
      htsSource = 'vendor';
    } else if (mfrHs) {
      htsResolved = mfrHs.split('.').slice(0, 2).join('.'); // 6-digit harmonized prefix
      htsSource = 'mfr_hint';
      result.warnings.push(`Row ${r + 1} (${name}): US HTSUS pending — using the manufacturer's HS code ${mfrHs} (6-digit prefix) until Unite confirms via USITC/Flexport.`);
    } else {
      htsResolved = '6307.90';
      htsSource = 'default';
      result.warnings.push(`Row ${r + 1} (${name}): no HS/HTS code provided — defaulting to 6307.90 (7% MFN). Classify before sending the quote.`);
    }
    const hts = htsResolved;

    // Tier B — pricing extras
    const priceBreaks = [];
    for (const n of [1, 2]) {
      const q = int(cell(`price_break_qty_${n}`));
      const p = num(cell(`price_break_fob_${n}`));
      if (q > 0 && p > 0) priceBreaks.push({ qty: q, fob: p });
    }
    priceBreaks.sort((a, b) => a.qty - b.qty);

    // Tier B — carton / container math
    const cartonL = num(cell('carton_l_cm'));
    const cartonW = num(cell('carton_w_cm'));
    const cartonH = num(cell('carton_h_cm'));
    const cartonCbm = cartonL > 0 && cartonW > 0 && cartonH > 0
      ? +((cartonL * cartonW * cartonH) / 1e6).toFixed(4)
      : null;

    const incoterm = str(cell('incoterm')).toUpperCase() || null;
    if (incoterm && !['FOB', 'EXW', 'FCA', 'CIF', 'CFR', 'DDP', 'DAP'].includes(incoterm)) {
      result.warnings.push(`Row ${r + 1} (${name}): unrecognized incoterm "${incoterm}" — FOB preferred.`);
    }

    if (gtin) {
      if (!isValidGtin(gtin)) {
        result.warnings.push(`Row ${r + 1} (${name}): GTIN check-digit invalid; pricing will proceed without GS1 validation.`);
      } else if (seenGtins.has(gtin)) {
        result.warnings.push(`Row ${r + 1} (${name}): duplicate GTIN ${gtin} (first seen row ${seenGtins.get(gtin)}).`);
      } else {
        seenGtins.set(gtin, r + 1);
      }
    }
    if (hts && !/^\d{4}\.\d{2}(?:\.\d{2}(?:\d{2})?)?$/.test(hts)) {
      result.warnings.push(`Row ${r + 1} (${name}): HTS code "${hts}" doesn't match XXXX.XX or XXXX.XX.XX(XX); USITC lookup may fall through to default rate.`);
    }

    result.lines.push({
      row: r + 1,
      name,
      name_original: name,
      fob,
      fob_currency: fobCurrency,
      fob_original: fob,
      converted: false,
      moq,
      target_qty,
      hts,
      hts_source: htsSource,                       // 'vendor' | 'mfr_hint' | 'default'
      hts_pending: htsSource !== 'vendor',         // Unite must confirm the US HTSUS
      mfr_hs_code: mfrHs || null,
      fda_product_code: fda,
      fda_inferred: !fdaProvided,
      gtin: gtin || null,
      country_of_origin: country || null,
      description: description || null,
      description_original: description || null,
      packaging: str(cell('packaging')) || null,
      lead_time_days: int(cell('lead_time_days')) ?? null,
      notes: str(cell('notes')) || null,
      needs_translation: hasNonAscii(name) || hasNonAscii(description),
      cross_reference_skus: str(cell('cross_reference_skus')) || null,

      // --- Tier B: product ---
      model_no: str(cell('manufacturer_model_no')) || null,
      product_type: str(cell('product_type')) || null,
      image_link: str(cell('image_link')) || null,

      // --- Tier B: pricing ---
      price_breaks: priceBreaks,                   // [{ qty, fob }] ascending
      tooling_setup_cost_usd: num(cell('tooling_setup_cost_usd')),
      sample_cost_usd: num(cell('sample_cost_usd')),
      sample_lead_time_days: int(cell('sample_lead_time_days')),
      fob_price_valid_until: str(cell('fob_price_valid_until')) || null,
      payment_terms: str(cell('payment_terms')) || null,

      // --- Tier B: classification / compliance ---
      alternate_factory_locations: str(cell('alternate_factory_locations')) || null,
      device_class: str(cell('device_class')) || null,
      premarket_510k_or_exempt: str(cell('premarket_510k_or_exempt')) || null,
      actual_manufacturer_name: str(cell('actual_manufacturer_name')) || null,
      actual_manufacturer_address: str(cell('actual_manufacturer_address')) || null,
      manufacturer_fda_registration: str(cell('manufacturer_fda_registration')) || null,
      us_agent: str(cell('us_agent')) || null,
      sterile: yn(cell('sterile')),
      single_use: yn(cell('single_use')),
      rx_or_otc: str(cell('rx_or_otc')).toUpperCase() || null,
      latex: yn(cell('latex')),
      dehp_phthalates: yn(cell('dehp_phthalates')),
      shelf_life_months: int(cell('shelf_life_months')),
      certifications: str(cell('certifications')) || null,

      // --- Tier B: logistics (container math) ---
      unit_net_weight_g: num(cell('unit_net_weight_g')),
      unit_l_cm: num(cell('unit_l_cm')),
      unit_w_cm: num(cell('unit_w_cm')),
      unit_h_cm: num(cell('unit_h_cm')),
      units_per_carton: int(cell('units_per_carton')),
      carton_l_cm: cartonL,
      carton_w_cm: cartonW,
      carton_h_cm: cartonH,
      carton_cbm: cartonCbm,
      carton_gross_weight_kg: num(cell('carton_gross_weight_kg')),
      cartons_per_pallet: int(cell('cartons_per_pallet')),
      cartons_per_20ft: int(cell('cartons_per_20ft')),
      cartons_per_40ft: int(cell('cartons_per_40ft')),
      shipping_port: str(cell('shipping_port')) || null,
      incoterm,
      hazmat_lithium: yn(cell('hazmat_lithium')),
    });
    result.totals.accepted += 1;
  }

  if (result.totals.accepted > SOFT_ROW_LIMIT) {
    result.warnings.push(`${result.totals.accepted} rows accepted — above the ${SOFT_ROW_LIMIT}-row guideline. Large sheets are supported but quoting may take longer.`);
  }

  result.ok = result.lines.length > 0;
  return result;
}

/**
 * Real shipment CBM + weight from the vendor's carton data (Tier B).
 * Lines with carton dims use exact container math (qty → cartons → CBM /
 * gross weight); lines without fall back to the old per-unit estimate.
 *
 * @returns {{ cbm:number, weight_kg:number, exact_lines:number, estimated_lines:number }}
 */
export function computeShipmentMetrics(lines = []) {
  let cbm = 0;
  let weightKg = 0;
  let exact = 0;
  for (const l of lines) {
    const qty = l.target_qty || l.moq || 1;
    if (l.units_per_carton > 0 && l.carton_cbm > 0) {
      const cartons = Math.ceil(qty / l.units_per_carton);
      cbm += cartons * l.carton_cbm;
      // ~120 kg/CBM is a sane density fallback when gross weight is missing.
      weightKg += cartons * (l.carton_gross_weight_kg > 0 ? l.carton_gross_weight_kg : l.carton_cbm * 120);
      exact += 1;
    } else {
      cbm += qty * 0.0008;
      weightKg += qty * 0.12;
    }
  }
  return {
    cbm: Math.max(1, +cbm.toFixed(2)),
    weight_kg: Math.max(40, Math.round(weightKg)),
    exact_lines: exact,
    estimated_lines: lines.length - exact,
  };
}

/** CSV text entrypoint (kept for paste-in flows + tests). */
export function parseVendorSheetText({ text, filename = 'sheet.csv', vendorHint = '' }) {
  return parseVendorSheetRows({ rows: parseCsv(text), filename, vendorHint });
}

// ---------------------------------------------------------------------------
// Translation (PRD-18 §3)
// ---------------------------------------------------------------------------

/**
 * Translate non-English product names/descriptions to English via Claude,
 * preserving the original. Mutates + returns the same line objects.
 *
 * @returns {Promise<{ lines, translations }>}
 */
export async function translateLines(lines, { onProgress = () => {} } = {}) {
  const targets = lines.filter((l) => l.needs_translation);
  if (targets.length === 0) return { lines, translations: [] };

  onProgress({ step: 'translation', label: `Translating ${targets.length} non-English line(s)…` });
  const translations = [];
  try {
    const { data } = await ai.run('quoting/translate_lines', {
      input: {
        lines: JSON.stringify(targets.map((l) => ({
          index: l.row,
          name: l.name_original,
          description: l.description_original || '',
        }))),
      },
      source: 'vendor-sheet',
    });
    const byIndex = new Map((data?.translations || []).map((t) => [t.index, t]));
    for (const line of targets) {
      const t = byIndex.get(line.row);
      if (!t) continue;
      const en = str(t.name_en);
      const dEn = str(t.description_en);
      if (en && en !== line.name_original) {
        line.name = en;
        line.translated = true;
        translations.push({ row: line.row, original: line.name_original, english: en });
      }
      if (dEn && dEn !== (line.description_original || '')) {
        line.description = dEn;
        line.translated = true;
      }
    }
  } catch {
    // Translation is best-effort — fall back to original text.
  }
  return { lines, translations };
}

// ---------------------------------------------------------------------------
// Multi-currency normalization (PRD-22)
// ---------------------------------------------------------------------------

/**
 * Normalize every non-USD FOB price to USD via the exchange-rate client,
 * preserving the original. Mutates + returns the same line objects.
 *
 * @returns {Promise<{ lines, converted: number, stale: boolean, currencies: string[] }>}
 */
export async function convertLineCurrencies(lines, { onProgress = () => {} } = {}) {
  const foreign = lines.filter((l) => l.fob_currency && l.fob_currency !== 'USD');
  const currencies = [...new Set(foreign.map((l) => l.fob_currency))];
  if (foreign.length === 0) return { lines, converted: 0, stale: false, currencies: [] };

  onProgress({ step: 'currency', label: `Converting ${foreign.length} line(s) from ${currencies.join(', ')} → USD…` });
  let converted = 0;
  let stale = false;
  for (const line of foreign) {
    try {
      const { amount, rate, stale: s } = await convert(line.fob_original, line.fob_currency, 'USD');
      line.fob = +amount.toFixed(4);
      line.fob_usd = line.fob;
      line.fx_rate = rate;
      line.converted = true;
      stale = stale || Boolean(s);
      converted += 1;
    } catch {
      // Leave the original value; flag so the rep notices.
      line.fx_error = true;
    }
  }
  return { lines, converted, stale, currencies };
}

// ---------------------------------------------------------------------------
// Best-sheet detection (multi-sheet workbooks)
// ---------------------------------------------------------------------------

/** Score a sheet by how many canonical fields its header row maps to. */
function scoreSheet(sheet) {
  if (!sheet.rows || sheet.rows.length < 2) return -1;
  const { map, unmappedRequired } = resolveColumns(sheet.rows[0]);
  if (unmappedRequired.length > 0) return -1; // can't be the data sheet
  // Prefer more mapped columns, then more data rows.
  return Object.keys(map).length * 100000 + sheet.rows.length;
}

/** Pick the worksheet most likely to hold the product data. */
export function pickDataSheet(sheets) {
  let best = null;
  let bestScore = -Infinity;
  for (const s of sheets) {
    const score = scoreSheet(s);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  // If nothing scored (no sheet had required cols), fall back to the
  // largest sheet so the parser can surface a helpful column error.
  if (!best || bestScore < 0) {
    best = sheets.reduce((a, b) => ((b.rows?.length || 0) > (a.rows?.length || 0) ? b : a), sheets[0]);
  }
  return best;
}

// ---------------------------------------------------------------------------
// High-level ingest orchestrator (the one the UI calls)
// ---------------------------------------------------------------------------

/**
 * Full ingest pipeline for an uploaded File/Blob:
 *   read → pick data sheet → detect template version → smart column
 *   mapping (alias → fuzzy → AI) → parse rows → translate non-English.
 *
 * @param {File|Blob} file
 * @param {object} opts
 * @param {string} [opts.vendorHint]
 * @param {boolean} [opts.useAiMapping=true]   Layer-3 AI column mapping
 * @param {boolean} [opts.translate=true]      Translate non-English text
 * @param {(s:{step,label})=>void} [opts.onProgress]
 * @returns {Promise<object>} parse result enriched with { sheetName,
 *   sheetNames, templateVersion, templateOutdated, translations, aiMapped }
 */
export async function ingestVendorFile(file, {
  vendorHint = '',
  useAiMapping = true,
  translate = true,
  onProgress = () => {},
} = {}) {
  const filename = file?.name || 'sheet.csv';
  const ext = filename.split('.').pop()?.toLowerCase();
  const baseFail = (errors) => ({
    ok: false, vendor: vendorHint || filename.replace(/\.[^.]+$/, ''),
    lines: [], errors, warnings: [], totals: { rows: 0, accepted: 0, skipped: 0 },
    column_map: {}, mapping: {}, sheetName: null, sheetNames: [],
    templateVersion: null, templateOutdated: false, translations: [], aiMapped: false,
  });

  if (ext === 'xls') {
    return baseFail(['Legacy .xls (BIFF) isn\'t supported — open it in Excel and "Save As" .xlsx, or export to CSV, then re-upload.']);
  }

  // 1) Read into sheets.
  let sheets;
  let templateVersion = null;
  let templateOutdated = false;
  try {
    if (ext === 'xlsx') {
      onProgress({ step: 'parsing', label: 'Reading workbook…' });
      const wb = await readXlsxWorkbook(await file.arrayBuffer());
      sheets = wb.sheets;
      const ver = detectTemplateVersion(sheets);
      templateVersion = ver.version;
      templateOutdated = Boolean(ver.version) && !ver.isCurrent;
    } else {
      const text = await file.text();
      sheets = [{ name: 'CSV', rows: parseCsv(text) }];
    }
  } catch (err) {
    return baseFail([`Couldn't read the file (${err.message}).`]);
  }

  if (!sheets.length) return baseFail(['The file has no readable sheets.']);

  // 2) Pick the data sheet.
  const dataSheet = ext === 'xlsx' ? pickDataSheet(sheets) : sheets[0];
  if (sheets.length > 1) {
    onProgress({ step: 'parsing', label: `Using sheet "${dataSheet.name}" of ${sheets.length}.` });
  }

  // 3) Smart column mapping.
  onProgress({ step: 'columns', label: 'Mapping columns…' });
  const headers = dataSheet.rows[0] || [];
  let resolved = resolveColumns(headers);
  let aiMapped = false;
  if (useAiMapping && resolved.unmappedRequired.length > 0) {
    resolved = await resolveColumnsWithAi(headers, { onProgress });
    aiMapped = Boolean(resolved.aiUsed);
  }

  // 4) Parse rows.
  const result = parseVendorSheetRows({
    rows: dataSheet.rows, filename, vendorHint, resolved,
  });

  // 5) Normalize foreign-currency prices to USD.
  let currencyInfo = { converted: 0, stale: false, currencies: [] };
  if (result.ok) {
    currencyInfo = await convertLineCurrencies(result.lines, { onProgress });
    if (currencyInfo.converted > 0) {
      result.warnings.unshift(
        `Converted ${currencyInfo.converted} line(s) from ${currencyInfo.currencies.join(', ')} to USD`
        + (currencyInfo.stale ? ' using cached/offline FX rates — refresh before sending the quote.' : ' at live FX rates.'),
      );
    }
  }

  // 6) Translate non-English text.
  let translations = [];
  if (translate && result.ok) {
    const out = await translateLines(result.lines, { onProgress });
    translations = out.translations;
  }

  // 7) Surface template-version + sheet metadata + warnings.
  if (templateOutdated) {
    result.warnings.unshift(`This sheet is template ${templateVersion}; the current template is ${TEMPLATE_VERSION}. It parsed fine, but download the latest template to avoid surprises.`);
  }

  return {
    ...result,
    sheetName: dataSheet.name,
    sheetNames: sheets.map((s) => s.name),
    templateVersion,
    templateOutdated,
    translations,
    aiMapped,
    currencyConverted: currencyInfo.converted,
    fxStale: currencyInfo.stale,
    currencies: currencyInfo.currencies,
  };
}

/**
 * Convenience: parse a File or Blob from an <input type="file">.
 * Backwards-compatible wrapper around `ingestVendorFile` (no AI/translate
 * unless the caller opts in via `ingestVendorFile` directly).
 */
export async function parseVendorSheetFile(file, { vendorHint = '' } = {}) {
  return ingestVendorFile(file, { vendorHint, useAiMapping: false, translate: false });
}
