/**
 * XLSX writer — PRD-18 §6 (downloadable vendor template).
 *
 * Zero dependencies, mirror image of `xlsx.js`: we hand-build the OOXML
 * parts and pack them into a ZIP using `CompressionStream('deflate-raw')`
 * (falling back to STORE when the browser lacks it). The output opens
 * cleanly in Excel, Google Sheets, and LibreOffice.
 *
 * Supported per sheet:
 *   - typed cells (string / number / boolean) with named styles
 *   - a small fixed stylesheet (header, title, text/@, subtle, sample)
 *   - column widths
 *   - frozen header row
 *   - data validations: dropdown list (range or literal), decimal/whole
 *     bounds, text format — so vendors get guided input, not free-text.
 *
 * Usage:
 *   const blob = await writeXlsx({
 *     sheets: [{ name, cols, freezeHeader, rows, validations }],
 *     creator: 'Unite Medical',
 *   });
 */

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_DOC_RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_CONTENT_TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';

// Named styles → cellXfs index (must match buildStyles()).
// headerReq/headerOpt/headerUnite are the vendor-template requirement
// colors (red = required, amber = requested, plum = Unite fills).
const STYLE_INDEX = {
  default: 0, header: 1, title: 2, text: 3, subtle: 4, sample: 5,
  headerReq: 6, headerOpt: 7, headerUnite: 8,
};

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 0 → A, 25 → Z, 26 → AA ... */
function colName(i) {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Excel sheet-name rules: ≤31 chars, no : \ / ? * [ ]. */
function safeSheetName(name, fallback) {
  let s = String(name || fallback).replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31);
  return s || fallback;
}

// ---------------------------------------------------------------------------
// Cell + worksheet XML
// ---------------------------------------------------------------------------

function cellXml(ref, cell) {
  let v = cell;
  let styleName = 'default';
  if (cell && typeof cell === 'object' && !Array.isArray(cell)) {
    v = cell.v;
    styleName = cell.s || 'default';
  }
  const s = STYLE_INDEX[styleName] ?? 0;
  const sAttr = s ? ` s="${s}"` : '';

  if (v === null || v === undefined || v === '') {
    return s ? `<c r="${ref}"${sAttr}/>` : '';
  }
  // Force string output for the text/@ style so leading zeros survive.
  if (typeof v === 'number' && Number.isFinite(v) && styleName !== 'text') {
    return `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
  }
  if (typeof v === 'boolean') {
    return `<c r="${ref}"${sAttr} t="b"><v>${v ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

function validationXml(v) {
  const attrs = [`type="${v.type}"`];
  if (v.operator) attrs.push(`operator="${v.operator}"`);
  attrs.push('allowBlank="1"', 'showInputMessage="1"', 'showErrorMessage="1"');
  if (v.errorTitle) attrs.push(`errorTitle="${esc(v.errorTitle)}"`);
  if (v.error) attrs.push(`error="${esc(v.error)}"`);
  if (v.promptTitle) attrs.push(`promptTitle="${esc(v.promptTitle)}"`);
  if (v.prompt) attrs.push(`prompt="${esc(v.prompt)}"`);
  attrs.push(`sqref="${v.sqref}"`);
  let inner = '';
  if (v.formula1 != null) inner += `<formula1>${esc(v.formula1)}</formula1>`;
  if (v.formula2 != null) inner += `<formula2>${esc(v.formula2)}</formula2>`;
  return `<dataValidation ${attrs.join(' ')}>${inner}</dataValidation>`;
}

function sheetXml(sheet) {
  const rows = sheet.rows || [];
  const nCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const nRows = rows.length;
  const dim = nRows ? `A1:${colName(Math.max(0, nCols - 1))}${nRows}` : 'A1';

  let body = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  body += `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_DOC_RELS}">`;
  body += `<dimension ref="${dim}"/>`;

  if (sheet.freezeHeader) {
    body += '<sheetViews><sheetView workbookViewId="0">'
      + '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
      + '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
      + '</sheetView></sheetViews>';
  }

  if (sheet.cols?.length) {
    body += '<cols>';
    sheet.cols.forEach((c, i) => {
      const w = c?.width || 14;
      body += `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    });
    body += '</cols>';
  }

  body += '<sheetData>';
  rows.forEach((row, r) => {
    const cells = row.map((cell, c) => cellXml(`${colName(c)}${r + 1}`, cell)).join('');
    body += `<row r="${r + 1}">${cells}</row>`;
  });
  body += '</sheetData>';

  if (sheet.validations?.length) {
    body += `<dataValidations count="${sheet.validations.length}">`;
    body += sheet.validations.map(validationXml).join('');
    body += '</dataValidations>';
  }

  body += '</worksheet>';
  return body;
}

// ---------------------------------------------------------------------------
// Fixed stylesheet
// ---------------------------------------------------------------------------

function buildStyles() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<styleSheet xmlns="${NS_MAIN}">`
    + '<fonts count="5">'
    + '<font><sz val="11"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="11"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="16"/><name val="Calibri"/></font>'
    + '<font><i/><sz val="11"/><color rgb="FF6B7280"/><name val="Calibri"/></font>'
    + '</fonts>'
    + '<fills count="7">'
    + '<fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF5B2A4A"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFF5EFF3"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFB8502C"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFE0A54A"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF5E2963"/><bgColor indexed="64"/></patternFill></fill>'
    + '</fills>'
    + '<borders count="2">'
    + '<border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border><left/><right/><top/><bottom style="thin"><color rgb="FFBFA8B8"/></bottom><diagonal/></border>'
    + '</borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="9">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>'
    + '<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';
}

// ---------------------------------------------------------------------------
// Package assembly
// ---------------------------------------------------------------------------

function buildContentTypes(sheetCount) {
  let overrides = '';
  for (let i = 1; i <= sheetCount; i++) {
    overrides += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<Types xmlns="${NS_CONTENT_TYPES}">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + overrides
    + '</Types>';
}

function buildRootRels() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<Relationships xmlns="${NS_PKG_RELS}">`
    + `<Relationship Id="rId1" Type="${NS_DOC_RELS}/officeDocument" Target="xl/workbook.xml"/>`
    + '</Relationships>';
}

function buildWorkbook(sheets) {
  let s = '';
  sheets.forEach((sheet, i) => {
    s += `<sheet name="${esc(safeSheetName(sheet.name, `Sheet${i + 1}`))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`;
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_DOC_RELS}"><sheets>${s}</sheets></workbook>`;
}

function buildWorkbookRels(sheetCount) {
  let rels = '';
  for (let i = 1; i <= sheetCount; i++) {
    rels += `<Relationship Id="rId${i}" Type="${NS_DOC_RELS}/worksheet" Target="worksheets/sheet${i}.xml"/>`;
  }
  rels += `<Relationship Id="rId${sheetCount + 1}" Type="${NS_DOC_RELS}/styles" Target="styles.xml"/>`;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<Relationships xmlns="${NS_PKG_RELS}">${rels}</Relationships>`;
}

// ---------------------------------------------------------------------------
// ZIP writer (deflate-raw when available, else store)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes) {
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function zip(files) {
  const enc = new TextEncoder();
  const canDeflate = typeof CompressionStream !== 'undefined';
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const uncompSize = data.length;

    let method = 0;
    let comp = data;
    if (canDeflate && uncompSize > 0) {
      try {
        const d = await deflateRaw(data);
        if (d.length < uncompSize) { comp = d; method = 8; }
      } catch { /* keep STORE */ }
    }
    const compSize = comp.length;

    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filenames
    lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true); // time
    lv.setUint16(12, 0x21, true); // date 1980-01-01
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compSize, true);
    lv.setUint32(22, uncompSize, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);
    chunks.push(lh, comp);

    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compSize, true);
    cv.setUint32(24, uncompSize, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);
    central.push(ch);

    offset += lh.length + comp.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) { chunks.push(c); centralSize += c.length; offset += c.length; }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  chunks.push(eocd);

  return new Blob(chunks, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an .xlsx Blob from a sheet spec.
 * @param {{ sheets: object[], creator?: string }} spec
 * @returns {Promise<Blob>}
 */
export async function writeXlsx({ sheets = [] } = {}) {
  if (!sheets.length) throw new Error('writeXlsx: at least one sheet is required.');

  const files = [
    { name: '[Content_Types].xml', data: buildContentTypes(sheets.length) },
    { name: '_rels/.rels', data: buildRootRels() },
    { name: 'xl/workbook.xml', data: buildWorkbook(sheets) },
    { name: 'xl/_rels/workbook.xml.rels', data: buildWorkbookRels(sheets.length) },
    { name: 'xl/styles.xml', data: buildStyles() },
  ];
  sheets.forEach((sheet, i) => {
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheet) });
  });

  return zip(files);
}

/** Trigger a browser download for a Blob. No-op outside the browser. */
export function downloadBlob(blob, filename) {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
