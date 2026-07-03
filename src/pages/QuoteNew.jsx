/**
 * /quote/new — PRD-08 Phase 1 + 7, PRD-18 (advanced parsing).
 *
 * The "real" entry point to the quoting engine:
 *   1. Download the branded Excel/CSV template (data validation built in).
 *   2. Upload CSV or XLSX (multi-sheet, multilingual headers, non-English
 *      product names) → smart column mapping → translation → preview.
 *   3. Run the engine into the landed-cost quote at /quotes/:id/print.
 *
 * Column mapping is layered (alias → fuzzy → Claude) and shown to the
 * user for confirmation; non-English text is translated with the original
 * preserved. Downstream calls real openFDA + USITC HTS + Flexport +
 * Claude (when configured).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { ingestVendorFile, parseVendorSheetText, CANONICAL_FIELDS } from '../lib/vendorSheet.js';
import { runQuotingEngine } from '../lib/quoting.js';
import { generateTemplateXlsx, generateTemplateCsv, TEMPLATE_VERSION } from '../lib/quoteTemplate.js';
import { downloadBlob } from '../lib/xlsxWrite.js';

const SAMPLE_CSV = `product_name,fda_product_code,hts_code,fob_price_usd,moq,target_quantity,country_of_origin,gtin
Compression stockings 20-30mmHg,NHM,6115.10,2.40,5000,5000,CN,
Thermometer probes disposable,KGN,9025.19,0.08,25000,25000,VN,
Cold/hot therapy gel pack 6x10,KGN,3824.99,0.94,2000,2000,CN,
N95 respirator fluid-resistant,NHM,6307.90,0.21,50000,50000,MY,
`;

const TIERS = [
  { id: 'A', label: 'A · Hospital / Gov (30%)' },
  { id: 'B', label: 'B · Mid ASC / Distributor (50%)' },
  { id: 'C', label: 'C · Small clinic (60%)' },
  { id: 'distributor', label: 'Distributor (25%)' },
  { id: 'gov', label: 'Government / BPA (20%)' },
];

const VIA_BADGE = {
  alias: { label: 'exact', color: '#1f7a4d', bg: '#e3f5ec' },
  fuzzy: { label: 'fuzzy', color: '#7c5b1d', bg: '#fdf6e3' },
  ai: { label: 'AI', color: '#1d5c4d', bg: '#e8f3ec' },
};

export function QuoteNew() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'New quote · Source & price',
    description: 'Upload a vendor product sheet (Excel or CSV, any language) and get back a compliance-checked, all-in landed-cost quote — ready to accept online.',
    canonical: '/quote/new',
  });

  const [vendorName, setVendorName] = useState('');
  const [customerName, setCustomerName] = useState('Atlanta Surgical Center');
  const [contactName, setContactName] = useState('Mariah Patel');
  const [customerTier, setCustomerTier] = useState('A');
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState([]);
  const [error, setError] = useState(null);
  const [tplBusy, setTplBusy] = useState(false);

  const pushProgress = (s) => setProgress((p) => [...p, s]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setProgress([]); setParsed(null); setParsing(true);
    try {
      const result = await ingestVendorFile(file, {
        vendorHint: vendorName,
        useAiMapping: true,
        translate: true,
        onProgress: pushProgress,
      });
      setParsed(result);
      if (result.vendor && !vendorName) setVendorName(result.vendor);
    } catch (err) {
      setError(err?.message || 'Could not read that file.');
    } finally {
      setParsing(false);
      // reset so re-uploading the same file fires onChange again
      e.target.value = '';
    }
  }

  function handlePaste() {
    setError(null); setProgress([]);
    setParsed(parseVendorSheetText({ text: csvText || SAMPLE_CSV, vendorHint: vendorName }));
  }
  function loadSample() {
    setCsvText(SAMPLE_CSV);
    setParsed(parseVendorSheetText({ text: SAMPLE_CSV, vendorHint: 'Sample Manufacturer' }));
    setVendorName('Sample Manufacturer');
  }

  async function downloadTemplate(kind) {
    setTplBusy(true);
    try {
      if (kind === 'xlsx') {
        const blob = await generateTemplateXlsx();
        downloadBlob(blob, `unite-quote-template-${TEMPLATE_VERSION}.xlsx`);
      } else {
        const blob = new Blob([generateTemplateCsv()], { type: 'text/csv' });
        downloadBlob(blob, `unite-quote-template-${TEMPLATE_VERSION}.csv`);
      }
    } catch (err) {
      setError(`Couldn't build the template: ${err.message}`);
    } finally {
      setTplBusy(false);
    }
  }

  async function runEngine() {
    if (!parsed?.ok) return;
    setRunning(true); setError(null); setProgress([]);
    try {
      const res = await runQuotingEngine({
        vendor: vendorName || parsed.vendor,
        customer_name: customerName,
        contact_name: contactName,
        customer_tier: customerTier,
        lines: parsed.lines,
        onProgress: pushProgress,
      });
      navigate(`/quotes/${res.quote.id}/print?view=internal`);
    } catch (e) {
      setError(e?.message || 'Quoting engine failed.');
    } finally {
      setRunning(false);
    }
  }

  const mappingEntries = parsed?.mapping ? Object.entries(parsed.mapping) : [];
  const unmappedOptional = parsed?.column_map
    ? CANONICAL_FIELDS.filter((f) => !(f in parsed.column_map))
    : [];

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow="SOURCE & QUOTE · NEW"
          title={<>Upload a sheet. <em>Get a quote.</em></>}
          sub="Drop your vendor's product list — Excel or CSV, any language. We handle the translation and compliance checks and return an all-in, landed-cost PDF customers can accept."
        />

        <section style={{ padding: `0 ${padX}px ${isMobile ? 56 : 80}px` }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 360px', gap: isMobile ? 28 : 36 }}>
            <div>
              {/* STEP 0 — template */}
              <div style={{ background: D.paperAlt, border: `1px solid ${D.line}`, borderRadius: 14, padding: isMobile ? 18 : 22, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>STEP 0 · GET THE TEMPLATE</div>
                    <div style={{ fontSize: 13, color: D.ink2, marginTop: 4 }}>
                      Pre-formatted with dropdowns, validation, and an instructions tab. Vendors fill it in and send it back. <span style={{ color: D.ink3 }}>({TEMPLATE_VERSION})</span>
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button type="button" disabled={tplBusy} onClick={() => downloadTemplate('xlsx')} style={btnSolid(D)}>Excel template</button>
                    <button type="button" disabled={tplBusy} onClick={() => downloadTemplate('csv')} style={btnGhost(D)}>CSV</button>
                  </div>
                </div>
              </div>

              {/* STEP 1 — upload */}
              <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, padding: isMobile ? 22 : 28 }}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>STEP 1 · UPLOAD OR PASTE</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginTop: 16 }}>
                  <label htmlFor="vendor-file" style={{ display: 'block', padding: 22, border: `1.5px dashed ${D.line}`, borderRadius: 12, textAlign: 'center', cursor: 'pointer', background: D.paperAlt }}>
                    <Icon.upload />
                    <div style={{ fontSize: 14, marginTop: 8, fontWeight: 500 }}>Drop Excel or CSV</div>
                    <div style={{ fontSize: 11, color: D.ink3, marginTop: 4 }}>.xlsx or .csv · up to 10MB</div>
                    <input id="vendor-file" type="file" accept=".csv,.xlsx" onChange={handleFile} style={{ display: 'none' }} />
                  </label>
                  <div style={{ padding: 22, border: `1px solid ${D.line}`, borderRadius: 12 }}>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>OR PASTE CSV</div>
                    <textarea
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      placeholder={SAMPLE_CSV.split('\n').slice(0, 2).join('\n') + '\n…'}
                      rows={5}
                      style={{ width: '100%', marginTop: 10, padding: 10, border: `1px solid ${D.line}`, borderRadius: 8, fontFamily: D.mono, fontSize: 11, color: D.ink, background: D.paper, resize: 'vertical', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <button type="button" onClick={handlePaste} style={btnSolid(D)}>Parse</button>
                      <button type="button" onClick={loadSample} style={btnGhost(D)}>Load sample</button>
                    </div>
                  </div>
                </div>
                {parsing && (
                  <div style={{ marginTop: 14, fontSize: 13, color: D.ink2, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon.sparkle /> Reading sheet, mapping columns, translating…
                  </div>
                )}
              </div>

              {parsed && (
                <div style={{ marginTop: 18, background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, padding: isMobile ? 22 : 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>STEP 2 · REVIEW</div>
                    <span style={{ marginLeft: 'auto', fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>
                      {parsed.totals.accepted}/{parsed.totals.rows} lines accepted
                    </span>
                  </div>

                  {/* meta chips */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    {parsed.sheetName && parsed.sheetNames?.length > 1 && (
                      <Chip D={D}>Sheet: {parsed.sheetName} (of {parsed.sheetNames.length})</Chip>
                    )}
                    {parsed.templateVersion && (
                      <Chip D={D} tone={parsed.templateOutdated ? 'warn' : 'ok'}>
                        Template {parsed.templateVersion}{parsed.templateOutdated ? ' · outdated' : ' · current'}
                      </Chip>
                    )}
                    {parsed.aiMapped && <Chip D={D} tone="ai">AI column mapping used</Chip>}
                    {parsed.translations?.length > 0 && <Chip D={D} tone="ai">{parsed.translations.length} translated</Chip>}
                  </div>

                  {parsed.errors.length > 0 && (
                    <div style={{ padding: 12, borderRadius: 8, background: '#fbe9e1', color: '#7a2d10', fontSize: 13, marginBottom: 14 }}>
                      <strong>Cannot parse:</strong>
                      <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                        {parsed.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* column mapping confirmation */}
                  {mappingEntries.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginBottom: 8 }}>COLUMN MAP</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {mappingEntries.map(([field, m]) => {
                          const b = VIA_BADGE[m.via] || VIA_BADGE.alias;
                          return (
                            <span key={field} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, border: `1px solid ${D.line}`, borderRadius: 4, padding: '4px 10px' }}>
                              <code style={{ fontFamily: D.mono, color: D.ink }}>{field}</code>
                              <span style={{ color: D.ink3 }}>←</span>
                              <span style={{ color: D.ink2 }}>{m.header}</span>
                              <span style={{ fontFamily: D.mono, fontSize: 9, color: b.color, background: b.bg, borderRadius: 4, padding: '1px 5px' }}>{b.label}</span>
                            </span>
                          );
                        })}
                      </div>
                      {unmappedOptional.length > 0 && (
                        <div style={{ fontSize: 11, color: D.ink3, marginTop: 8 }}>
                          Not provided: {unmappedOptional.join(', ')}
                        </div>
                      )}
                    </div>
                  )}

                  {parsed.warnings.length > 0 && (
                    <div style={{ padding: 12, borderRadius: 8, background: '#fdf6e3', color: '#7c5b1d', fontSize: 12, marginBottom: 14, maxHeight: 160, overflow: 'auto' }}>
                      <strong>{parsed.warnings.length} warning(s):</strong>
                      <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                        {parsed.warnings.slice(0, 12).map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}

                  {parsed.lines.length > 0 && (
                    <div className="um-scroll-x">
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
                        <thead>
                          <tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                            {['PRODUCT', 'FDA', 'HTS', 'FOB', 'MOQ', 'QTY', 'GTIN', 'COO'].map((h) => (
                              <th key={h} style={{ textAlign: 'left', padding: '8px 6px', borderBottom: `1px solid ${D.line}` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {parsed.lines.map((l, i) => (
                            <tr key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                              <td style={{ padding: '8px 6px', fontWeight: 500 }}>
                                {l.name}
                                {l.translated && (
                                  <span title={`Original: ${l.name_original}`} style={{ marginLeft: 6, fontFamily: D.mono, fontSize: 9, color: '#1d5c4d', background: '#e8f3ec', borderRadius: 4, padding: '1px 5px' }}>译</span>
                                )}
                                {l.translated && (
                                  <div style={{ fontSize: 10, color: D.ink3, marginTop: 2 }}>{l.name_original}</div>
                                )}
                              </td>
                              <td style={{ padding: '8px 6px', fontFamily: D.mono }}>{l.fda_product_code}</td>
                              <td style={{ padding: '8px 6px', fontFamily: D.mono }}>{l.hts}</td>
                              <td style={{ padding: '8px 6px', fontFamily: D.mono }}>${l.fob.toFixed(2)}</td>
                              <td style={{ padding: '8px 6px', fontFamily: D.mono }}>{l.moq}</td>
                              <td style={{ padding: '8px 6px', fontFamily: D.mono }}>{l.target_qty}</td>
                              <td style={{ padding: '8px 6px', fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>{l.gtin || '—'}</td>
                              <td style={{ padding: '8px 6px', fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>{l.country_of_origin || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {progress.length > 0 && (
                <div style={{ marginTop: 16, padding: 18, borderRadius: 14, background: D.paperAlt, border: `1px solid ${D.line}` }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum, marginBottom: 8 }}>{running ? 'RUNNING ENGINE' : 'PIPELINE'}</div>
                  {progress.map((p, i) => (
                    <div key={i} style={{ fontSize: 13, color: D.ink2, padding: '4px 0' }}>
                      <span style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3, marginRight: 8 }}>·</span>{p.label}
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: '#fbe9e1', color: '#7a2d10', fontSize: 13 }}>{error}</div>
              )}
            </div>

            <aside>
              <div style={{ position: isMobile ? 'static' : 'sticky', top: 100, background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, padding: 22 }}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>STEP 3 · CUSTOMER + RUN</div>
                <label style={{ display: 'block', marginTop: 14 }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>VENDOR</div>
                  <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="e.g. Sample Manufacturer" style={fieldStyle} />
                </label>
                <label style={{ display: 'block', marginTop: 10 }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>CUSTOMER</div>
                  <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={fieldStyle} />
                </label>
                <label style={{ display: 'block', marginTop: 10 }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>CONTACT</div>
                  <input value={contactName} onChange={(e) => setContactName(e.target.value)} style={fieldStyle} />
                </label>
                <label style={{ display: 'block', marginTop: 10 }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>CUSTOMER TIER</div>
                  <select value={customerTier} onChange={(e) => setCustomerTier(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
                    {TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </label>

                <button
                  type="button"
                  disabled={!parsed?.ok || running}
                  onClick={runEngine}
                  style={{ marginTop: 18, width: '100%', background: D.plum, color: D.paper, border: 'none', padding: 14, borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: (!parsed?.ok || running) ? 'not-allowed' : 'pointer', opacity: (!parsed?.ok || running) ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}
                >
                  {running ? 'Running…' : <>Run quoting engine <Icon.arrow /></>}
                </button>

                <div style={{ marginTop: 14, fontSize: 11, color: D.ink3, lineHeight: 1.6 }}>
                  Every line is compliance-checked and priced all-in — one landed number, no hidden freight or fees — then delivered as an accept-ready PDF.
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function Chip({ D, children, tone }) {
  const tones = {
    ok: { color: '#1f7a4d', bg: '#e3f5ec', border: '#bfe6d2' },
    warn: { color: '#7c5b1d', bg: '#fdf6e3', border: '#ecd9a8' },
    ai: { color: '#1d5c4d', bg: '#e8f3ec', border: '#c8ddd2' },
  };
  const t = tones[tone] || { color: D.ink2, bg: D.paperAlt, border: D.line };
  return (
    <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 0.5, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 4, padding: '4px 10px' }}>
      {children}
    </span>
  );
}

const btnSolid = (D) => ({ background: D.ink, color: D.paper, border: 'none', padding: '8px 14px', borderRadius: 4, fontSize: 12, cursor: 'pointer' });
const btnGhost = (D) => ({ background: 'transparent', color: D.ink2, border: `1px solid ${D.line}`, padding: '7px 13px', borderRadius: 4, fontSize: 12, cursor: 'pointer' });

const fieldStyle = {
  width: '100%', marginTop: 6, padding: '10px 12px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: 'inherit', outline: 'none', boxSizing: 'border-box',
};
