// Procurement & Supplier Diversity page — replaces the old
// /about/veteran-owned page per spec §4i. Vercel 301s
// /about/veteran-owned → /procurement at the edge.
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const CREDENTIALS = [
  { label: 'Veteran-Owned', val: 'DD214 Verified', sub: 'ID.me verified, CAGE 8MK70' },
  { label: 'CAGE', val: '8MK70', sub: 'Federal contracting identifier' },
  { label: 'DUNS', val: '117553945', sub: 'SAM.gov registered' },
  { label: 'FDA', val: '3015727296', sub: 'Establishment registration' },
];

export function Procurement() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Procurement & Supplier Diversity · Unite Medical',
    description:
      'Veteran-owned wholesale medical supply. A single vendor relationship that contributes to your supplier diversity targets through certified woman-owned, minority-owned, and SDVOSB suppliers behind our catalog.',
    canonical: '/procurement',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow="PROCUREMENT · SUPPLIER DIVERSITY"
          title={<>For procurement & diversity officers.</>}
          sub="Unite Medical helps health systems, government buyers, and GPOs meet supplier diversity requirements through a single vendor relationship. Veteran-owned, with a network of certified woman-owned, minority-owned, and SDVOSB suppliers behind our catalog."
        />
        <section style={{ padding: `24px ${padX}px ${isMobile ? 48 : 64}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 12 : 18 }}>
              {CREDENTIALS.map((c) => (
                <div key={c.label} style={{ borderTop: `2px solid ${D.plum}`, padding: '20px 0' }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{c.label.toUpperCase()}</div>
                  <div style={{ fontFamily: D.display, fontSize: 26, letterSpacing: -0.4, color: D.ink, marginTop: 8 }}>{c.val}</div>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{c.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: `${isMobile ? 32 : 48}px ${padX}px ${isMobile ? 56 : 96}px`, background: D.paperAlt, borderTop: `1px solid ${D.line}`, borderBottom: `1px solid ${D.line}` }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <h2 style={{ fontFamily: D.display, fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 400, letterSpacing: -1, lineHeight: 1.1, margin: 0 }}>
              A diversity supply network <Grad>behind</Grad> the catalog.
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: D.ink2, marginTop: 18, maxWidth: 760 }}>
              We work with certified woman-owned, minority-owned, and SDVOSB suppliers.
              Spend with Unite can support your organization&apos;s supplier diversity
              targets through a single, accountable vendor relationship.
            </p>
          </div>
        </section>

        <section style={{ padding: `${isMobile ? 48 : 80}px ${padX}px` }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/contact?reason=Document%20request')} style={{ background: D.plum, color: D.paper, border: 'none', padding: '13px 22px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              Download capability statement <Icon.arrow />
            </button>
            <button onClick={() => navigate('/contact')} style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '12px 22px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
              Contact procurement team →
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
