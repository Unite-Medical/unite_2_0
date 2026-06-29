import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const ROLES = [
  { title: 'Senior Backend Engineer · Quoting Engine', dept: 'Engineering', loc: 'Lithia Springs, GA · or remote', type: 'Full-time' },
  { title: 'Account Executive · ASCs (Southeast)', dept: 'Sales', loc: 'Atlanta, GA', type: 'Full-time · 1099 OK' },
  { title: 'Compliance Lead · FDA + GUDID', dept: 'Operations', loc: 'Lithia Springs, GA', type: 'Full-time' },
  { title: 'Government Capture Manager', dept: 'Sales', loc: 'Remote · DC preferred', type: 'Full-time' },
  { title: 'Brand Designer', dept: 'Marketing', loc: 'Atlanta, GA · hybrid', type: 'Full-time' },
];

export function Careers() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Careers — build with us',
    description:
      'Open roles at Unite Medical: engineering, sales, ops, compliance, government capture, design. Veteran-owned, remote-friendly.',
    canonical: '/careers',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow="CAREERS · BUILD WITH US"
          title={<>Help us run<br /><Grad>like a soldier.</Grad></>}
          sub="We're 60-something people on three coasts, building the operating system for American medical supply. Come ship something that ends up on a hospital floor."
        />
        <section style={{ padding: `24px ${padX}px ${isMobile ? 56 : 96}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
              {[['$0', 'Co-pay healthcare'], ['Vested', 'Equity from day one'], ['12 wk', 'Parental leave'], ['Unlimited', 'PTO (we mean it)']].map(([b, s]) => (
                <div key={s} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, padding: 22 }}>
                  <div style={{ fontFamily: D.display, fontSize: 32, color: D.plum, letterSpacing: -0.5 }}>{b}</div>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginTop: 8 }}>{s.toUpperCase()}</div>
                </div>
              ))}
            </div>

            <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 14 }}>OPEN ROLES · {ROLES.length}</div>
            <div style={{ background: D.card, borderRadius: 14, border: `1px solid ${D.line}`, overflow: 'hidden' }}>
              {ROLES.map((r, i) => (
                <div key={r.title} style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr auto' : '2fr 1fr 1.4fr 1fr auto',
                  gap: isMobile ? 10 : 16,
                  alignItems: isMobile ? 'start' : 'center',
                  padding: isMobile ? '18px 18px' : '20px 24px',
                  borderTop: i === 0 ? 'none' : `1px solid ${D.line}`,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: D.display, fontSize: isMobile ? 18 : 20, letterSpacing: -0.3, lineHeight: 1.2 }}>{r.title}</div>
                    {isMobile && <div style={{ fontSize: 12, color: D.ink2, marginTop: 6 }}>{r.dept} · {r.loc}</div>}
                    {isMobile && <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum, marginTop: 4 }}>{r.type.toUpperCase()}</div>}
                  </div>
                  {!isMobile && <div style={{ fontSize: 13, color: D.ink2 }}>{r.dept}</div>}
                  {!isMobile && <div style={{ fontSize: 13, color: D.ink2 }}>{r.loc}</div>}
                  {!isMobile && <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum }}>{r.type.toUpperCase()}</div>}
                  <button onClick={() => navigate('/contact')} style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '9px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, alignSelf: 'center' }}>Apply →</button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: isMobile ? 40 : 64, background: D.plum, color: D.paper, borderRadius: 16, padding: isMobile ? 24 : 40, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: isMobile ? 18 : 36, alignItems: 'center' }}>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.5vw, 40px)', fontWeight: 400, letterSpacing: -0.8, lineHeight: 1.05, margin: 0 }}>
                Don&apos;t see your role? Send a note anyway.
              </h2>
              <div>
                <p style={{ color: D.plumSoft, lineHeight: 1.6, margin: 0 }}>We hire ahead of postings when the right person walks in. If you&apos;re building careers in healthcare, supply chain, or B2B platforms, we want to hear from you.</p>
                <button onClick={() => navigate('/contact')} style={{ marginTop: 18, background: D.paper, color: D.plum, border: 'none', padding: '13px 22px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  Open application <Icon.arrow />
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
