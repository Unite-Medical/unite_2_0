// Private label & manufacturing — new/renamed page per spec §4g.
import { Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const capabilities = [
  {
    n: '01',
    h: 'Private label manufacturing',
    p: 'Diagnostics, PPE, orthotics — produced under your brand through our network of vetted domestic and overseas manufacturers, with the QA paperwork to back it up.',
  },
  {
    n: '02',
    h: 'White-label storefronts',
    p: 'See the TJS Recovery Store for the playbook: we build the storefront, manufacture the catalog, fulfill direct to the patient. Your brand on the front, our supply chain behind it.',
  },
  {
    n: '03',
    h: 'Custom packaging & branding',
    p: 'Boxes, inserts, instructional materials, and recovery kits — designed and produced in-house. Single SKU or full launch.',
  },
];

export function ServicePrivateLabel() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Private Label & Manufacturing · Unite Medical',
    description:
      'Private label manufacturing for diagnostics, PPE, and orthotics. White-label storefronts modeled on the Total Joint Specialists Recovery Store. Custom packaging and branding produced in-house.',
    canonical: '/services/private-label',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead
        eyebrow="SERVICE · PRIVATE LABEL & MANUFACTURING"
        title={<>Your brand. <em>Our supply chain.</em></>}
        sub="Diagnostics, PPE, and orthotics made under your label. Storefronts built, stocked, and fulfilled end-to-end. The TJS Recovery Store is the proof."
      />
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: `8px ${padX}px ${isMobile ? 56 : 96}px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 14 : 22 }}>
          {capabilities.map((c) => (
            <div key={c.n} style={{ border: `1px solid ${D.line}`, borderRadius: 16, padding: isMobile ? 22 : 28 }}>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum }}>{c.n}</div>
              <h3 style={{ fontFamily: D.display, fontSize: isMobile ? 22 : 26, letterSpacing: -0.5, margin: '10px 0 12px 0' }}>{c.h}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: D.ink2, margin: 0 }}>{c.p}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: isMobile ? 48 : 72, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/contact?reason=Quote%20%C2%B7%20non-stocked%20%2F%20sourcing" style={{ background: D.plum, color: D.paper, padding: '13px 22px', borderRadius: 4, fontSize: 14, fontWeight: 600 }}>Request samples →</Link>
          <Link to="/case-studies/tjs" style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '12px 22px', borderRadius: 4, fontSize: 14, fontWeight: 500 }}>See the TJS case study →</Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
