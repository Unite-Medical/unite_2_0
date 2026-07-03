// Distributor Program — renamed from /services/dealer per spec §4f.
// The Vercel config 301-redirects the old URL; this is the canonical page.
import { Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { SERVICE_IMG } from '../lib/imageMap.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

// Cards 01/02 per PRD-29 §2.3 — catalog exposure is explicitly OPT-IN in
// both directions (their products in our catalog, our products to their
// customers).
const cards = [
  {
    n: '01',
    h: '3PL & Warehousing',
    p:
      'We stock and ship your products from our facilities — your inventory lives in our warehouse and ships on your schedule, like it\u2019s your own. Optionally, list your products in our catalog to reach new buyers. Manage it all from your own distributor dashboard: stock levels, orders, shipments, and reporting, as if you owned the warehouse.',
    cta: 'Learn more →',
    to: '/contact?reason=Distributor%20program',
  },
  {
    n: '02',
    h: 'Drop-Ship Integration',
    p:
      'Integrate our catalog into your site and we fulfill on your behalf — blind-shipped, discreetly, under your brand. Your customers never see us. Offering our catalog to your customers is optional — you control what you list and what stays private. Track every order from your distributor dashboard in real time.',
    cta: 'Request integration details →',
    to: '/contact?reason=Distributor%20program',
  },
  {
    n: '03',
    h: 'Wholesale',
    p:
      'Buy from our stocked inventory at wholesale pricing. We ship to you or blind-ship directly to your customers. No minimums on stocked items.',
    cta: 'Browse wholesale catalog →',
    to: '/catalog',
  },
  {
    n: '04',
    h: 'Custom Sourcing',
    p:
      'Need products we don\u2019t stock? Use our quoting engine to source from our vetted manufacturer network — get an all-in landed price with compliance handled.',
    cta: 'Start a quote →',
    to: '/quote',
  },
];

export function ServiceDistributors() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Distributor Program · Unite Medical',
    description:
      'Distribution, fulfillment, and sourcing for regional medical distributors. 3PL, drop-ship integration, wholesale, and custom sourcing — a logistics partner, not a competitor.',
    canonical: '/services/distributors',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead
        eyebrow="SERVICE · DISTRIBUTOR PROGRAM"
        title={<>Your catalog. <em>Our import desk.</em></>}
        sub="Distribution, fulfillment, and sourcing for regional distributors who need a logistics partner they can trust — not a competitor."
        right={
          <PhotoPlaceholder
            src={SERVICE_IMG[3]}
            alt="Shrink-wrapped pallet being loaded onto a box truck at a loading dock"
            caption="dock, end of day"
            height={isMobile ? 220 : 360}
            stripeFrom="#e8ddcd" stripeTo="#d9c8b0" textColor={D.plum}
            radius={16}
            eager
          />
        }
      />
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: `8px ${padX}px ${isMobile ? 56 : 96}px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 14 : 20 }}>
          {cards.map((c) => (
            <div key={c.n} style={{ border: `1px solid ${D.line}`, borderRadius: 16, padding: isMobile ? 22 : 32 }}>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum }}>{c.n}</div>
              <h3 style={{ fontFamily: D.display, fontSize: isMobile ? 22 : 28, letterSpacing: -0.5, margin: '10px 0 12px 0' }}>{c.h}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: D.ink2, margin: 0 }}>{c.p}</p>
              <Link to={c.to} style={{ display: 'inline-block', marginTop: 16, fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum }}>{c.cta}</Link>
            </div>
          ))}
        </div>

        {/* Distributor Dashboard showcase (PRD-29 §2.3.3) — maps to the
            existing DistributorPortal at /distributor. */}
        <div style={{ marginTop: isMobile ? 20 : 28, background: D.plum, color: D.paper, borderRadius: 16, padding: isMobile ? 26 : 40, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: isMobile ? 20 : 40, alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1.2, color: D.plumSoft }}>THE DISTRIBUTOR DASHBOARD</div>
            <h3 style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 36, letterSpacing: -0.7, lineHeight: 1.1, margin: '12px 0 0' }}>
              Run your business like you own the warehouse.
            </h3>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: D.plumSoft, margin: '14px 0 0' }}>
              Every distributor gets a custom dashboard to manage inventory, place and track
              orders, handle drop-ship and blind-ship fulfillment, pull reporting, and control
              exactly which products you list — and which of ours you offer your customers.
              Full visibility, full control, zero warehouse overhead.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <Link to="/contact?reason=Distributor%20program" style={{ background: D.paper, color: D.plum, padding: '13px 18px', borderRadius: 999, fontSize: 14, fontWeight: 600, textAlign: 'center' }}>
              Request a dashboard demo →
            </Link>
            <Link to="/distributor" style={{ background: 'transparent', color: D.paper, border: `1.5px solid ${D.paper}`, padding: '12px 18px', borderRadius: 999, fontSize: 14, fontWeight: 500, textAlign: 'center' }}>
              Distributor login →
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
