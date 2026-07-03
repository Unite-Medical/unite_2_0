/**
 * Supply Risk monitor — public recall/disruption feed (Cato-gap feature,
 * brief §6 openFDA).
 *
 * Live device enforcement reports straight from openFDA, rendered as a
 * public monitoring page. Each recall is checked against the categories
 * Unite stocks; when we warehouse alternates, the row deep-links into the
 * shortage matcher so an affected buyer converts on the spot. This is the
 * lead-gen pattern Cato runs with Risk Radar — ours rides a free API and
 * our own shelf stock.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { Reveal } from '../components/shared/Reveal.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { openfda } from '../lib/external/openfda.js';
import { rankCatalog } from '../lib/matching.js';
import { availability } from '../lib/wms/availability.js';

/**
 * Map a recall's product description onto all 3 supply sources (PRD-29
 * §4.2.3): a recalled item can offer a stocked alternate (real available
 * inventory), a sourced alternate (catalog / vetted-manufacturer line with
 * no shelf stock), or route to an open quote.
 */
function supplyCoverage(description) {
  const ranked = rankCatalog(description, { limit: 3 });
  if (!ranked.length) return null;
  const products = ranked.map((r) => r.product);
  const stocked = products.filter((p) => availability.availableToPromise(p.sku) > 0);
  return {
    products,
    stocked,
    mode: stocked.length > 0 ? 'stocked' : 'source',
  };
}

function fmtDate(yyyymmdd) {
  const s = String(yyyymmdd || '');
  if (s.length !== 8) return s;
  return `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}`;
}

const CLASS_COLOR = {
  'Class I': '#b03434',
  'Class II': '#b8502c',
  'Class III': '#8f8490',
};

export function SupplyRisk() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;

  useSEO({
    title: 'Medical device recall & supply risk monitor',
    description: 'Live FDA device enforcement reports, updated from openFDA. See active recalls across gloves, diagnostics, orthotics, and surgical supplies — and which categories Unite Medical stocks alternates for.',
    canonical: '/supply-risk',
  });

  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    openfda.recentEnforcement({ sinceDays: 120, limit: 18 }).then((data) => {
      if (!alive) return;
      const rows = (data.results || []).map((r) => ({
        ...r,
        coverage: supplyCoverage(r.product_description),
      }));
      setFeed({ rows, fallback: !!data.meta?.fallback, updated: data.meta?.last_updated });
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const covered = feed ? feed.rows.filter((r) => r.coverage).length : 0;

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead
        eyebrow="LIVE FROM OPENFDA · DEVICE ENFORCEMENT REPORTS"
        title="Supply risk, monitored."
        sub="Active FDA device recalls across the categories we serve — gloves, diagnostics, orthotics, surgical supplies. When a recall hits your supplier, we flag whether Unite can cover it — from stock or through our sourcing network."
      />

      <div id="main" style={{ padding: `${isMobile ? 32 : 64}px ${padX}px ${isMobile ? 64 : 110}px` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Status strip */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: isMobile ? 24 : 36 }}>
            <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: '#3b8760', border: `1px solid ${D.line}`, background: D.card, borderRadius: 999, padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: '#3b8760', animation: 'umPulse 2.6s ease-in-out infinite' }} />
              {loading ? 'QUERYING OPENFDA…' : `${feed.rows.length} REPORTS · LAST 120 DAYS`}
            </span>
            {!loading && (
              <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum, border: `1px solid ${D.line}`, background: D.card, borderRadius: 999, padding: '7px 14px' }}>
                {covered} WITH ALTERNATES ACROSS OUR SUPPLY CHAIN
              </span>
            )}
            {!loading && feed.fallback && (
              <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3, border: `1px solid ${D.line}`, background: D.card, borderRadius: 999, padding: '7px 14px' }}>
                SAMPLE FEED · OPENFDA UNREACHABLE
              </span>
            )}
          </div>

          {/* Feed */}
          {loading ? (
            <div style={{ padding: 80, textAlign: 'center', fontFamily: D.mono, fontSize: 12, letterSpacing: 1, color: D.ink3 }}>
              QUERYING API.FDA.GOV…
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {feed.rows.map((r, i) => (
                <Reveal key={`${r.recalling_firm}-${r.report_date}-${i}`} delay={Math.min(i, 6) * 60}>
                  <article style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, padding: isMobile ? 16 : 22 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.paper, background: CLASS_COLOR[r.classification] || D.ink3, padding: '4px 10px', borderRadius: 999 }}>
                        {(r.classification || 'RECALL').toUpperCase()}
                      </span>
                      <span style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>{fmtDate(r.report_date)}</span>
                      <span style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>· {r.status?.toUpperCase()}</span>
                      {r.state && <span style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>· {r.state}</span>}
                    </div>
                    <div style={{ fontFamily: D.display, fontSize: isMobile ? 17 : 21, letterSpacing: -0.3, lineHeight: 1.3, marginTop: 10 }}>
                      {r.product_description}
                    </div>
                    <div style={{ fontSize: 13.5, color: D.ink2, marginTop: 6 }}>
                      {r.recalling_firm} — {r.reason_for_recall}
                    </div>
                    {r.coverage && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${D.line}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {r.coverage.mode === 'stocked' ? (
                          <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: '#3b8760', background: 'rgba(59,135,96,.1)', padding: '4px 10px', borderRadius: 999 }}>
                            STOCKED ALTERNATE AT UNITE
                          </span>
                        ) : (
                          <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.terra, background: 'rgba(184,80,44,.1)', padding: '4px 10px', borderRadius: 999 }}>
                            WE SOURCE THIS CATEGORY
                          </span>
                        )}
                        <span style={{ fontSize: 13, color: D.ink2, flex: 1, minWidth: 200 }}>
                          {(r.coverage.mode === 'stocked' ? r.coverage.stocked : r.coverage.products).slice(0, 2).map((p) => p.name).join(' · ')}
                        </span>
                        {r.coverage.mode === 'stocked' ? (
                          <Link to={`/products/${encodeURIComponent(r.coverage.stocked[0].sku)}`} style={{ fontSize: 13, fontWeight: 600, color: D.plum, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                            View stocked alternate <Icon.arrow />
                          </Link>
                        ) : (
                          <Link to={`/quote?sku=${encodeURIComponent(r.coverage.products[0].sku)}&path=source`} style={{ fontSize: 13, fontWeight: 600, color: D.plum, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                            Request a sourced alternate <Icon.arrow />
                          </Link>
                        )}
                      </div>
                    )}
                  </article>
                </Reveal>
              ))}
            </div>
          )}

          {/* Conversion band → shortage matcher */}
          <div style={{ marginTop: isMobile ? 40 : 64, background: D.inkDeep, color: D.paper, borderRadius: 24, padding: isMobile ? 28 : 48, position: 'relative', overflow: 'hidden' }}>
            <div aria-hidden="true" style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'radial-gradient(520px 360px at 90% 0%, rgba(94,41,99,.5), transparent 70%)',
            }} />
            <div style={{ position: 'relative' }}>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plumSoft }}>HIT BY A RECALL OR BACKORDER?</div>
              <div style={{ fontFamily: D.display, fontSize: isMobile ? 28 : 44, letterSpacing: -0.8, lineHeight: 1.05, marginTop: 12, maxWidth: 640 }}>
                Paste your shortage list — we&apos;ll match it against our full supply chain.
              </div>
              <Link to="/shortage-list" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: D.paper, color: D.ink, padding: '14px 26px', borderRadius: 999, fontSize: 14.5, fontWeight: 600, marginTop: 24 }}>
                Open the shortage matcher <Icon.arrow />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
