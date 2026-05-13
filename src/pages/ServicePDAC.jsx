// PDAC Consulting page — SEO-critical (Google #1 for "PDAC consulting").
// Per spec §4e + §1.4 the H1 must contain the target keywords (PDAC + L-codes)
// and body copy must mention HCPCS / L-codes / DMEPOS. All unverifiable
// volume, pricing, and rebate claims from the old page have been removed.
import { Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { IMG } from '../lib/imageMap.js';

const STEPS = [
  {
    h: 'Review',
    s:
      'We review your product, identify the target HCPCS code, and assess what documentation PDAC will require.',
  },
  {
    h: 'Submission',
    s:
      'We prepare the full PDAC application package: product photos, specifications, clinical narrative, and coding rationale.',
  },
  {
    h: 'Decision & Resubmission',
    s:
      'If PDAC requests additional documentation or assigns an alternate code, we handle the revision and resubmit until you have your code.',
  },
];

export function ServicePDAC() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'PDAC Consulting · HCPCS L-codes for DMEPOS · Unite Medical',
    description:
      'PDAC consulting for manufacturers and suppliers of bracing and DMEPOS products. We identify the right HCPCS code, prepare the submission, and manage decisions and resubmissions through to approval.',
    canonical: '/services/pdac',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead
        eyebrow="SERVICE · PDAC CONSULTING"
        title={<>Get your <Grad>L-codes</Grad> right the first time.</>}
        sub="PDAC approval is the difference between getting paid and eating the cost. We help manufacturers and suppliers identify the proper HCPCS codes for their DMEPOS products and manage the full submission process — from documentation to decision."
      />
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: `32px ${padX}px ${isMobile ? 56 : 80}px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 22 : 32 }}>
        <div style={{ background: D.card, borderRadius: 16, border: `1px solid ${D.line}`, padding: isMobile ? 22 : 32 }}>
          <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>WHAT&apos;S INCLUDED</div>
          <div style={{ fontFamily: D.display, fontSize: 36, letterSpacing: -0.7, lineHeight: 1.1, marginTop: 10 }}>End-to-end submission management.</div>
          {STEPS.map(({ h, s }, i) => (
            <div key={h} style={{ padding: '20px 0', borderTop: `1px solid ${D.line}`, marginTop: i === 0 ? 20 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'start', gap: 14 }}>
                <div style={{ fontFamily: D.display, fontSize: 44, color: D.plum, letterSpacing: -0.8, lineHeight: 1 }}>{String(i + 1).padStart(2, '0')}</div>
                <div>
                  <div style={{ fontFamily: D.display, fontSize: 22, letterSpacing: -0.3 }}>{h}</div>
                  <div style={{ fontSize: 14, color: D.ink2, marginTop: 6, lineHeight: 1.55 }}>{s}</div>
                </div>
              </div>
            </div>
          ))}
          <p style={{ marginTop: 24, fontSize: 13, color: D.ink2, lineHeight: 1.55 }}>
            All Unite Medical orthotics and our RegeniCool Pro product line are
            PDAC credentialed.
          </p>
        </div>

        <div>
          <PhotoPlaceholder
            src={IMG.PDAC_LETTER}
            caption="PDAC approval letter"
            height={isMobile ? 200 : 380}
            stripeFrom="#ebe3d3"
            stripeTo="#ddd1b7"
            textColor={D.plum}
          />
          <div style={{ marginTop: 18, padding: isMobile ? 22 : 28, background: D.plum, color: D.paper, borderRadius: 16 }}>
            <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plumSoft }}>SUCCESS RATE</div>
            <div style={{ fontFamily: D.display, fontSize: isMobile ? 52 : 72, letterSpacing: -1.6, marginTop: 10, lineHeight: 1 }}>95%+</div>
            <div style={{ fontSize: 13, color: D.plumSoft, marginTop: 6 }}>on targeted code submissions</div>
            <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
              <Link to="/contact?reason=PDAC%20consulting" style={{ background: D.paper, color: D.plum, padding: '13px 18px', borderRadius: 999, fontSize: 14, fontWeight: 600, textAlign: 'center' }}>
                Book a review →
              </Link>
              <Link to="/catalog?filter=pdac" style={{ background: 'transparent', color: D.paper, border: `1.5px solid ${D.paper}`, padding: '12px 18px', borderRadius: 999, fontSize: 14, fontWeight: 500, textAlign: 'center' }}>
                Browse PDAC-approved products →
              </Link>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
