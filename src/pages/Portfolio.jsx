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
        <section style={{ padding: `24px ${padX}px ${isMobile ? 56 : 96}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: isMobile ? 14 : 18 }}>
            {CASES.map((c, i) => (
              <article key={c.customer} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, overflow: 'hidden' }}>
                <PhotoPlaceholder src={PORTFOLIO_IMG[i]} caption={c.customer.toLowerCase()} height={isMobile ? 160 : 220} stripeFrom="#e8ddcd" stripeTo="#d9c8b0" textColor={D.plum} radius={0} />
                <div style={{ padding: isMobile ? 22 : 28 }}>
                  <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum }}>{c.segment.toUpperCase()}</div>
                  <h3 style={{ fontFamily: D.display, fontSize: 28, fontWeight: 400, letterSpacing: -0.6, lineHeight: 1.1, margin: '10px 0 0' }}>{c.customer}</h3>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14 }}>
                    <div style={{ fontFamily: D.display, fontSize: 44, color: D.plum, letterSpacing: -1, lineHeight: 1 }}>{c.stat}</div>
                    <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3 }}>{c.stat_label.toUpperCase()}</div>
                  </div>
                  <p style={{ fontSize: 14.5, color: D.ink2, lineHeight: 1.6, margin: '14px 0 0' }}>{c.body}</p>
                  <button onClick={() => navigate('/contact')} style={{ marginTop: 22, background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '11px 18px', borderRadius: 999, cursor: 'pointer', fontSize: 13 }}>
                    Talk to a rep about your version →
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
