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

// Service cards per PRD-28 §3.2 — single Georgia warehouse, approved quoting
// copy, plus the Restore Robotics and Diagnostics flagship cards.
const services = [
  {
    name: 'Distribution & Fulfillment',
    sub: 'Same-day shipping · Georgia warehouse · Ships to all 50 states + territories',
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
      'Tell us what you need and get an instant, fully landed, compliance-checked quote — sourced from our vetted manufacturer network.',
    cta: 'Start a quote',
    path: '/quote',
  },
  {
    name: 'Distributor Program',
    sub: 'White-label, drop-ship, and FDA-registered import partner for regional distributors',
    cta: 'Learn more',
    path: '/services/distributors',
  },
  {
    name: 'Restore Robotics',
    sub: 'FDA 510(k)-cleared remanufactured da Vinci instruments — 20\u201325% savings for hospital systems, manufacturer-of-record warranty.',
    cta: 'Explore the program',
    path: '/robotics',
  },
  {
    name: 'Diagnostic Tests',
    sub: 'Every major brand of point-of-care and OTC tests — wholesale, retail EDI, bulk, and private label. Don\u2019t see your brand? Just ask.',
    cta: 'See diagnostics',
    path: '/diagnostics',
  },
];

export function Services() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Services — distribution, PDAC, quoting, distributors, robotics, diagnostics',
    description:
      'Beyond the catalog: nationwide distribution from our Georgia warehouse, Medicare PDAC consulting, instant compliance-checked quoting, a distributor program, the Restore Robotics instrument program, and diagnostics supply.',
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
                    color: 'rgba(29,92,77,.08)', letterSpacing: '-0.05em', userSelect: 'none',
                  }}>{String(i + 1).padStart(2, '0')}</div>
                  <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>{String(i + 1).padStart(2, '0')}</div>
                  <div style={{ fontFamily: D.display, fontSize: isMobile ? 28 : 42, letterSpacing: '-0.02em', lineHeight: 1.05, marginTop: 12, position: 'relative' }}>{s.name}</div>
                  <div style={{ fontSize: isMobile ? 14 : 16, color: D.ink2, marginTop: 14, lineHeight: 1.6, maxWidth: 480, position: 'relative' }}>{s.sub}</div>
                  <button onClick={() => navigate(s.path)} style={{ background: D.ink, color: D.paper, border: 'none', padding: isMobile ? '12px 22px' : '14px 26px', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 24, fontFamily: D.sans, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    {s.cta} <Icon.arrow />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* PDAC value band — flat, factual, reimbursement-first */}
      <div style={{ background: D.inkDeep, color: D.paper, padding: `${isMobile ? 64 : 110}px ${padX}px` }}>
        <div style={{
          maxWidth: 1360, margin: '0 auto',
          display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1fr',
          gap: isMobile ? 36 : 80, alignItems: 'start',
        }}>
          <div>
            <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: '#9dbcae', marginBottom: 16 }}>PDAC & REIMBURSEMENT</div>
            <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.6vw, 52px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.06, margin: 0 }}>
              Most braces stall at Medicare review. <Grad>Ours arrive billable.</Grad>
            </h2>
            <p style={{ fontSize: isMobile ? 14.5 : 16, lineHeight: 1.65, color: 'rgba(243,242,235,.78)', marginTop: 18, maxWidth: 520 }}>
              Every product in our Unite Medical orthopedic line is PDAC-approved and carries
              verified HCPCS L-coding. The code travels with the SKU — on the listing and on
              your invoice — so your bracing claims are ready to bill.
            </p>
          </div>
          <div>
            {/* Stats scoped to the Unite Medical bracing line (PRD-28 §3.2) —
                no audit-SLA claims. */}
            {[
              { stat: '100%', label: 'PDAC-approved Unite Medical bracing line', sub: 'Every Unite Medical orthosis is PDAC-approved.' },
              { stat: 'L-codes', label: 'On the listing and the invoice', sub: 'Verified HCPCS L-code carried per Unite Medical bracing SKU and passed through to your invoice.' },
              { stat: 'Per SKU', label: 'PDAC approval letter on file', sub: 'Download the current PDAC approval letter from any Unite Medical bracing product page.' },
            ].map((f, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: isMobile ? '100px 1fr' : '140px 1fr',
                gap: isMobile ? 16 : 28, alignItems: 'baseline',
                padding: `${isMobile ? 20 : 26}px 0`,
                borderTop: '1px solid rgba(243,242,235,.18)',
              }}>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 34, letterSpacing: '-0.02em', color: '#9dbcae', lineHeight: 1.05 }}>{f.stat}</div>
                <div>
                  <div style={{ fontSize: isMobile ? 14.5 : 15.5, fontWeight: 600 }}>{f.label}</div>
                  <div style={{ fontSize: isMobile ? 13 : 13.5, lineHeight: 1.6, color: 'rgba(243,242,235,.7)', marginTop: 6 }}>{f.sub}</div>
                </div>
              </div>
            ))}
            <div style={{ borderTop: '1px solid rgba(243,242,235,.18)' }} />
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
