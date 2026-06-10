/**
 * /quote/new — PRD-08 Phase 1 + 7.
 *
 * The "real" entry point to the quoting engine. Two paths:
 *   1. Vendor / rep uploads a CSV → parsed → previewed → run.
 *   2. Approved customer self-serves by selecting from saved
 *      product templates or pasting a short ask.
 *
 * Drops downstream into the existing `runQuotingEngine` in
 * `src/lib/quoting.js`, which now calls real openFDA + USITC HTS +
 * Claude (when configured). The output lives at /quotes/:id/print.
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
import { parseVendorSheetFile, parseVendorSheetText } from '../lib/vendorSheet.js';
import { runQuotingEngine } from '../lib/quoting.js';

const SAMPLE_CSV = `product_name,fda_product_code,hts_code,fob_price_usd,moq,target_quantity,country_of_origin,gtin
Compression stockings 20-30mmHg,NHM,6115.10,2.40,5000,5000,CN,
Thermometer probes disposable,KGN,9025.19,0.08,25000,25000,VN,
Cold/hot therapy gel pack 6x10,KGN,3824.99,0.94,2000,2000,CN,
N95 respirator fluid-resistant,NHM,6307.90,0.21,50000,50000,MY,
`;

export function QuoteNew() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'New quote · Source & price',
    description: 'Upload a vendor product sheet. We validate FDA codes, pull live duty rates, generate freight, and return a landed-cost quote.',
    canonical: '/quote/new',
  });

  const [vendorName, setVendorName] = useState('');
  const [customerName, setCustomerName] = useState('Atlanta Surgical Center');
  const [contactName, setContactName] = useState('Mariah Patel');
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState([]);
  const [error, setError] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setProgress([]);
    const result = await parseVendorSheetFile(file, { vendorHint: vendorName });
    setParsed(result);
    if (result.vendor && !vendorName) setVendorName(result.vendor);
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

  async function runEngine() {
    if (!parsed?.ok) return;
    setRunning(true); setError(null); setProgress([]);
    try {
      const res = await runQuotingEngine({
        vendor: vendorName || parsed.vendor,
        customer_name: customerName,
        contact_name: contactName,
        lines: parsed.lines,
        onProgress: (s) => setProgress((p) => [...p, s]),
      });
      navigate(`/quotes/${res.quote.id}/print?view=internal`);
    } catch (e) {
      setError(e?.message || 'Quoting engine failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow="SOURCE & QUOTE · NEW"
          title={<>Upload a sheet. <em>Get a quote.</em></>}
          sub="Drop your vendor's product list and we'll validate FDA codes, pull live USITC duty rates, generate a freight quote, and return a landed-cost PDF customers can accept."
        />

        <section style={{ padding: `0 ${padX}px ${isMobile ? 56 : 80}px` }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 360px', gap: isMobile ? 28 : 36 }}>
            <div>
              <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, padding: isMobile ? 22 : 28 }}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>STEP 1 · UPLOAD OR PASTE</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginTop: 16 }}>
                  <label htmlFor="vendor-file" style={{ display: 'block', padding: 22, border: `1.5px dashed ${D.line}`, borderRadius: 12, textAlign: 'center', cursor: 'pointer', background: D.paperAlt }}>
                    <Icon.upload />
                    <div style={{ fontSize: 14, marginTop: 8, fontWeight: 500 }}>Drop a CSV here</div>
                    <div style={{ fontSize: 11, color: D.ink3, marginTop: 4 }}>or click to browse</div>
                    <input id="vendor-file" type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
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
                      <button type="button" onClick={handlePaste} style={{ background: D.ink, color: D.paper, border: 'none', padding: '8px 14px', borderRadius: 999, fontSize: 12, cursor: 'pointer' }}>Parse</button>
                      <button type="button" onClick={loadSample} style={{ background: 'transparent', color: D.ink2, border: `1px solid ${D.line}`, padding: '7px 13px', borderRadius: 999, fontSize: 12, cursor: 'pointer' }}>Load sample</button>
                    </div>
                  </div>
                </div>
              </div>

              {parsed && (
                <div style={{ marginTop: 18, background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, padding: isMobile ? 22 : 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>STEP 2 · REVIEW</div>
                    <span style={{ marginLeft: 'auto', fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>
                      {parsed.totals.accepted}/{parsed.totals.rows} lines accepted
                    </span>
                  </div>

                  {parsed.errors.length > 0 && (
                    <div style={{ padding: 12, borderRadius: 8, background: '#fbe9e1', color: '#7a2d10', fontSize: 13, marginBottom: 14 }}>
                      <strong>Cannot parse:</strong>
                      <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                        {parsed.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}

                  {parsed.warnings.length > 0 && (
                    <div style={{ padding: 12, borderRadius: 8, background: '#fdf6e3', color: '#7c5b1d', fontSize: 12, marginBottom: 14, maxHeight: 140, overflow: 'auto' }}>
                      <strong>{parsed.warnings.length} warning(s):</strong>
                      <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                        {parsed.warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
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
                              <td style={{ padding: '8px 6px', fontWeight: 500 }}>{l.name}</td>
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
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum, marginBottom: 8 }}>RUNNING ENGINE</div>
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

                <button
                  type="button"
                  disabled={!parsed?.ok || running}
                  onClick={runEngine}
                  style={{ marginTop: 18, width: '100%', background: D.plum, color: D.paper, border: 'none', padding: 14, borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: (!parsed?.ok || running) ? 'not-allowed' : 'pointer', opacity: (!parsed?.ok || running) ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}
                >
                  {running ? 'Running…' : <>Run quoting engine <Icon.arrow /></>}
                </button>

                <div style={{ marginTop: 14, fontSize: 11, color: D.ink3, lineHeight: 1.6 }}>
                  Pipeline: parse → openFDA → USITC HTS → freight → margin → Claude letter → PDF. Total ~10–30 seconds depending on line count.
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

const fieldStyle = {
  width: '100%', marginTop: 6, padding: '10px 12px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: 'inherit', outline: 'none', boxSizing: 'border-box',
};
