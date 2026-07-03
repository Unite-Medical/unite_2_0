// Careers — simplified to an honest contact page per PRD-29 §6.1.
// No fabricated roles, headcount, or benefit promises; a single
// "get in touch" path. Real postings can come back when they exist.
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const AREAS = ['Engineering', 'Sales', 'Operations', 'Compliance', 'Warehouse'];

export function Careers() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Careers · Unite Medical',
    description:
      'Unite Medical is a veteran-owned medical supply and supply-chain company, always interested in great people — engineering, sales, ops, compliance. Get in touch.',
    canonical: '/careers',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow="CAREERS"
          title={<>Help us run<br /><Grad>like a soldier.</Grad></>}
          sub="We're a veteran-owned medical supply and supply-chain company, always interested in great people — engineering, sales, ops, compliance. Don't see a posting? Reach out anyway."
        />
        <section style={{ padding: `24px ${padX}px ${isMobile ? 56 : 96}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: isMobile ? 32 : 48 }}>
              {AREAS.map((a) => (
                <span key={a} style={{ background: D.card, border: `1px solid ${D.line}`, padding: '8px 16px', borderRadius: 999, fontSize: 13, color: D.ink2 }}>{a}</span>
              ))}
            </div>

            <div style={{ background: D.plum, color: D.paper, borderRadius: 16, padding: isMobile ? 24 : 40, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: isMobile ? 18 : 36, alignItems: 'center' }}>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.5vw, 40px)', fontWeight: 400, letterSpacing: -0.8, lineHeight: 1.05, margin: 0 }}>
                Interested in working with us? Get in touch.
              </h2>
              <div>
                <p style={{ color: D.plumSoft, lineHeight: 1.6, margin: 0 }}>
                  We&apos;re growing, and we hire ahead of postings when the right person walks
                  in. If you&apos;re building a career in healthcare, supply chain, or B2B
                  platforms, we want to hear from you.
                </p>
                <button onClick={() => navigate('/contact')} style={{ marginTop: 18, background: D.paper, color: D.plum, border: 'none', padding: '13px 22px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  Get in touch <Icon.arrow />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
