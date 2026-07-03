// SEO funnel page for regional medical distributors per spec §4r.
// Funnels to /services/distributors (the program page) and /quote.
import { Link } from 'react-router-dom';
import { D } from '../../tokens.js';
import { Nav } from '../../components/layout/Nav.jsx';
import { Footer } from '../../components/layout/Footer.jsx';
import { PageHead } from '../../components/layout/PageHead.jsx';
import { useViewport } from '../../lib/viewport.js';
import { useSEO } from '../../lib/seo.js';

export function SegmentDealers() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Sourcing & Fulfillment for Regional Medical Distributors · Unite Medical',
    description:
      'Expand your catalog without the import overhead. We source, warehouse, and blind-ship on your behalf — or sell you wholesale from our stocked inventory.',
    canonical: '/segments/distributors',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead
        eyebrow="SEGMENT · REGIONAL DISTRIBUTORS"
        title={<>Sourcing &amp; Fulfillment for Regional Medical Distributors</>}
        sub="Expand your catalog without the import overhead. We source, warehouse, and blind-ship on your behalf — or sell you wholesale from our stocked inventory."
      />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: `12px ${padX}px ${isMobile ? 56 : 80}px` }}>
        <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
          <Link to="/services/distributors" style={{ background: D.plum, color: D.paper, padding: '13px 22px', borderRadius: 4, fontSize: 14, fontWeight: 600 }}>Learn about our distributor program →</Link>
          <Link to="/quote" style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '12px 22px', borderRadius: 4, fontSize: 14, fontWeight: 500 }}>Source &amp; quote →</Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
