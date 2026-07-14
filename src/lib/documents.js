/**
 * Document pipeline — PRD-17.
 *
 * Branded PDF templates for every document Unite Medical produces:
 * quote, invoice, purchase order, packing slip, compliance certificate.
 * Built on the zero-dep PDF engine (`pdf.js`). Each generator returns a
 * Blob; `generateDocument()` also records the artifact in the
 * `documents` table (with version tracking) so the admin + portal can
 * list and re-download them. R2 storage + signed URLs land when the
 * bucket is provisioned (PRD-17 Phase 2) — the record carries a
 * `storage_url` that's a local object URL until then.
 */

import { db } from './db.js';
import { uid } from './format.js';
import { createPdf, downloadPdf } from './pdf.js';

// Brand palette (0..1 RGB) — mirrors the web tokens.
const INK = [0.10, 0.10, 0.18];
const PLUM = [0.357, 0.165, 0.290];
const GREY = [0.42, 0.45, 0.50];
const LINE = [0.80, 0.78, 0.82];
const LIGHT = [0.96, 0.94, 0.95];
const GREEN = [0.12, 0.48, 0.30];

const MARGIN = 54;
const FOOTER_TEXT = 'Unite Medical · Lithia Springs, GA · FDA Reg. #3015727296 · Veteran-owned';

function money(n) {
  return `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function dateStr(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function header(doc, { title, docId, sub }) {
  const right = doc.pageWidth - MARGIN;
  doc.text(MARGIN, MARGIN, 'UNITE MEDICAL', { size: 18, bold: true, color: PLUM });
  doc.text(MARGIN, MARGIN + 20, 'Medical supply distribution & global sourcing', { size: 8.5, color: GREY });
  doc.text(right, MARGIN, title, { size: 14, bold: true, color: INK, align: 'right' });
  if (docId) doc.text(right, MARGIN + 18, docId, { size: 10, color: GREY, align: 'right' });
  if (sub) doc.text(right, MARGIN + 32, sub, { size: 9, color: GREY, align: 'right' });
  doc.line(MARGIN, MARGIN + 48, right, MARGIN + 48, { color: LINE });
  return MARGIN + 64;
}

function footer(doc, pageNum) {
  const y = doc.pageHeight - 38;
  doc.line(MARGIN, y, doc.pageWidth - MARGIN, y, { color: LINE });
  doc.text(MARGIN, y + 6, FOOTER_TEXT, { size: 7.5, color: GREY });
  doc.text(doc.pageWidth - MARGIN, y + 6, `Page ${pageNum}`, { size: 7.5, color: GREY, align: 'right' });
}

/**
 * Render a paginated table. columns: [{ key, label, width, align, bold }].
 * Returns the y after the table (on the final page). Calls onNewPage to
 * re-draw header/footer.
 */
function table(doc, startY, columns, rows, { onNewPage }) {
  const left = MARGIN;
  const right = doc.pageWidth - MARGIN;
  const totalW = columns.reduce((a, c) => a + c.width, 0);
  const scale = (right - left) / totalW;
  const xs = [];
  let acc = left;
  for (const c of columns) { xs.push(acc); acc += c.width * scale; }
  const rowH = 18;
  const bottomLimit = doc.pageHeight - 60;

  let y = startY;
  const drawHead = () => {
    doc.rect(left, y, right - left, rowH, { fill: PLUM });
    columns.forEach((c, i) => {
      const cx = c.align === 'right' ? xs[i] + c.width * scale - 4 : xs[i] + 4;
      doc.text(cx, y + 5, c.label, { size: 8, bold: true, color: [1, 1, 1], align: c.align || 'left' });
    });
    y += rowH;
  };
  drawHead();

  rows.forEach((row, idx) => {
    if (y + rowH > bottomLimit) {
      y = onNewPage();
      drawHead();
    }
    if (idx % 2 === 1) doc.rect(left, y, right - left, rowH, { fill: LIGHT });
    columns.forEach((c, i) => {
      const raw = typeof c.value === 'function' ? c.value(row) : row[c.key];
      const cx = c.align === 'right' ? xs[i] + c.width * scale - 4 : xs[i] + 4;
      doc.text(cx, y + 5, raw == null ? '' : String(raw), {
        size: 8.5, bold: c.bold, color: INK, align: c.align || 'left',
        maxWidth: c.width * scale - 8,
      });
    });
    y += rowH;
  });
  doc.line(left, y, right, y, { color: LINE });
  return y;
}

// ---------------------------------------------------------------------------
// Quote PDF
// ---------------------------------------------------------------------------

export function buildQuotePdf(quote, items, { view = 'customer' } = {}) {
  const isInternal = view === 'internal';
  const doc = createPdf();
  let page = 1;
  const newPage = () => { footer(doc, page); page += 1; doc.addPage(); return header(doc, { title: 'QUOTE', docId: quote.id, sub: dateStr(quote.created_at) }); };
  let y = header(doc, { title: 'QUOTE', docId: quote.id, sub: dateStr(quote.created_at) });

  // Bill-to + meta
  doc.text(MARGIN, y, 'PREPARED FOR', { size: 8, bold: true, color: GREY });
  doc.text(MARGIN, y + 12, quote.customer_name || '—', { size: 12, bold: true, color: INK });
  if (quote.contact_name) doc.text(MARGIN, y + 28, `Attn: ${quote.contact_name}`, { size: 9.5, color: GREY });
  const right = doc.pageWidth - MARGIN;
  doc.text(right, y, `Valid until ${dateStr(quote.valid_until)}`, { size: 9, color: GREY, align: 'right' });
  doc.text(right, y + 14, `Est. delivery ${dateStr(quote.eta)}`, { size: 9, color: GREY, align: 'right' });
  if (isInternal) doc.text(right, y + 28, `Tier ${quote.customer_tier || 'C'} · ${quote.freight_mode || 'LCL'}`, { size: 9, color: PLUM, align: 'right' });
  y += 48;

  // Cover letter
  if (quote.cover_letter) {
    const lines = doc.text(MARGIN, y, quote.cover_letter, { size: 9.5, color: INK, maxWidth: right - MARGIN, lineHeight: 13 });
    y += lines * 13 + 16;
  }

  // Line items
  const columns = isInternal
    ? [
      { key: 'name', label: 'PRODUCT', width: 150 },
      { key: 'fda_product_code', label: 'FDA', width: 36 },
      { key: 'hts', label: 'HTS', width: 50 },
      { label: 'QTY', width: 40, align: 'right', value: (r) => (r.target_qty || r.moq || 1).toLocaleString() },
      { label: 'DUTY', width: 38, align: 'right', value: (r) => `${(Number(r.duty_pct) || 0).toFixed(1)}%` },
      { label: 'LANDED', width: 50, align: 'right', value: (r) => money(r.landed_per_unit) },
      { label: 'UNIT', width: 48, align: 'right', value: (r) => money(r.sell_per_unit) },
      { label: 'EXT', width: 60, align: 'right', bold: true, value: (r) => money(r.ext_sell) },
    ]
    : [
      { key: 'name', label: 'PRODUCT', width: 210 },
      { key: 'hts', label: 'HTS', width: 60 },
      { label: 'QTY', width: 60, align: 'right', value: (r) => (r.target_qty || r.moq || 1).toLocaleString() },
      { label: 'UNIT PRICE', width: 70, align: 'right', value: (r) => money(r.sell_per_unit) },
      { label: 'EXTENDED', width: 80, align: 'right', bold: true, value: (r) => money(r.ext_sell) },
    ];
  y = table(doc, y, columns, items, { onNewPage: newPage }) + 8;

  // Totals
  const total = items.reduce((a, b) => a + (Number(b.ext_sell) || 0), 0);
  doc.text(right - 160, y, 'TOTAL (FOB Georgia)', { size: 9, bold: true, color: GREY });
  doc.text(right, y, money(total), { size: 13, bold: true, color: PLUM, align: 'right' });
  y += 28;

  if (isInternal) {
    const landed = items.reduce((a, b) => a + (Number(b.landed_per_unit) || 0) * (b.target_qty || b.moq || 1), 0);
    doc.text(right - 160, y, 'Total landed cost', { size: 8.5, color: GREY });
    doc.text(right, y, money(landed), { size: 9, color: GREY, align: 'right' });
    doc.text(right - 160, y + 13, 'Gross margin', { size: 8.5, color: GREY });
    doc.text(right, y + 13, `${total > 0 ? Math.round((1 - landed / total) * 100) : 0}%`, { size: 9, color: GREEN, align: 'right' });
    y += 34;
  }

  // Terms
  doc.text(MARGIN, y, 'TERMS', { size: 8, bold: true, color: GREY });
  doc.text(MARGIN, y + 12, [
    `This quote is valid until ${dateStr(quote.valid_until)}. Pricing is FOB Georgia and reflects current USITC duty rates and freight.`,
    'Every line was validated against the FDA device database. Lead times begin on order confirmation.',
    'To accept, reply to this quote or click the acceptance link in the accompanying email.',
  ].join(' '), { size: 8.5, color: GREY, maxWidth: right - MARGIN, lineHeight: 12 });

  footer(doc, page);
  return doc.toBlob();
}

// ---------------------------------------------------------------------------
// Invoice PDF
// ---------------------------------------------------------------------------

export function buildInvoicePdf(invoice, order, items) {
  const doc = createPdf();
  let page = 1;
  const newPage = () => { footer(doc, page); page += 1; doc.addPage(); return header(doc, { title: 'INVOICE', docId: invoice.id }); };
  let y = header(doc, { title: 'INVOICE', docId: invoice.id, sub: dateStr(invoice.created_at) });
  const right = doc.pageWidth - MARGIN;

  doc.text(MARGIN, y, 'BILL TO', { size: 8, bold: true, color: GREY });
  doc.text(MARGIN, y + 12, order?.customer_name || invoice.customer_id || '—', { size: 12, bold: true, color: INK });
  doc.text(right, y, `Order ${order?.id || invoice.order_id || '—'}`, { size: 9, color: GREY, align: 'right' });
  doc.text(right, y + 14, `Terms: ${invoice.terms || 'net30'}`, { size: 9, color: GREY, align: 'right' });
  doc.text(right, y + 28, `Due ${dateStr(invoice.due_date)}`, { size: 9, color: PLUM, align: 'right' });
  y += 48;

  const rows = items?.length ? items : [];
  const columns = [
    { key: 'name', label: 'ITEM', width: 250 },
    { label: 'QTY', width: 60, align: 'right', value: (r) => (r.qty || 0).toLocaleString() },
    { label: 'UNIT', width: 70, align: 'right', value: (r) => money(r.unit_price) },
    { label: 'AMOUNT', width: 80, align: 'right', bold: true, value: (r) => money(r.ext_price ?? r.qty * r.unit_price) },
  ];
  y = table(doc, y, columns, rows, { onNewPage: newPage }) + 10;

  const total = invoice.amount ?? rows.reduce((a, b) => a + (b.ext_price ?? b.qty * b.unit_price), 0);
  doc.text(right - 160, y, 'AMOUNT DUE', { size: 9, bold: true, color: GREY });
  doc.text(right, y, money(total), { size: 14, bold: true, color: PLUM, align: 'right' });
  y += 30;
  doc.text(MARGIN, y, `Status: ${(invoice.status || 'open').toUpperCase()}. Remit per terms above. Questions: ar@unitemedical.net`, { size: 8.5, color: GREY });

  footer(doc, page);
  return doc.toBlob();
}

// ---------------------------------------------------------------------------
// Purchase order PDF
// ---------------------------------------------------------------------------

export function buildPurchaseOrderPdf(po, lines) {
  const doc = createPdf();
  let page = 1;
  const newPage = () => { footer(doc, page); page += 1; doc.addPage(); return header(doc, { title: 'PURCHASE ORDER', docId: po.id }); };
  let y = header(doc, { title: 'PURCHASE ORDER', docId: po.id, sub: dateStr(po.created_at) });
  const right = doc.pageWidth - MARGIN;

  doc.text(MARGIN, y, 'VENDOR', { size: 8, bold: true, color: GREY });
  doc.text(MARGIN, y + 12, po.vendor_name || po.vendor || '—', { size: 12, bold: true, color: INK });
  doc.text(right, y, `Ship to: Unite Medical (Lithia Springs, GA)`, { size: 9, color: GREY, align: 'right' });
  if (po.eta) doc.text(right, y + 14, `Need by ${dateStr(po.eta)}`, { size: 9, color: GREY, align: 'right' });
  y += 44;

  const rows = lines?.length ? lines : [];
  const columns = [
    { key: 'name', label: 'PRODUCT', width: 240 },
    { label: 'QTY', width: 70, align: 'right', value: (r) => (r.qty || 0).toLocaleString() },
    { label: 'UNIT FOB', width: 70, align: 'right', value: (r) => money(r.unit_cost ?? r.fob) },
    { label: 'EXT', width: 80, align: 'right', bold: true, value: (r) => money((r.qty || 0) * (r.unit_cost ?? r.fob ?? 0)) },
  ];
  y = table(doc, y, columns, rows, { onNewPage: newPage }) + 10;

  const total = rows.reduce((a, b) => a + (b.qty || 0) * (b.unit_cost ?? b.fob ?? 0), 0);
  doc.text(right - 160, y, 'PO TOTAL', { size: 9, bold: true, color: GREY });
  doc.text(right, y, money(po.total ?? total), { size: 13, bold: true, color: PLUM, align: 'right' });

  footer(doc, page);
  return doc.toBlob();
}

// ---------------------------------------------------------------------------
// Packing slip PDF (with lot numbers + scannable checklist)
// ---------------------------------------------------------------------------

export function buildPackingSlipPdf(order, items, shipment) {
  const doc = createPdf();
  let page = 1;
  const newPage = () => { footer(doc, page); page += 1; doc.addPage(); return header(doc, { title: 'PACKING SLIP', docId: order.id }); };
  let y = header(doc, { title: 'PACKING SLIP', docId: order.id, sub: dateStr(order.placed_at || order.created_at) });
  const right = doc.pageWidth - MARGIN;

  doc.text(MARGIN, y, 'SHIP TO', { size: 8, bold: true, color: GREY });
  doc.text(MARGIN, y + 12, order.customer_name || '—', { size: 12, bold: true, color: INK });
  if (shipment) {
    doc.text(right, y, `${shipment.carrier || ''} ${shipment.tracking_number || ''}`.trim(), { size: 9, color: PLUM, align: 'right' });
    doc.text(right, y + 14, `Warehouse: ${shipment.warehouse_id || order.ship_from_warehouse || '—'}`, { size: 9, color: GREY, align: 'right' });
  }
  y += 44;

  const columns = [
    { label: '✓', width: 24, value: () => '[  ]' },
    { key: 'name', label: 'ITEM', width: 230 },
    { key: 'sku', label: 'SKU', width: 90 },
    { label: 'LOT', width: 80, value: (r) => r.lot_number || '__________' },
    { label: 'QTY', width: 50, align: 'right', value: (r) => (r.qty || 0).toLocaleString() },
  ];
  y = table(doc, y, columns, items || [], { onNewPage: newPage }) + 14;
  doc.text(MARGIN, y, 'Scan each lot number at pack-out. Packing slip is the warehouse pick checklist; carrier label ships separately.', { size: 8.5, color: GREY, maxWidth: right - MARGIN });

  footer(doc, page);
  return doc.toBlob();
}

// ---------------------------------------------------------------------------
// Compliance certificate PDF
// ---------------------------------------------------------------------------

export function buildComplianceCertPdf(product, compliance = {}) {
  const doc = createPdf();
  const y0 = header(doc, { title: 'COMPLIANCE CERTIFICATE', docId: product.sku || product.id, sub: dateStr(Date.now()) });
  const right = doc.pageWidth - MARGIN;
  let y = y0;

  doc.text(MARGIN, y, product.name || '—', { size: 14, bold: true, color: INK, maxWidth: right - MARGIN });
  y += 26;

  const rows = [
    ['FDA Status', compliance.fda_status || (product.fda_product_code ? `Product code ${product.fda_product_code}` : 'On file')],
    ['Device Class', compliance.device_class || product.device_class || 'II'],
    ['Regulation #', compliance.regulation_number || '—'],
    ['GUDID / GTIN', compliance.gtin || product.gtin || '—'],
    ['Quality System', compliance.quality_system || 'ISO 13485 (vendor-attested)'],
    ['Product Testing', compliance.product_testing || 'Per applicable ASTM / ISO standards'],
    ['Certifications', compliance.certifications || 'PDAC / TAA as applicable'],
    ['Country of Origin', compliance.country_of_origin || product.country_of_origin || '—'],
  ];
  const columns = [
    { label: 'CATEGORY', width: 160, bold: true, value: (r) => r[0] },
    { label: 'STATUS', width: 380, value: (r) => r[1] },
  ];
  y = table(doc, y, columns, rows, { onNewPage: () => y0 }) + 18;

  doc.text(MARGIN, y, 'This certificate summarizes compliance evidence on file at Unite Medical. It is provided for customer due-diligence and does not replace the manufacturer\'s regulatory filings. Verify current FDA registration before customs submission.', {
    size: 8.5, color: GREY, maxWidth: right - MARGIN, lineHeight: 12,
  });
  footer(doc, 1);
  return doc.toBlob();
}

// ---------------------------------------------------------------------------
// Orchestration: build + record + download
// ---------------------------------------------------------------------------

const BUILDERS = {
  quote: ({ ref_id, view }) => {
    const quote = db.get('quotes', ref_id);
    if (!quote) throw new Error(`Quote ${ref_id} not found`);
    const items = db.list('quote_items', { where: { quote_id: ref_id } });
    return { blob: buildQuotePdf(quote, items, { view }), meta: { customer_name: quote.customer_name, total: quote.total, line_count: items.length } };
  },
  invoice: ({ ref_id }) => {
    const invoice = db.get('invoices', ref_id);
    if (!invoice) throw new Error(`Invoice ${ref_id} not found`);
    const order = invoice.order_id ? db.get('orders', invoice.order_id) : null;
    const items = order ? db.list('order_items', { where: { order_id: order.id } }) : [];
    return { blob: buildInvoicePdf(invoice, order, items), meta: { amount: invoice.amount, order_id: invoice.order_id } };
  },
  purchase_order: ({ ref_id }) => {
    const po = db.get('purchase_orders', ref_id);
    if (!po) throw new Error(`PO ${ref_id} not found`);
    return { blob: buildPurchaseOrderPdf(po, po.lines || []), meta: { vendor: po.vendor_name || po.vendor, total: po.total } };
  },
  packing_slip: ({ ref_id }) => {
    const order = db.get('orders', ref_id);
    if (!order) throw new Error(`Order ${ref_id} not found`);
    const items = db.list('order_items', { where: { order_id: ref_id } });
    const shipment = db.list('shipments', { where: { order_id: ref_id } })[0] || null;
    return { blob: buildPackingSlipPdf(order, items, shipment), meta: { customer_name: order.customer_name } };
  },
  compliance_cert: ({ ref_id }) => {
    const product = db.get('products', ref_id);
    if (!product) throw new Error(`Product ${ref_id} not found`);
    const compliance = db.list('product_compliance', { where: { sku: product.sku } })[0] || {};
    return { blob: buildComplianceCertPdf(product, compliance), meta: { sku: product.sku } };
  },
};

/**
 * Generate a document, record it in the `documents` table (versioned),
 * and return { record, blob }. Pass download:true to also trigger a
 * browser download.
 */
export function generateDocument({ type, ref_id, ref_type, view, download = false }) {
  const builder = BUILDERS[type];
  if (!builder) throw new Error(`Unknown document type: ${type}`);
  const { blob, meta } = builder({ ref_id, view });

  const prior = db.list('documents', { where: { document_type: type, ref_id } });
  const version = prior.length + 1;
  const storageKey = `${type}/${ref_id}/${ref_id}-v${version}.pdf`;
  const url = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(blob) : null;

  const record = db.insert('documents', {
    id: uid('doc'),
    document_type: type,
    ref_type: ref_type || type,
    ref_id,
    version,
    storage_key: storageKey,
    storage_url: url,
    file_size_bytes: blob.size,
    metadata: meta || {},
  });

  if (download) downloadPdf(blob, `${ref_id}-${type}-v${version}.pdf`);
  return { record, blob };
}

export { downloadPdf };
