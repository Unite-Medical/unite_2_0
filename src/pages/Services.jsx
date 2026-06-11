import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { SERVICE_IMG } from '../lib/imageMap.js';
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
        <div style={{ display: 'grid', gap: isMobile ? 16 : 28 }}>
          {services.map((s, i) => {
            const flip = i % 2 === 1;
            return (
              <div
                key={i}
                className="um-card"
                style={{
                  background: D.card, borderRadius: isMobile ? 20 : 28,
                  border: `1px solid ${D.line}`, overflow: 'hidden',
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : flip ? '1fr 1.1fr' : '1.1fr 1fr',
                  alignItems: 'stretch',
                }}
              >
                <div style={{ order: isMobile ? 0 : flip ? 2 : 0, minHeight: isMobile ? 200 : 340 }}>
                  <PhotoPlaceholder
                    src={SERVICE_IMG[i]}
                    alt={s.name}
                    caption={s.name.toLowerCase()}
                    height="100%"
                    stripeFrom="#ebe3d3" stripeTo="#ddd1b7" textColor={D.plum}
                  />
                </div>
                <div style={{
                  order: 1,
                  padding: isMobile ? 24 : '48px 56px',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  alignItems: 'flex-start', position: 'relative',
                }}>
                  <div aria-hidden="true" style={{
                    position: 'absolute', top: isMobile ? -2 : 8, right: isMobile ? 12 : 24,
                    fontFamily: D.display, fontSize: isMobile ? 80 : 140, lineHeight: 1,
                    color: 'rgba(94,41,99,.08)', letterSpacing: '-0.05em', userSelect: 'none',
                  }}>{String(i + 1).padStart(2, '0')}</div>
                  <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>{String(i + 1).padStart(2, '0')}</div>
                  <div style={{ fontFamily: D.display, fontSize: isMobile ? 28 : 42, letterSpacing: '-0.02em', lineHeight: 1.05, marginTop: 12, position: 'relative' }}>{s.name}</div>
                  <div style={{ fontSize: isMobile ? 14 : 16, color: D.ink2, marginTop: 14, lineHeight: 1.6, maxWidth: 480, position: 'relative' }}>{s.sub}</div>
                  <button onClick={() => navigate(s.path)} style={{ background: D.ink, color: D.paper, border: 'none', padding: isMobile ? '12px 22px' : '14px 26px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 24, fontFamily: D.sans, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    {s.cta} <Icon.arrow />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Footer />
    </div>
  );
}
