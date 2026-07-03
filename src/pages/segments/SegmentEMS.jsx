// SEO funnel page for EMS & first responders per spec §4r.
import { Link } from 'react-router-dom';
import { D } from '../../tokens.js';
import { Nav } from '../../components/layout/Nav.jsx';
import { Footer } from '../../components/layout/Footer.jsx';
import { PageHead } from '../../components/layout/PageHead.jsx';
import { useViewport } from '../../lib/viewport.js';
import { useSEO } from '../../lib/seo.js';

const TAGS = [
  'Trauma supplies',
  'PPE bundles',
  'Gloves',
  'Masks',
  'Diagnostic kits',
  'Wound care',
  'Splints',
];

export function SegmentEMS() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Medical Supply for EMS & First Responders · Unite Medical',
    description:
      'PPE, trauma supplies, and restock essentials sourced and shipped nationwide. If you need it in the field, we can source it.',
    canonical: '/segments/ems',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead
        eyebrow="SEGMENT · EMS & FIRST RESPONDERS"
        title={<>Medical Supply for EMS & First Responders</>}
        sub="PPE, trauma supplies, and restock essentials sourced and shipped nationwide. If you need it in the field, we can source it."
      />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: `12px ${padX}px ${isMobile ? 56 : 80}px` }}>
        <h2 style={{ fontFamily: D.display, fontSize: 'clamp(24px, 4vw, 36px)', letterSpacing: -0.6, margin: '24px 0 14px 0' }}>What we supply for EMS</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {TAGS.map((t) => (
            <span key={t} style={{ background: D.card, border: `1px solid ${D.line}`, padding: '8px 14px', borderRadius: 4, fontSize: 13, color: D.ink2 }}>{t}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap' }}>
          <Link to="/catalog" style={{ background: D.plum, color: D.paper, padding: '13px 22px', borderRadius: 4, fontSize: 14, fontWeight: 600 }}>Browse products →</Link>
          <Link to="/quote" style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '12px 22px', borderRadius: 4, fontSize: 14, fontWeight: 500 }}>Source &amp; quote →</Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
