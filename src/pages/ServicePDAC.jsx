// PDAC Consulting page — SEO-critical (Google #1 for "PDAC consulting").
// Fresh copy per PRD-28 §3.2: DME + orthotics ONLY (never the full "DMEPOS"),
// with the no-reimbursement-guarantee disclaimer. Consulting (helping others
// code) is kept clearly separate from Unite's own PDAC-approved line.
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
      'If PDAC requests additional documentation, we handle the revision and resubmit. Coding decisions rest with PDAC — we manage the process to give your product its best shot at the right code.',
  },
];

export function ServicePDAC() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'PDAC Consulting · HCPCS coding for DME and orthotics · Unite Medical',
    description:
      'Unite Medical helps manufacturers and suppliers identify the correct HCPCS code for their durable medical equipment (DME) and orthotics before billing Medicare — guided through PDAC coding verification so products are coded correctly and audit-ready.',
    canonical: '/services/pdac',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead
        eyebrow="SERVICE · PDAC CONSULTING"
        title={<>Get your <Grad>DME and orthotics</Grad> coded right.</>}
        sub="Unite Medical helps manufacturers and suppliers identify the correct HCPCS code for their durable medical equipment (DME) and orthotics before billing Medicare. Many of these items require a coding verification review by the PDAC contractor — and claims are denied when products aren't on the PDAC Product Classification List. We guide you through verification so your products are coded correctly and audit-ready."
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
            Separately from consulting: all Unite Medical orthotics and our RegeniCool™ Pro
            product line carry their own PDAC approval.
          </p>
          <p style={{ marginTop: 12, fontSize: 12, color: D.ink3, lineHeight: 1.55, fontStyle: 'italic' }}>
            Unite Medical makes no guarantee of reimbursement; medical necessity and payer
            documentation requirements remain the customer&apos;s responsibility.
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
            radius={16}
          />
          <div style={{ marginTop: 18, padding: isMobile ? 22 : 28, background: D.plum, color: D.paper, borderRadius: 16 }}>
            <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plumSoft }}>SUCCESS RATE</div>
            <div style={{ fontFamily: D.display, fontSize: isMobile ? 52 : 72, letterSpacing: -1.6, marginTop: 10, lineHeight: 1 }}>95%+</div>
            <div style={{ fontSize: 13, color: D.plumSoft, marginTop: 6 }}>on targeted code submissions</div>
            <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
              <Link to="/contact?reason=PDAC%20consulting" style={{ background: D.paper, color: D.plum, padding: '13px 18px', borderRadius: 4, fontSize: 14, fontWeight: 600, textAlign: 'center' }}>
                Book a review →
              </Link>
              {/* PRD-29 §2.2 — CTA points at Unite's own PDAC-credentialed
                  line: the braces category + the RegeniCool™ Pro listing. */}
              <Link to={`/catalog?cat=${encodeURIComponent('Bracing & Orthotics')}&filter=pdac`} style={{ background: 'transparent', color: D.paper, border: `1.5px solid ${D.paper}`, padding: '12px 18px', borderRadius: 4, fontSize: 14, fontWeight: 500, textAlign: 'center' }}>
                Browse PDAC-approved braces →
              </Link>
              <Link to="/products/REGENICOOL-PRO" style={{ background: 'transparent', color: D.paper, border: `1.5px solid ${D.paper}`, padding: '12px 18px', borderRadius: 4, fontSize: 14, fontWeight: 500, textAlign: 'center' }}>
                RegeniCool™ Pro →
              </Link>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
