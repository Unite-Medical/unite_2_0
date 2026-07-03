import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { IMG } from '../lib/imageMap.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

// Single-warehouse footprint per PRD-28 §3.6 — Lithia Springs, GA only.
// SKU counts intentionally removed; square footage confirmed by Damon.
const HUB = {
  city: 'Lithia Springs, GA',
  type: 'HQ + warehouse',
  sqft: 'Over 10,000 sq ft',
  img: IMG.WAREHOUSE_GA,
};

/* ------------------------------------------------------------------ */
/* Hub-and-spoke US map (PRD-28 §5.5) — real state geography, GA as    */
/* origin, spokes radiating to all 50 states. Approximate state        */
/* centroids projected onto the viewBox; AK + HI drawn as insets.      */
/* ------------------------------------------------------------------ */
const STATE_CENTROIDS = {
  AL: [32.8, -86.8], AZ: [34.3, -111.7], AR: [34.8, -92.4], CA: [37.2, -119.3],
  CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5], FL: [28.6, -82.4],
  GA: [32.6, -83.4], ID: [44.4, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3],
  IA: [42.0, -93.5], KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.1, -92.0],
  ME: [45.4, -69.2], MD: [39.0, -76.8], MA: [42.3, -71.8], MI: [44.3, -85.4],
  MN: [46.3, -94.3], MS: [32.7, -89.7], MO: [38.4, -92.5], MT: [47.0, -109.6],
  NE: [41.5, -99.8], NV: [39.3, -116.6], NH: [43.7, -71.6], NJ: [40.2, -74.7],
  NM: [34.4, -106.1], NY: [42.9, -75.5], NC: [35.5, -79.4], ND: [47.4, -100.5],
  OH: [40.3, -82.8], OK: [35.6, -97.5], OR: [43.9, -120.6], PA: [40.9, -77.8],
  RI: [41.7, -71.6], SC: [33.9, -80.9], SD: [44.4, -100.2], TN: [35.9, -86.4],
  TX: [31.5, -99.3], UT: [39.3, -111.7], VT: [44.1, -72.7], VA: [37.5, -78.9],
  WA: [47.4, -120.4], WV: [38.6, -80.6], WI: [44.6, -89.7], WY: [43.0, -107.6],
};

// Equirectangular-ish projection into a 100×62 viewBox (lower 48).
function project([lat, lng]) {
  const x = ((lng + 125) / 59) * 96 + 2;
  const y = ((50.5 - lat) / 26.5) * 52 + 4;
  return [x, y];
}

// AK + HI drawn as conventional bottom-left insets.
const INSETS = { AK: [8, 54], HI: [20, 57] };

function USHubSpokeMap({ isMobile }) {
  const [hubX, hubY] = project(STATE_CENTROIDS.GA);
  const spokeTargets = [
    ...Object.entries(STATE_CENTROIDS).filter(([k]) => k !== 'GA').map(([k, c]) => [k, ...project(c)]),
    ...Object.entries(INSETS).map(([k, [x, y]]) => [k, x, y]),
  ];
  return (
    <div style={{ background: D.paperAlt, borderRadius: 16, border: `1px solid ${D.line}`, position: 'relative', overflow: 'hidden', minHeight: isMobile ? 320 : 520, display: 'flex' }}>
      <div style={{ position: 'absolute', top: 24, left: 24, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum, zIndex: 1 }}>SHIPPING · ALL 50 STATES</div>
      <div style={{ position: 'absolute', bottom: 18, left: 24, fontFamily: D.mono, fontSize: 9, letterSpacing: 0.8, color: D.ink3, zIndex: 1 }}>
        ORIGIN · LITHIA SPRINGS, GA{'  '}·{'  '}AK + HI SERVED
      </div>
      <svg viewBox="0 0 100 62" style={{ width: '100%', height: '100%', alignSelf: 'stretch' }} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Distribution map: spokes from the Lithia Springs, Georgia warehouse to all 50 states">
        {/* Spokes — one per state, radiating from the GA hub */}
        {spokeTargets.map(([k, x, y]) => (
          <line key={`l-${k}`} x1={hubX} y1={hubY} x2={x} y2={y} stroke={D.plum} strokeWidth="0.14" strokeDasharray="0.9,0.7" opacity="0.45" />
        ))}
        {/* State dots */}
        {spokeTargets.map(([k, x, y]) => (
          <g key={`d-${k}`}>
            <circle cx={x} cy={y} r="0.55" fill={D.plum} opacity="0.75" />
            <text x={x} y={y - 1.1} textAnchor="middle" fontSize="1.5" fill={D.ink3} fontFamily={D.mono}>{k}</text>
          </g>
        ))}
        {/* GA hub */}
        <circle cx={hubX} cy={hubY} r="2.6" fill={D.plum} opacity="0.18">
          <animate attributeName="r" values="2.2;3.2;2.2" dur="2.6s" repeatCount="indefinite" />
        </circle>
        <circle cx={hubX} cy={hubY} r="1.1" fill={D.plum} />
        <text x={hubX} y={hubY + 3.4} textAnchor="middle" fontSize="1.8" fontWeight="700" fill={D.ink} fontFamily={D.mono}>GA · HUB</text>
      </svg>
    </div>
  );
}

export function Locations() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Locations — one Georgia warehouse, every zip code',
    description:
      'Our Lithia Springs, Georgia warehouse ships to all 50 states and territories — same-day on orders placed before 2pm EST.',
    canonical: '/locations',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead eyebrow="GEORGIA WAREHOUSE · WE SHIP NATIONWIDE"
        title={<>One warehouse. <em>Every</em> zip code.</>}
        sub="Our Lithia Springs, Georgia warehouse ships to all 50 states and territories — same-day on orders placed before 2pm EST." />
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: `24px ${padX}px ${isMobile ? 56 : 64}px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 360px', gap: isMobile ? 18 : 28 }}>
        <USHubSpokeMap isMobile={isMobile} />
        <div>
          <div className="um-card" style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, marginBottom: 10, overflow: 'hidden' }}>
            <PhotoPlaceholder
              src={HUB.img}
              alt={`${HUB.type} — ${HUB.city}`}
              caption={HUB.city.toLowerCase()}
              height={isMobile ? 160 : 170}
              stripeFrom="#ebe3d3" stripeTo="#ddd1b7" textColor={D.plum}
            />
            <div style={{ padding: 18 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{HUB.type.toUpperCase()}</div>
              <div style={{ fontFamily: D.display, fontSize: 24, letterSpacing: -0.4, marginTop: 6 }}>{HUB.city}</div>
              <div style={{ display: 'flex', gap: 24, marginTop: 10, fontSize: 12, color: D.ink2 }}>
                <span>{HUB.sqft}</span>
              </div>
            </div>
          </div>
          <div style={{ background: D.paperAlt, borderRadius: 12, border: `1px solid ${D.line}`, padding: 18 }}>
            <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>SHIPPING</div>
            <div style={{ fontSize: 13.5, color: D.ink2, marginTop: 8, lineHeight: 1.6 }}>
              Same-day on stocked orders before 2pm EST. All 50 states and territories, every
              major carrier. 1487 Trae Lane, Lithia Springs, GA 30122.
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
