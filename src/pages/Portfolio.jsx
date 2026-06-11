import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { PORTFOLIO_IMG } from '../lib/imageMap.js';

const CASES = [
  { customer: 'Atlanta Surgical Center', segment: 'ASC · 4 ORs', stat: '38%', stat_label: 'supply spend reduction', body: 'Switched from Medline in Q3 2025. We rebuilt their formulary around the seven CPT codes they actually run, and trimmed annual supply spend by $214K.' },
  { customer: 'Holloway Apothecary', segment: 'Independent Pharmacy · Macon GA', stat: '$420K', stat_label: 'new revenue / yr', body: 'Private-label rapid tests + Clyne telehealth fulfillment turned a 2-pharmacy chain into a regional drop-ship hub for OTC diagnostics.' },
  { customer: 'VA Medical Center · Dublin', segment: 'Government', stat: '14 days', stat_label: 'first PO to first delivery', body: 'Berry-compliant Medava PPE delivered against the BPA in two weeks — beating the prior incumbent by six.' },
  { customer: 'MedOne Distributors', segment: 'Regional Distributor', stat: '+$1.2M', stat_label: 'new GMV in Q1', body: 'White-label drop-ship for orthotic bracing under MedOne\'s brand. EDI 850/856 standardised. Their reps stopped fighting their ERP.' },
  { customer: 'Cobb County EMS', segment: 'EMS', stat: '38', stat_label: 'rigs on monthly restock', body: 'CoTCCC trauma kits and per-rig restock subscriptions across 38 ambulances. One quarterly invoice, zero supplier calls.' },
  { customer: 'Sunrise ASC', segment: 'ASC · 6 ORs', stat: 'Same-day', stat_label: 'first dock-to-OR', body: 'Coming in mid-McKesson transition, Sunrise needed continuity. We had product on the dock the same day after their first PO.' },
];

export function Portfolio() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Portfolio — case studies',
    description:
      'Real numbers from real customers: 38% spend reduction at a 4-OR ASC, $420K new revenue at an independent pharmacy, 14-day VA onboarding, $1.2M new GMV from a regional distributor.',
    canonical: '/portfolio',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow="PORTFOLIO · CASE STUDIES"
          title={<>Receipts.<br /><Grad>Real ones.</Grad></>}
          sub="Six accounts, six different problems, six different solves. The work, in plain numbers."
        />
        <section style={{ padding: `24px ${padX}px ${isMobile ? 56 : 110}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            {/* Featured case — full-width split panel */}
            <article className="um-card" style={{
              background: D.ink, color: D.paper, borderRadius: isMobile ? 20 : 28, overflow: 'hidden',
              display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.15fr 1fr', alignItems: 'stretch',
            }}>
              <div style={{ minHeight: isMobile ? 220 : 440 }}>
                <PhotoPlaceholder src={PORTFOLIO_IMG[0]} caption={CASES[0].customer.toLowerCase()} height="100%" stripeFrom="#3a2c3e" stripeTo="#2c2030" textColor={D.plumSoft} radius={0} />
              </div>
              <div style={{ padding: isMobile ? 24 : '56px 60px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' }}>
                <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plumSoft }}>{CASES[0].segment.toUpperCase()}</div>
                <h3 style={{ fontFamily: D.display, fontSize: isMobile ? 30 : 44, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.05, margin: '14px 0 0' }}>{CASES[0].customer}</h3>
                <div style={{ marginTop: isMobile ? 20 : 32 }}>
                  <div style={{ fontFamily: D.display, fontSize: isMobile ? 64 : 104, lineHeight: 0.9, letterSpacing: '-0.04em', background: D.grad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{CASES[0].stat}</div>
                  <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: 'rgba(247,242,234,.55)', marginTop: 10 }}>{CASES[0].stat_label.toUpperCase()}</div>
                </div>
                <p style={{ fontSize: isMobile ? 14.5 : 16, color: 'rgba(247,242,234,.75)', lineHeight: 1.65, margin: `${isMobile ? 18 : 28}px 0 0` }}>{CASES[0].body}</p>
                <button onClick={() => navigate('/contact')} style={{ marginTop: isMobile ? 22 : 32, background: D.paper, color: D.ink, border: 'none', padding: '13px 24px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: D.sans }}>
                  Talk to a rep about your version →
                </button>
              </div>
            </article>

            {/* Remaining cases */}
            <div style={{ marginTop: isMobile ? 16 : 24, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: isMobile ? 14 : 24 }}>
              {CASES.slice(1).map((c, idx) => {
                const i = idx + 1;
                return (
                  <article key={c.customer} className="um-card" style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <PhotoPlaceholder src={PORTFOLIO_IMG[i]} caption={c.customer.toLowerCase()} height={isMobile ? 160 : 240} stripeFrom="#e8ddcd" stripeTo="#d9c8b0" textColor={D.plum} radius={0} />
                    <div style={{ padding: isMobile ? 22 : 32, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum }}>{c.segment.toUpperCase()}</div>
                      <h3 style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 30, fontWeight: 400, letterSpacing: -0.6, lineHeight: 1.1, margin: '10px 0 0' }}>{c.customer}</h3>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 18 }}>
                        <div style={{ fontFamily: D.display, fontSize: isMobile ? 44 : 56, color: D.plum, letterSpacing: '-0.03em', lineHeight: 0.95 }}>{c.stat}</div>
                        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3 }}>{c.stat_label.toUpperCase()}</div>
                      </div>
                      <p style={{ fontSize: 14.5, color: D.ink2, lineHeight: 1.6, margin: '16px 0 0', flex: 1 }}>{c.body}</p>
                      <button onClick={() => navigate('/contact')} style={{ marginTop: 24, background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '11px 18px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontFamily: D.sans }}>
                        Talk to a rep about your version →
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
