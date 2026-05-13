import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

// Four cards per spec §4c. Education & Certification card removed.
// Government promoted to its own primary nav item at /government.
const services = [
  {
    name: 'Distribution & Fulfillment',
    sub: 'Same-day shipping · 2 US warehouses · Ships to all 50 states + territories',
    cta: 'See coverage',
    path: '/services/distribution',
  },
  {
    name: 'PDAC Consulting',
    sub: 'Medicare billing code consulting for bracing + DME',
    cta: 'Book a review',
    path: '/services/pdac',
  },
  {
    name: 'Quoting & Sourcing',
    sub:
      'Source non-stock items from our vetted manufacturer network. Real-time pricing, landed cost, compliance verified.',
    cta: 'Start a quote',
    path: '/quote',
  },
  {
    name: 'Distributor Program',
    sub: 'White-label, drop-ship, and FDA-registered import partner for regional distributors',
    cta: 'Learn more',
    path: '/services/distributors',
  },
];

export function Services() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Services — distribution, PDAC, quoting, distributor program',
    description:
      'Beyond the catalog: nationwide distribution, Medicare PDAC consulting, sourcing & quoting from our vetted manufacturer network, and a distributor program for regional partners.',
    canonical: '/services',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead eyebrow="SERVICES · BEYOND THE CATALOG"
        title={<>More than <Grad>a supplier</Grad>.</>}
        sub="Distribution, PDAC consulting, private-label manufacturing, and a sourcing platform. Built because our customers kept asking us to do more." />
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: `24px ${padX}px ${isMobile ? 56 : 80}px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,1fr)', gap: 14 }}>
          {services.map((s, i) => (
            <div key={i} style={{ background: D.card, borderRadius: 16, border: `1px solid ${D.line}`, padding: isMobile ? 22 : 32, display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 16 : 24, flexDirection: isMobile ? 'column' : 'row' }}>
              <div style={{ fontFamily: D.display, fontSize: isMobile ? 44 : 64, color: D.plum, letterSpacing: -1, minWidth: isMobile ? 0 : 80, lineHeight: 1 }}>{String(i + 1).padStart(2, '0')}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 24 : 30, letterSpacing: -0.6, lineHeight: 1.15 }}>{s.name}</div>
                <div style={{ fontSize: 14, color: D.ink2, marginTop: 8 }}>{s.sub}</div>
              </div>
              <button onClick={() => navigate(s.path)} style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '12px 20px', borderRadius: 999, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: isMobile ? 'stretch' : 'center', textAlign: 'center' }}>{s.cta} →</button>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
