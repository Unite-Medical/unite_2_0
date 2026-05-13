import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

// Two-warehouse footprint per spec §4k. SKU counts come from Shopify later;
// sqft awaits real numbers from Alex (Open Question §10.3).
const hubs = [
  { city: 'Lithia Springs, GA', type: 'HQ + main warehouse', skus: '—', sqft: '—', lat: 62, lng: 58 },
  { city: 'Nevada', type: 'West warehouse', skus: '—', sqft: '—', lat: 52, lng: 18 },
];

export function Locations() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Locations — 2 US warehouses, same-day shipping',
    description:
      'Two US warehouses in Georgia and Nevada. Same-day shipping on orders before 2pm EST. Ships to all 50 states and territories.',
    canonical: '/locations',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead eyebrow="2 US WAREHOUSES · NATIONWIDE SHIPPING"
        title={<>Close to <em>every</em> dock.</>}
        sub="Same-day shipping on orders before 2pm EST. Ships to all 50 states and territories." />
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: `24px ${padX}px ${isMobile ? 56 : 64}px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 360px', gap: isMobile ? 18 : 28 }}>
        <div style={{ background: D.paperAlt, borderRadius: 16, border: `1px solid ${D.line}`, position: 'relative', overflow: 'hidden', minHeight: isMobile ? 320 : 520 }}>
          <div style={{ position: 'absolute', inset: 0, background: `
            radial-gradient(circle at 30% 40%, ${D.paper} 0%, transparent 40%),
            radial-gradient(circle at 70% 50%, ${D.paper} 0%, transparent 35%),
            repeating-linear-gradient(45deg, transparent 0 18px, rgba(94,41,99,0.04) 18px 19px)` }} />
          <div style={{ position: 'absolute', top: 24, left: 24, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>COVERAGE · CONUS</div>
          {hubs.map((h, i) => (
            <div key={i} style={{ position: 'absolute', top: `${h.lat}%`, left: `${h.lng}%`, transform: 'translate(-50%,-50%)' }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: D.plum, boxShadow: `0 0 0 8px rgba(94,41,99,.14)` }} />
              <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', background: D.ink, color: D.paper, fontSize: 11, padding: '4px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>{h.city}</div>
            </div>
          ))}
          <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
            <path d="M 58 62 Q 40 20 18 52" fill="none" stroke={D.plum} strokeWidth="0.2" strokeDasharray="1,1" />
            <path d="M 58 62 Q 55 40 40 68" fill="none" stroke={D.plum} strokeWidth="0.2" strokeDasharray="1,1" />
            <path d="M 58 62 L 56 61" fill="none" stroke={D.plum} strokeWidth="0.2" />
          </svg>
        </div>
        <div>
          {hubs.map((h, i) => (
            <div key={i} style={{ padding: 18, background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, marginBottom: 10 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{h.type.toUpperCase()}</div>
              <div style={{ fontFamily: D.display, fontSize: 24, letterSpacing: -0.4, marginTop: 6 }}>{h.city}</div>
              <div style={{ display: 'flex', gap: 24, marginTop: 10, fontSize: 12, color: D.ink2 }}>
                <span>SKUs: {h.skus}</span><span>sqft: {h.sqft}</span>
              </div>
              {/* TODO(alex): real Shopify-driven SKU count + warehouse sqft.
                  Open question §10.2/§10.3. */}
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
