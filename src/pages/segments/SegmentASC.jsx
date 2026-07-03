// SEO funnel page for Ambulatory Surgery Centers per spec §4r.
// Replaces the prior fake-stat / fake-testimonial implementation.
import { Link } from 'react-router-dom';
import { D } from '../../tokens.js';
import { Nav } from '../../components/layout/Nav.jsx';
import { Footer } from '../../components/layout/Footer.jsx';
import { PageHead } from '../../components/layout/PageHead.jsx';
import { useViewport } from '../../lib/viewport.js';
import { useSEO } from '../../lib/seo.js';

const TAGS = [
  'Surgical gowns',
  'Gloves',
  'Drapes',
  'Orthotics',
  'Wound care',
  'Diagnostic tests',
  'Positioning devices',
];

export function SegmentASC() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Medical Supply for Ambulatory Surgery Centers · Unite Medical',
    description:
      'Procedure-specific products — stocked and shipped same-day, with sourcing for everything else. We supply ASCs of any size, with no minimum orders on stocked items.',
    canonical: '/segments/asc',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead
        eyebrow="SEGMENT · AMBULATORY SURGERY CENTERS"
        title={<>Medical Supply for Ambulatory Surgery Centers</>}
        sub="Procedure-specific products — stocked and shipped same-day, with sourcing for everything else. We supply ASCs of any size, with no minimum orders on stocked items."
      />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: `12px ${padX}px ${isMobile ? 56 : 80}px` }}>
        <h2 style={{ fontFamily: D.display, fontSize: 'clamp(24px, 4vw, 36px)', letterSpacing: -0.6, margin: '24px 0 14px 0' }}>What we supply for ASCs</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {TAGS.map((t) => (
            <span key={t} style={{ background: D.card, border: `1px solid ${D.line}`, padding: '8px 14px', borderRadius: 999, fontSize: 13, color: D.ink2 }}>{t}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap' }}>
          <Link to="/catalog" style={{ background: D.plum, color: D.paper, padding: '13px 22px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>Browse products →</Link>
          <Link to="/quote" style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '12px 22px', borderRadius: 999, fontSize: 14, fontWeight: 500 }}>Source &amp; quote →</Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
