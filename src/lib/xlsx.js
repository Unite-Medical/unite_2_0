/**
 * XLSX reader — PRD-08 Phase 1 + PRD-18 (advanced parsing).
 *
 * Zero dependencies: an .xlsx file is a ZIP of XML parts, and the
 * browser ships everything needed to read one —
 * `DecompressionStream('deflate-raw')` for the entries and `DOMParser`
 * for the sheet XML.
 *
 * What it handles (PRD-18 "super robust" pass):
 *   - Every worksheet in the workbook (not just the first) with sheet
 *     names, so the parser can auto-detect the real data sheet.
 *   - Shared strings + inline strings + rich-text runs + numbers + bools.
 *   - Dates: styles.xml is parsed so date-formatted serial numbers are
 *     converted to ISO `YYYY-MM-DD` strings (1900 + 1904 epochs).
 *   - Sparse rows/cols normalized to dense string[][].
 *   - Size + row guards so a malicious or giant workbook can't OOM the tab.
 *   - Graceful, specific errors (never a raw stack) for corrupt input.
 *
 * Returns rows as string[][] in the same shape as `parseCsv`.
 */

// ---------------------------------------------------------------------------
// Limits (PRD-18 §3 "Upload size limits")
// ---------------------------------------------------------------------------

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ROWS_PER_SHEET = 5000; // generous; PRD soft-limit is 500 data rows
export const MAX_SHEETS = 64;

// ---------------------------------------------------------------------------
// ZIP container
// ---------------------------------------------------------------------------

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;

function findEocd(view) {
  // EOCD is within the last 64KB + 22 bytes of the file.
  const start = Math.max(0, view.byteLength - 65557);
  for (let i = view.byteLength - 22; i >= start; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  throw new Error('Not a valid .xlsx file (ZIP end-of-directory record missing). If this is a real spreadsheet, re-save it as .xlsx or export to CSV.');
}

function readEntries(buf) {
  const view = new DataView(buf);
  const eocd = findEocd(view);
  const count = view.getUint16(eocd + 10, true);
  let off = view.getUint32(eocd + 16, true);
  const entries = new Map();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (off + 46 > buf.byteLength || view.getUint32(off, true) !== CDIR_SIG) break;
    const method = view.getUint16(off + 10, true);
    const compSize = view.getUint32(off + 20, true);
    const nameLen = view.getUint16(off + 28, true);
    const extraLen = view.getUint16(off + 30, true);
    const commentLen = view.getUint16(off + 32, true);
    const localOff = view.getUint32(off + 42, true);
    const name = decoder.decode(new Uint8Array(buf, off + 46, nameLen));
    entries.set(name, { method, compSize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflate(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extract(buf, entry) {
  const view = new DataView(buf);
  const { method, compSize, localOff } = entry;
  // Local header: sizes of name/extra can differ from central dir.
  const nameLen = view.getUint16(localOff + 26, true);
  const extraLen = view.getUint16(localOff + 28, true);
  const dataStart = localOff + 30 + nameLen + extraLen;
  const bytes = new Uint8Array(buf, dataStart, compSize);
  if (method === 0) return bytes;
  if (method === 8) return inflate(bytes);
  throw new Error(`Unsupported ZIP compression method ${method} inside the workbook.`);
}

async function extractText(buf, entries, name) {
  const entry = entries.get(name);
  if (!entry) return null;
  const bytes = await extract(buf, entry);
  return new TextDecoder().decode(bytes);
}

async function extractXml(buf, entries, name) {
  const xmlText = await extractText(buf, entries, name);
  if (xmlText == null) return null;
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error(`Malformed XML in workbook part "${name}".`);
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Cell address helpers
// ---------------------------------------------------------------------------

/** A1 → 0, B7 → 1, AA3 → 26 ... (column index only). */
function colIndex(cellRef) {
  let n = 0;
  for (const ch of cellRef) {
    if (ch >= 'A' && ch <= 'Z') n = n * 26 + (ch.charCodeAt(0) - 64);
    else break;
  }
  return n - 1;
}

function textOf(node) {
  // Concatenate all <t> descendants (handles rich-text runs).
  return [...node.querySelectorAll('t')].map((t) => t.textContent).join('');
}

function parseSharedStrings(doc) {
  if (!doc) return [];
  return [...doc.querySelectorAll('si')].map((si) => textOf(si));
}

// ---------------------------------------------------------------------------
// Dates: styles.xml → which cell-format indexes are dates
// ---------------------------------------------------------------------------

const BUILTIN_DATE_FMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/**
 * Returns a Set of cellXfs indexes (the `s` attr on a <c>) whose number
 * format is a date/time, so we can convert their serial values.
 */
function parseDateStyles(doc) {
  const dateXfs = new Set();
  if (!doc) return dateXfs;

  // Custom numFmts: id ≥ 164. A format string containing y/m/d (and not
  // escaped) is a date. This is the same heuristic SheetJS uses.
  const customDateFmtIds = new Set();
  for (const nf of doc.querySelectorAll('numFmts > numFmt')) {
    const id = Number(nf.getAttribute('numFmtId'));
    const code = (nf.getAttribute('formatCode') || '').toLowerCase();
    const stripped = code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
    if (/[ymdhs]/.test(stripped) && /[ymd]/.test(stripped)) customDateFmtIds.add(id);
  }

  const xfs = doc.querySelectorAll('cellXfs > xf');
  xfs.forEach((xf, i) => {
    const numFmtId = Number(xf.getAttribute('numFmtId') || 0);
    if (BUILTIN_DATE_FMT_IDS.has(numFmtId) || customDateFmtIds.has(numFmtId)) {
      dateXfs.add(i);
    }
  });
  return dateXfs;
}

/** Excel serial date → ISO YYYY-MM-DD. Handles the 1900 + 1904 epochs. */
function serialToIso(serial, date1904) {
  let days = Number(serial);
  if (!Number.isFinite(days)) return String(serial);
  // Excel's 1900 leap-year bug: serials ≥ 60 are off by one.
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  if (!date1904 && days >= 60) days -= 1;
  const ms = epoch + Math.round(days) * 86400000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serial);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Worksheet parsing
// ---------------------------------------------------------------------------

function parseSheet(doc, shared, dateXfs, date1904) {
  const rows = [];
  let truncated = false;
  const rowEls = doc.querySelectorAll('row');
  for (const rowEl of rowEls) {
    if (rows.length >= MAX_ROWS_PER_SHEET) { truncated = true; break; }
    const row = [];
    for (const c of rowEl.querySelectorAll('c')) {
      const ref = c.getAttribute('r') || '';
      const idx = ref ? colIndex(ref) : row.length;
      if (idx < 0 || idx > 16383) continue; // guard against malformed refs
      const type = c.getAttribute('t') || 'n';
      const styleIdx = Number(c.getAttribute('s') || -1);
      let value = '';
      if (type === 's') {
        const v = c.querySelector('v');
        value = shared[Number(v?.textContent)] ?? '';
      } else if (type === 'inlineStr') {
        value = textOf(c);
      } else if (type === 'str') {
        value = c.querySelector('v')?.textContent ?? '';
      } else if (type === 'b') {
        value = c.querySelector('v')?.textContent === '1' ? 'TRUE' : 'FALSE';
      } else {
        const raw = c.querySelector('v')?.textContent ?? '';
        // Numeric cell — convert to ISO if it's date-formatted.
        value = (raw !== '' && dateXfs.has(styleIdx)) ? serialToIso(raw, date1904) : raw;
      }
      row[idx] = value;
    }
    // Normalize sparse arrays → empty strings.
    rows.push(Array.from(row, (v) => (v == null ? '' : v)));
  }
  return { rows: rows.filter((r) => r.some((cell) => String(cell).trim() !== '')), truncated };
}

/**
 * List every worksheet with its rels target + display name, in workbook
 * (tab) order.
 */
async function listSheets(buf, entries) {
  const wb = await extractXml(buf, entries, 'xl/workbook.xml');
  const rels = await extractXml(buf, entries, 'xl/_rels/workbook.xml.rels');
  const date1904 = wb?.querySelector('workbookPr')?.getAttribute('date1904') === '1'
    || wb?.querySelector('workbookPr')?.getAttribute('date1904') === 'true';
  const sheets = [];
  const sheetEls = [...(wb?.querySelectorAll('sheets > sheet') || [])];
  const RELS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  let fallbackN = 1;
  for (const el of sheetEls.slice(0, MAX_SHEETS)) {
    const name = el.getAttribute('name') || `Sheet${fallbackN}`;
    const rid = el.getAttribute('r:id') || el.getAttributeNS(RELS_NS, 'id');
    let target = null;
    if (rid && rels) {
      const rel = [...rels.querySelectorAll('Relationship')].find((r) => r.getAttribute('Id') === rid);
      const t = rel?.getAttribute('Target');
      if (t) target = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`;
    }
    if (!target) target = `xl/worksheets/sheet${fallbackN}.xml`;
    sheets.push({ name, target });
    fallbackN += 1;
  }
  if (sheets.length === 0) sheets.push({ name: 'Sheet1', target: 'xl/worksheets/sheet1.xml' });
  return { sheets, date1904 };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function assertReadable(arrayBuffer) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser lacks DecompressionStream — export the sheet as CSV instead.');
  }
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error('The uploaded file is empty.');
  }
  if (arrayBuffer.byteLength > MAX_FILE_BYTES) {
    throw new Error(`File is ${(arrayBuffer.byteLength / 1048576).toFixed(1)} MB — the limit is ${MAX_FILE_BYTES / 1048576} MB. Split the sheet or remove extra tabs.`);
  }
  // .xlsx files start with the local-file-header signature "PK\x03\x04".
  const sig = new Uint8Array(arrayBuffer, 0, Math.min(2, arrayBuffer.byteLength));
  if (sig[0] !== 0x50 || sig[1] !== 0x4b) {
    throw new Error('This doesn\'t look like an .xlsx file (bad ZIP signature). Legacy .xls must be re-saved as .xlsx or CSV.');
  }
}

/**
 * Read EVERY worksheet of an .xlsx ArrayBuffer.
 * @returns {Promise<{ sheets: { name, rows, truncated }[] }>}
 */
export async function readXlsxWorkbook(arrayBuffer) {
  assertReadable(arrayBuffer);
  const entries = readEntries(arrayBuffer);
  const { sheets: sheetDefs, date1904 } = await listSheets(arrayBuffer, entries);
  const sharedDoc = await extractXml(arrayBuffer, entries, 'xl/sharedStrings.xml');
  const shared = parseSharedStrings(sharedDoc);
  const stylesDoc = await extractXml(arrayBuffer, entries, 'xl/styles.xml');
  const dateXfs = parseDateStyles(stylesDoc);

  const out = [];
  for (const def of sheetDefs) {
    const doc = await extractXml(arrayBuffer, entries, def.target);
    if (!doc) continue;
    const { rows, truncated } = parseSheet(doc, shared, dateXfs, date1904);
    out.push({ name: def.name, rows, truncated });
  }
  if (out.length === 0) throw new Error('No readable worksheet found in the workbook.');
  return { sheets: out };
}

/**
 * Back-compat single-sheet reader. Returns rows from the worksheet that
 * looks most like a data sheet (most non-empty rows). Use
 * `readXlsxWorkbook` when you need every sheet + names.
 *
 * @returns {Promise<string[][]>} rows of cell strings
 */
export async function readXlsxRows(arrayBuffer) {
  const { sheets } = await readXlsxWorkbook(arrayBuffer);
  const best = sheets.reduce((a, b) => (b.rows.length > a.rows.length ? b : a), sheets[0]);
  return best.rows;
}
