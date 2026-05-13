// Total Joint Specialists patient recovery store case study — new page per spec §4s.
import { Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const sections = [
  {
    h: 'The challenge',
    p: 'Total Joint Specialists, one of the most respected orthopedic groups in the country, needed a patient-facing e-commerce store for post-surgical recovery products — without standing up an internal supply-chain or fulfillment team.',
  },
  {
    h: 'The solution',
    p: 'Unite built the store from scratch, manufactures the bracing and recovery products under the TJS label, integrates with Force Therapeutics for the patient pathway, and fulfills every order direct-to-patient from our Georgia warehouse.',
  },
  {
    h: 'The result',
    p: 'A live, branded recovery store at tjs.unitemedical.net/store. Same-day processing on orders. Patients flow through one funnel; their surgeon\u2019s brand stays on every touchpoint.',
  },
];

export function CaseStudyTJS() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Case Study — Total Joint Specialists Patient Recovery Store · Unite Medical',
    description:
      'How Unite built, stocked, and fulfills a complete patient recovery e-commerce store for Total Joint Specialists. Private-label manufacturing plus direct-to-patient fulfillment.',
    canonical: '/case-studies/tjs',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead
        eyebrow="CASE STUDY · PARTNER SPOTLIGHT"
        title={<>Total Joint Specialists Patient Recovery Store.</>}
        sub="How Unite built, stocked, and fulfills a complete patient recovery e-commerce store for one of the most respected orthopedic groups in the country."
      />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: `8px ${padX}px ${isMobile ? 56 : 96}px` }}>
        {sections.map((s) => (
          <section key={s.h} style={{ marginTop: isMobile ? 36 : 56 }}>
            <h2 style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 36, letterSpacing: -0.6, margin: '0 0 14px 0' }}>{s.h}</h2>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: D.ink2, margin: 0 }}>{s.p}</p>
          </section>
        ))}

        <div style={{ marginTop: isMobile ? 48 : 72, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a
            href="https://tjs.unitemedical.net/store"
            target="_blank"
            rel="noreferrer"
            style={{ background: D.plum, color: D.paper, padding: '13px 22px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}
          >
            Visit the TJS Recovery Store →
          </a>
          <Link
            to="/services/private-label"
            style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '12px 22px', borderRadius: 999, fontSize: 14, fontWeight: 500 }}
          >
            Learn about private label & manufacturing →
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
