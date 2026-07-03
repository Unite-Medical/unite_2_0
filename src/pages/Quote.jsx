import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Eyebrow } from '../components/shared/Eyebrow.jsx';
import { runQuotingEngine, SAMPLE_VENDOR_SHEET } from '../lib/quoting.js';
import { fmt } from '../lib/format.js';
import { db } from '../lib/db.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

// Status icons for the engine's pipeline steps. Internal step names (openfda,
// flexport, claude) intentionally stay in the data layer; customer-facing
// labels in `cards` below use generic copy per spec §4p.
const STEP_ICONS = {
  parse: Icon.upload,
  openfda: Icon.shield,
  hts: Icon.factory,
  flexport: Icon.ship,
  claude: Icon.sparkle,
  done: Icon.check,
};

export function Quote() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  // TODO: full rebuild per Unite_Quoting_Engine_Spec.md is pending; this
  // sanitization removes the proprietary tooling labels, vendor names, and
  // margin figures from the current internal demo per spec §4p.
  useSEO({
    title: 'Source & Quote · Unite Medical',
    description:
      'Source and price non-stock medical supplies from our vetted manufacturer network. Real-time pricing, landed cost, compliance verified.',
    canonical: '/quote',
  });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleRun(sheet = SAMPLE_VENDOR_SHEET) {
    setError(null); setProgress([]); setResult(null); setRunning(true);
    try {
      const res = await runQuotingEngine({
        ...sheet,
        onProgress: (s) => setProgress((p) => [...p, s]),
      });
      setResult(res);
    } catch (e) {
      setError(e?.message || 'Quoting engine failed.');
    } finally {
      setRunning(false);
    }
  }

  const stepFor = (step) => progress.filter((p) => p.step === step).pop();

  // Outcome-level labels only (PRD-28 §1.4) — sell the capability, never the
  // mechanism. No integration names, no pipeline internals.
  const cards = [
    ['Compliance check', stepFor('openfda')?.label || (running ? 'Checking…' : 'Idle'), 'openfda'],
    ['All-in pricing', stepFor('hts')?.label || (running ? 'Pricing…' : 'Idle'), 'hts'],
    ['Delivery window', stepFor('flexport')?.label || (running ? 'Estimating…' : 'Idle'), 'flexport'],
    ['Quote packet', stepFor('claude')?.label || (running ? 'Preparing…' : 'Idle'), 'claude'],
  ];

  const recent = db.useTable('quotes', { orderBy: 'created_at', dir: 'desc', limit: 5 });
  // eslint-disable-next-line react-hooks/purity
  const placeholderEta = useMemo(() => new Date(Date.now() + 28 * 86400000).toISOString(), []);

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <div style={{ background: D.paperAlt, borderBottom: `1px solid ${D.line}` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', padding: `${isMobile ? 36 : 56}px ${padX}px` }}>
            <Eyebrow style={{ marginBottom: 14 }}>SOURCE & QUOTE</Eyebrow>
            <h1 style={{ fontFamily: D.display, fontSize: 'clamp(38px, 7.6vw, 76px)', fontWeight: 400, letterSpacing: 'clamp(-1px, -0.19vw, -1.8px)', margin: 0, lineHeight: 1.0 }}>
              Source non-stock items. <Grad>Priced and ready.</Grad>
            </h1>
            <p style={{ color: D.ink2, maxWidth: 640, fontSize: 16, lineHeight: 1.55, marginTop: 20 }}>
              Tell us what you need. We price it against our vetted manufacturer network,
              verify compliance, and return a landed-cost customer quote with a delivery
              window.
            </p>
            <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => handleRun()} disabled={running} style={{ background: D.plum, color: D.paper, border: 'none', padding: '13px 22px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: running ? 'wait' : 'pointer', opacity: running ? 0.7 : 1 }}>
                {running ? 'Running engine…' : 'Run sample sheet (4 lines)'}
              </button>
              <a href="#recent" style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '12px 22px', borderRadius: 999, fontSize: 14 }}>Past quotes ({recent.length})</a>
            </div>
            {error && <div style={{ marginTop: 14, padding: 10, background: '#fbe9e1', color: '#7a2d10', borderRadius: 8, fontSize: 13 }}>{error}</div>}
          </div>
        </div>

        <div style={{ maxWidth: 1360, margin: '0 auto', padding: `${isMobile ? 28 : 44}px ${padX}px ${isMobile ? 56 : 80}px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 420px', gap: isMobile ? 22 : 36 }}>
          <div>
            <div style={{ background: D.card, borderRadius: 14, padding: isMobile ? 18 : 24, border: `1px solid ${D.line}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: D.plum, color: D.paper, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon.upload /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{progress[0]?.label || 'product-sheet-q2-2026.xlsx'}</div>
                <div style={{ fontSize: 13, color: D.ink2, marginTop: 2 }}>{SAMPLE_VENDOR_SHEET.vendor} · {SAMPLE_VENDOR_SHEET.lines.length} line items{result ? ' · parsed' : running ? ' · parsing…' : ' · ready'}</div>
              </div>
              <div style={{ fontFamily: D.mono, fontSize: 11, color: result ? '#3b8760' : D.ink3 }}>
                {result ? <><Icon.check /> VALIDATED</> : running ? 'PROCESSING' : 'IDLE'}
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4,1fr)', gap: 12 }}>
              {cards.map(([n, v, key]) => {
                const Icn = STEP_ICONS[key];
                const active = stepFor(key);
                return (
                  <div key={n} style={{ background: D.card, borderRadius: 12, padding: 16, border: `1px solid ${active ? D.plum : D.line}`, transition: 'border-color .2s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: D.paperAlt, color: D.plum, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icn /></div>
                      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 0.8, color: D.ink3 }}>{n.toUpperCase()}</div>
                    </div>
                    <div style={{ fontFamily: D.display, fontSize: 18, color: D.ink, marginTop: 10, letterSpacing: -0.3 }}>{v}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 16, background: D.card, borderRadius: 14, overflow: 'hidden', border: `1px solid ${D.line}` }}>
              <div style={{ padding: '18px 22px', borderBottom: `1px solid ${D.line}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: D.display, fontSize: 22 }}>Your quote — all-in landed pricing</div>
                <div style={{ flex: 1 }} />
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>DELIVERED · NO HIDDEN FEES</div>
              </div>
              {/* Customer view shows only the sell side (PRD-28 §1.4) — cost
                  structure (FOB/duty/HTS) never leaves the internal tooling. */}
              <div className="um-scroll-x">
              <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: D.paperAlt, color: D.ink3, fontFamily: D.mono, fontSize: 10, letterSpacing: 1 }}>
                    {['PRODUCT', 'QTY', 'PRICE / UNIT · DELIVERED', 'EXTENDED'].map((h) => <th key={h} style={{ padding: '12px 16px', textAlign: 'left' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(result?.lines || SAMPLE_VENDOR_SHEET.lines.map((l) => ({ ...l, sell_per_unit: l.fob * 2.5, ext_sell: l.fob * 2.5 * (l.target_qty || 1) }))).map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${D.line}` }}>
                      <td style={{ padding: 14, fontWeight: 500 }}>{r.name}</td>
                      <td style={{ padding: 14, fontFamily: D.mono }}>{(r.target_qty || 1).toLocaleString()}</td>
                      <td style={{ padding: 14, fontFamily: D.mono, fontWeight: 600 }}>${r.sell_per_unit.toFixed(2)}</td>
                      <td style={{ padding: 14, fontFamily: D.mono, fontWeight: 600, color: D.plum }}>{fmt.money(r.ext_sell)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            <div id="recent" style={{ marginTop: 32, background: D.card, borderRadius: 14, overflow: 'hidden', border: `1px solid ${D.line}` }}>
              <div style={{ padding: '18px 22px', borderBottom: `1px solid ${D.line}`, fontFamily: D.display, fontSize: 22 }}>Recent quotes</div>
              {recent.length === 0 && <div style={{ padding: 24, color: D.ink3, fontSize: 13 }}>No quotes yet. Run the sample to generate one.</div>}
              {recent.map((q, i) => (
                <div key={q.id} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 100px 120px', gap: 16, padding: '14px 22px', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, fontSize: 13, alignItems: 'center' }}>
                  <div style={{ fontFamily: D.mono, color: D.plum, fontWeight: 600 }}>{q.id}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{q.customer_name}</div>
                    <div style={{ fontSize: 12, color: D.ink2, marginTop: 2 }}>{q.vendor} · {q.line_count} lines</div>
                  </div>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{q.status?.toUpperCase()}</div>
                  <div style={{ fontFamily: D.display, fontSize: 18, color: D.plum, textAlign: 'right' }}>{fmt.money(q.total)}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ position: isMobile ? 'static' : 'sticky', top: 120 }}>
              <div style={{ background: D.plum, color: D.paper, borderRadius: 16, padding: isMobile ? 22 : 28 }}>
                <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plumSoft }}>QUOTE {result?.quote.id || 'Q-26-00284'}</div>
                <div style={{ fontFamily: D.display, fontSize: 56, letterSpacing: -1.6, marginTop: 14, lineHeight: 1 }}>
                  {fmt.money(result?.quote.total ?? SAMPLE_VENDOR_SHEET.lines.reduce((a, l) => a + l.fob * 2.5 * (l.target_qty || 1), 0))}
                </div>
                <div style={{ fontSize: 13, color: D.plumSoft, marginTop: 8 }}>Landed · delivered · net 30 · FOB Georgia</div>
                <div style={{ height: 1, background: 'rgba(255,255,255,.18)', margin: '22px 0' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 12 }}>
                  <div>
                    <div style={{ color: D.plumSoft, fontFamily: D.mono }}>CUSTOMER</div>
                    <div style={{ marginTop: 4 }}>{result?.quote.customer_name || 'Atlanta Surgical Center'}<br />{result?.quote.contact_name || 'Mariah Patel'}</div>
                  </div>
                  <div>
                    <div style={{ color: D.plumSoft, fontFamily: D.mono }}>DELIVERS</div>
                    <div style={{ marginTop: 4 }}>{fmt.date(result?.quote.eta || placeholderEta, { year: true })}<br />{result?.freight ? `${result.freight.mode} · ${Math.round(result.freight.rates[0].total_usd).toLocaleString()}` : 'MSC Vela 2E'}</div>
                  </div>
                </div>
                <button
                  disabled={!result}
                  onClick={() => result && navigate(`/quotes/${result.quote.id}/print?view=internal`)}
                  style={{ marginTop: 22, width: '100%', background: D.paper, color: D.plum, border: 'none', padding: 14, borderRadius: 999, fontSize: 14, fontWeight: 600, fontFamily: D.sans, cursor: result ? 'pointer' : 'not-allowed', opacity: result ? 1 : 0.5 }}
                >
                  {result ? 'Open quote PDF →' : 'Run engine first'}
                </button>
                {result && (
                  <button
                    type="button"
                    onClick={() => navigate(`/quotes/${result.quote.id}/print`)}
                    style={{ marginTop: 10, width: '100%', background: 'transparent', color: D.paper, border: `1.5px solid ${D.paper}`, padding: 12, borderRadius: 999, fontSize: 13, fontWeight: 500, fontFamily: D.sans, cursor: 'pointer' }}
                  >
                    Preview customer view
                  </button>
                )}
              </div>
              <div style={{ marginTop: 14, padding: 20, background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, fontSize: 13, color: D.ink2, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum, marginBottom: 10 }}>COVER LETTER · {result ? 'DRAFT READY' : 'WAITING'}</div>
                {result?.quote.cover_letter || `Mariah — per our call last Tuesday, here's pricing on the four SKUs we discussed for the Q3 build-out…`}
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
