// Procurement & Supplier Diversity page — premise corrected per PRD-28 §3.3:
// Unite is the SUPPLIER BEHIND diverse resellers, and makes zero diversity-
// status claims about itself. (The Veteran-Owned tile refers to Damon being a
// veteran — never a VOSB/SDVOSB certification, which Unite does not hold.)
// Vercel 301s /about/veteran-owned → /procurement at the edge.
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const CREDENTIALS = [
  { label: 'Veteran-Owned', val: 'DD214 Verified', sub: 'ID.me verified, CAGE 8MK70' },
  { label: 'CAGE', val: '8MK70', sub: 'Federal contracting identifier' },
  { label: 'DUNS', val: '117553945', sub: 'SAM.gov registered' },
  { label: 'FDA', val: '3015727296', sub: 'Establishment registration' },
  { label: 'MSPV BPA', val: '36C24123A0077', sub: 'Via authorized SDVOSB partner' },
];

// Diversity classifications Unite's distributor partners hold — placed lower
// on the page (not the hero) and phrased so Unite claims none of these certs.
const DIVERSITY_CLASSES = [
  ['WBE / WOSB', 'Women-Owned'],
  ['MBE', 'Minority-Owned'],
  ['VOSB', 'Veteran-Owned'],
  ['SDVOSB', 'Service-Disabled Veteran-Owned'],
  ['LGBTBE', 'LGBTQ+-Owned'],
  ['DOBE', 'Disability-Owned'],
  ['HUBZone', 'HUBZone'],
  ['8(a) / SDB', 'Small Disadvantaged Business'],
];

export function Procurement() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'A supply partner for diverse businesses · Unite Medical',
    description:
      'Unite Medical helps certified diverse suppliers win and fulfill healthcare contracts. We supply the products and the supply-chain muscle; you carry the relationship and the diversity certification your customers require.',
    canonical: '/procurement',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow="PROCUREMENT · SUPPLIER DIVERSITY"
          title={<>A supply partner for <Grad>diverse businesses</Grad>.</>}
          sub="Unite Medical helps certified diverse suppliers win and fulfill healthcare contracts. We supply the products and the supply-chain muscle; you carry the relationship and the diversity certification your customers require."
        />
        <section style={{ padding: `24px ${padX}px ${isMobile ? 48 : 64}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: isMobile ? 12 : 18 }}>
              {CREDENTIALS.map((c) => (
                <div key={c.label} style={{ borderTop: `2px solid ${D.plum}`, padding: '20px 0' }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{c.label.toUpperCase()}</div>
                  <div style={{ fontFamily: D.display, fontSize: 26, letterSpacing: -0.4, color: D.ink, marginTop: 8, overflowWrap: 'anywhere' }}>{c.val}</div>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{c.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: `${isMobile ? 32 : 48}px ${padX}px ${isMobile ? 56 : 96}px`, background: D.paperAlt, borderTop: `1px solid ${D.line}`, borderBottom: `1px solid ${D.line}` }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <h2 style={{ fontFamily: D.display, fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 400, letterSpacing: -1, lineHeight: 1.1, margin: 0 }}>
              Behind your <Grad>diversity certification</Grad>.
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: D.ink2, marginTop: 18, maxWidth: 760 }}>
              Health systems, GPOs, and government buyers increasingly require supplier-diversity
              spend. Unite Medical sits behind diverse distributors as a reliable, FDA-registered
              product and fulfillment partner — domestic manufacturing, agile sourcing, and
              same-day shipping — so you can confidently bid, win, and deliver. Your
              certification, your customer relationship; our catalog, compliance, and logistics
              doing the heavy lifting.
            </p>
          </div>
        </section>

        {/* Diversity classifications — deliberately below the fold, phrased so
            Unite implies none of these certifications about itself. */}
        <section style={{ padding: `${isMobile ? 48 : 72}px ${padX}px 0` }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 14 }}>WHO WE SUPPORT</div>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: D.ink2, margin: 0, maxWidth: 760 }}>
              We support distributors across the diversity classifications your customers
              track — including:
            </p>
            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 14 }}>
              {DIVERSITY_CLASSES.map(([code, name]) => (
                <div key={code} style={{ padding: '16px 18px', background: D.card, borderRadius: 12, border: `1px solid ${D.line}` }}>
                  <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 0.8, color: D.plum }}>{code}</div>
                  <div style={{ fontSize: 13.5, color: D.ink, marginTop: 6, fontWeight: 500 }}>{name}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: `${isMobile ? 48 : 80}px ${padX}px` }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/documents/Unite_Group_Capability_Statement_2026.pdf" target="_blank" rel="noreferrer" style={{ background: D.plum, color: D.paper, border: 'none', padding: '13px 22px', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              Download capability statement <Icon.arrow />
            </a>
            <button onClick={() => navigate('/contact?reason=Distributor%20program')} style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '12px 22px', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
              Partner with Unite →
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
