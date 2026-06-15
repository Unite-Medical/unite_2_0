/**
 * Minimal PDF generator — PRD-17 (document pipeline).
 *
 * Zero dependencies, same philosophy as the XLSX writer: hand-build a
 * valid PDF 1.4 file. Uses the two standard-14 fonts (Helvetica +
 * Helvetica-Bold) so nothing has to be embedded. Supports multiple
 * pages, text (with wrapping + alignment), lines, and filled/stroked
 * rectangles — enough for branded quotes, invoices, POs, packing slips,
 * and compliance certificates.
 *
 * Coordinates are top-left origin (y grows downward); we convert to
 * PDF's bottom-left space internally.
 *
 * Usage:
 *   const doc = createPdf();
 *   doc.text(54, 54, 'Hello', { size: 18, bold: true });
 *   doc.line(54, 80, 558, 80);
 *   doc.addPage();
 *   const blob = doc.toBlob();
 */

export const LETTER = { w: 612, h: 792 };

// Helvetica AFM advance widths (units / 1000 em) for WinAnsi codes
// 32..126. Good enough for accurate wrapping + right/center alignment.
const HELV_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELV_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

function charWidth(code, bold) {
  const table = bold ? HELV_BOLD_WIDTHS : HELV_WIDTHS;
  if (code < 32 || code > 126) return table[0]; // unknown → space-ish
  return table[code - 32];
}

/** Width of a string at a given font size (points). */
export function textWidth(str, size, bold = false) {
  let w = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) w += charWidth(s.charCodeAt(i), bold);
  return (w / 1000) * size;
}

/** Escape + ASCII-fold a string for a PDF literal. */
function pdfString(str) {
  let out = '';
  const s = String(str == null ? '' : str);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const ch = s[i];
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (code >= 32 && code <= 126) out += ch;
    else if (ch === '\n') out += ' ';
    else out += '?'; // non-WinAnsi (e.g. CJK) — fold so text stays valid
  }
  return out;
}

/** Greedy word-wrap to a max width. Returns an array of lines. */
export function wrapText(str, maxWidth, size, bold = false) {
  const words = String(str).replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (textWidth(trial, size, bold) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function fmtNum(n) {
  // Compact, deterministic number formatting for PDF operators.
  return (Math.round(n * 1000) / 1000).toString();
}

export function createPdf({ size = LETTER } = {}) {
  const pageW = size.w;
  const pageH = size.h;
  const pages = [];
  let ops = [];

  const api = {
    pageWidth: pageW,
    pageHeight: pageH,

    addPage() {
      pages.push(ops);
      ops = [];
      return api;
    },

    /** Draw text. y is the text baseline-ish top; we offset by size. */
    text(x, y, str, opts = {}) {
      const { size: fs = 11, bold = false, color = [0, 0, 0], align = 'left', maxWidth } = opts;
      const lines = maxWidth ? wrapText(str, maxWidth, fs, bold) : [String(str)];
      const lineHeight = opts.lineHeight || fs * 1.3;
      lines.forEach((ln, i) => {
        const lineY = y + fs + i * lineHeight; // top-anchored
        let lx = x;
        if (align !== 'left') {
          const w = textWidth(ln, fs, bold);
          if (align === 'right') lx = x - w;
          else if (align === 'center') lx = x - w / 2;
        }
        const py = pageH - lineY;
        ops.push(
          `BT /${bold ? 'F2' : 'F1'} ${fmtNum(fs)} Tf `
          + `${fmtNum(color[0])} ${fmtNum(color[1])} ${fmtNum(color[2])} rg `
          + `1 0 0 1 ${fmtNum(lx)} ${fmtNum(py)} Tm (${pdfString(ln)}) Tj ET`,
        );
      });
      return lines.length;
    },

    line(x1, y1, x2, y2, opts = {}) {
      const { width = 0.75, color = [0, 0, 0] } = opts;
      ops.push(
        `${fmtNum(color[0])} ${fmtNum(color[1])} ${fmtNum(color[2])} RG `
        + `${fmtNum(width)} w ${fmtNum(x1)} ${fmtNum(pageH - y1)} m ${fmtNum(x2)} ${fmtNum(pageH - y2)} l S`,
      );
      return api;
    },

    rect(x, y, w, h, opts = {}) {
      const { fill, stroke, lineWidth = 0.75 } = opts;
      const py = pageH - y - h;
      let op = '';
      if (fill) op += `${fmtNum(fill[0])} ${fmtNum(fill[1])} ${fmtNum(fill[2])} rg `;
      if (stroke) op += `${fmtNum(stroke[0])} ${fmtNum(stroke[1])} ${fmtNum(stroke[2])} RG ${fmtNum(lineWidth)} w `;
      op += `${fmtNum(x)} ${fmtNum(py)} ${fmtNum(w)} ${fmtNum(h)} re `;
      op += fill && stroke ? 'B' : fill ? 'f' : 'S';
      ops.push(op);
      return api;
    },

    toBytes() {
      if (ops.length) api.addPage();
      const objects = [];
      const add = (body) => { objects.push(body); return objects.length; };

      // Reserve catalog(1) + pages(2) + fonts(3,4); page/content objs follow.
      const catalogId = 1;
      const pagesId = 2;
      const fontRegularId = 3;
      const fontBoldId = 4;
      objects.push(null, null, null, null); // placeholders for 1..4

      const pageIds = [];
      pages.forEach((pageOps) => {
        const content = pageOps.join('\n');
        const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
        const pageId = add(
          `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] `
          + `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> `
          + `/Contents ${contentId} 0 R >>`,
        );
        pageIds.push(pageId);
      });

      objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
      objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
      objects[fontRegularId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
      objects[fontBoldId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

      let pdf = '%PDF-1.4\n';
      const offsets = [];
      objects.forEach((body, i) => {
        offsets[i] = pdf.length;
        pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
      });
      const xrefStart = pdf.length;
      pdf += `xref\n0 ${objects.length + 1}\n`;
      pdf += '0000000000 65535 f \n';
      offsets.forEach((off) => { pdf += `${String(off).padStart(10, '0')} 00000 n \n`; });
      pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
      pdf += `startxref\n${xrefStart}\n%%EOF`;

      const bytes = new Uint8Array(pdf.length);
      for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
      return bytes;
    },

    toBlob() {
      return new Blob([api.toBytes()], { type: 'application/pdf' });
    },
  };

  return api;
}

/** Trigger a browser download for a Blob. No-op outside the browser. */
export function downloadPdf(blob, filename) {
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
