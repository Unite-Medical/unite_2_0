export function parsePoCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted cell.');
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
export function poLinesFromRows(rows) {
  const headers = (rows[0] || []).map(value => String(value).trim().toLowerCase());
  for (const field of ['sku', 'description', 'quantity', 'unit_cost']) if (!headers.includes(field)) throw new Error(`Missing column: ${field}`);
  if (rows.length > 201) throw new Error('Import at most 200 lines per PO.');
  const get = (row, field) => String(row[headers.indexOf(field)] ?? '').trim();
  return rows.slice(1).filter(row => row.some(v => String(v ?? '').trim())).map(row => {
    const qty = get(row, 'quantity'), cost = get(row, 'unit_cost');
    if (!qty || !cost || !Number.isFinite(Number(qty)) || !Number.isFinite(Number(cost)) || Number(qty) <= 0 || Number(cost) < 0) throw new Error('Quantity and unit_cost must be valid numbers.');
    return { sku: get(row, 'sku'), name: get(row, 'description'), qty: Number(qty), cost: Number(cost), qbo_item_id: get(row, 'qbo_item_id') };
  });
}
export async function readPoFile(file) {
  if (file.size > 2 * 1024 * 1024) throw new Error('Use a file smaller than 2 MB.');
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') return { line_items: poLinesFromRows(parsePoCsv(await file.text())) };
  if (ext === 'xlsx') {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount > 201 || sheet.columnCount > 40) throw new Error('Use one sheet with up to 200 lines and 40 columns.');
    const rows = []; sheet.eachRow(row => {
      const cells = []; for (let i = 1; i <= sheet.columnCount; i++) {
        const cell = row.getCell(i);
        if (cell.formula) throw new Error('Replace formulas with their values before import.');
        cells.push(cell.text);
      } rows.push(cells);
    });
    return { line_items: poLinesFromRows(rows) };
  }
  if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
    let doc;
    try {
      doc = await loading.promise;
      if (doc.numPages > 20) throw new Error('Use a PDF with no more than 20 pages.');
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i), content = await page.getTextContent();
        pages.push(content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join(''));
      }
      const source_text = pages.join('\n\n').trim();
      if (!source_text) throw new Error('This PDF is scanned. Use a searchable PDF, CSV/XLSX, or enter its lines manually.');
      if (source_text.length > 60000) throw new Error('PDF text exceeds the import limit.');
      return { source_text };
    } finally { await loading.destroy(); }
  }
  throw new Error('Choose a CSV, XLSX, or searchable PDF.');
}
