/**
 * Minimal XLSX reader — PRD-08 Phase 1 (vendor template upload).
 *
 * Zero dependencies: an .xlsx file is a ZIP of XML parts, and the
 * browser ships everything needed to read one —
 * `DecompressionStream('deflate-raw')` for the entries and `DOMParser`
 * for the sheet XML.
 *
 * Scope (intentionally narrow — vendor templates, not arbitrary
 * spreadsheets): first worksheet only, shared strings + inline
 * strings + numbers, no styles/dates/merged-cell semantics. Dates
 * arrive as serial numbers; templates use text columns so that's fine.
 *
 * Returns rows as string[][] in the same shape as `parseCsv`.
 */

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
  throw new Error('Not a valid .xlsx (ZIP end record missing).');
}

function readEntries(buf) {
  const view = new DataView(buf);
  const eocd = findEocd(view);
  const count = view.getUint16(eocd + 10, true);
  let off = view.getUint32(eocd + 16, true);
  const entries = new Map();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(off, true) !== CDIR_SIG) break;
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
  throw new Error(`Unsupported ZIP compression method ${method}.`);
}

async function extractXml(buf, entries, name) {
  const entry = entries.get(name);
  if (!entry) return null;
  const bytes = await extract(buf, entry);
  const xmlText = new TextDecoder().decode(bytes);
  return new DOMParser().parseFromString(xmlText, 'application/xml');
}

// ---------------------------------------------------------------------------
// Workbook parts
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

function parseSheet(doc, shared) {
  const rows = [];
  for (const rowEl of doc.querySelectorAll('row')) {
    const row = [];
    for (const c of rowEl.querySelectorAll('c')) {
      const ref = c.getAttribute('r') || '';
      const idx = ref ? colIndex(ref) : row.length;
      const type = c.getAttribute('t') || 'n';
      let value = '';
      if (type === 's') {
        const v = c.querySelector('v');
        value = shared[Number(v?.textContent)] ?? '';
      } else if (type === 'inlineStr') {
        value = textOf(c);
      } else {
        value = c.querySelector('v')?.textContent ?? '';
      }
      row[idx] = value;
    }
    // Normalize sparse arrays → empty strings.
    rows.push(Array.from(row, (v) => v ?? ''));
  }
  return rows;
}

/** First worksheet path per workbook.xml.rels (falls back to sheet1). */
async function firstSheetPath(buf, entries) {
  const wb = await extractXml(buf, entries, 'xl/workbook.xml');
  const rels = await extractXml(buf, entries, 'xl/_rels/workbook.xml.rels');
  const firstSheet = wb?.querySelector('sheet');
  const rid = firstSheet?.getAttribute('r:id') || firstSheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  if (rid && rels) {
    const rel = [...rels.querySelectorAll('Relationship')].find((r) => r.getAttribute('Id') === rid);
    const target = rel?.getAttribute('Target');
    if (target) return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  return 'xl/worksheets/sheet1.xml';
}

/**
 * Read the first worksheet of an .xlsx ArrayBuffer.
 * @returns {Promise<string[][]>} rows of cell strings
 */
export async function readXlsxRows(arrayBuffer) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser lacks DecompressionStream — export the sheet as CSV instead.');
  }
  const entries = readEntries(arrayBuffer);
  const sheetPath = await firstSheetPath(arrayBuffer, entries);
  const sheetDoc = await extractXml(arrayBuffer, entries, sheetPath);
  if (!sheetDoc) throw new Error('No worksheet found in the workbook.');
  const sharedDoc = await extractXml(arrayBuffer, entries, 'xl/sharedStrings.xml');
  const shared = parseSharedStrings(sharedDoc);
  return parseSheet(sheetDoc, shared)
    .filter((r) => r.some((cell) => String(cell).trim() !== ''));
}
