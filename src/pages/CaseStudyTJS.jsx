// Total Joint Specialists case study — reworked per PRD-28 §4.2 to (1)
// showcase the full end-to-end capability and (2) sell the solution to new
// prospects. Growth data verified against the live store; publish-safe stats
// only (no order counts, no reorder rates, no margin figures).
import { Link, useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const TJS_IMG = 'https://tjs.unitemedical.net/api/og';

// Everything Unite demonstrably runs for TJS — the capability story, framed
// for the next physician group reading this page.
const CAPABILITIES = [
  ['Store build', 'A complete branded e-commerce storefront, designed, built, and hosted by Unite — live at launch with a 49-product catalog.'],
  ['Private-label manufacturing', 'Post-surgical bracing manufactured by Unite and sold under the TJS label. Their name on the product, our factory behind it.'],
  ['Catalog & pricing', 'Product selection, merchandising, and pricing managed end to end — recovery products matched to the procedures the group actually performs.'],
  ['Care-pathway integration', 'Integrated with Force Therapeutics so the store sits inside the patient\u2019s recovery pathway, not off to the side.'],
  ['Direct-to-patient fulfillment', 'Every order picked, packed, and shipped to the patient\u2019s door from our Georgia warehouse — same-day processing.'],
  ['Warehouse & inventory', 'Stock levels, lots, and reorders run on Unite\u2019s warehouse system; the practice never touches a box.'],
  ['Branded everything', 'Storefront, products, packing slips, and patient touchpoints all carry the surgeon\u2019s brand. Unite stays invisible.'],
  ['Reorders & analytics', 'Repeat-purchase flows and store analytics handled by Unite, reported to the practice.'],
];

const RESULTS = [
  ['+43%', 'Revenue growth, launch month to month three ($5,278 → $7,547)'],
  ['$19.3K', 'Revenue in the first 90 days'],
  ['49', 'Products live at launch'],
  ['3 / 3', 'Months of month-over-month revenue growth'],
];

const WHO_FOR = [
  'Orthopedic and surgical groups who want a branded recovery store without building a supply chain',
  'Physician groups already prescribing recovery products their patients buy elsewhere',
  'Practices that want revenue from the recovery pathway while staying focused on care',
  'Groups on care-pathway platforms (like Force Therapeutics) that want commerce integrated, not bolted on',
];

export function CaseStudyTJS() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Case Study — Total Joint Specialists Patient Recovery Store · Unite Medical',
    description:
      'Unite built Total Joint Specialists a complete branded patient-recovery store — 49-product catalog, private-label bracing, direct-to-patient fulfillment. Revenue grew 43% from launch to month three.',
    canonical: '/case-studies/tjs',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <PageHead
        eyebrow="CASE STUDY · PARTNER SPOTLIGHT"
        title={<>Their brand on the store.<br /><Grad>Our machine behind it.</Grad></>}
        sub="Unite built Total Joint Specialists — one of the most respected orthopedic groups in the country — a complete, branded patient-recovery store from scratch. Here's everything that runs behind it, and what it did in its first 90 days."
      />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: `8px ${padX}px ${isMobile ? 56 : 96}px` }}>

        <PhotoPlaceholder
          src={TJS_IMG}
          alt="The Total Joint Specialists patient recovery store"
          caption="tjs.unitemedical.net/store"
          height={isMobile ? 220 : 420}
          stripeFrom="#e8ddcd" stripeTo="#d9c8b0" textColor={D.plum}
          radius={16}
          eager
        />

        {/* The numbers — verified, publish-safe */}
        <section style={{ marginTop: isMobile ? 36 : 56 }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 14 }}>FIRST 90 DAYS · VERIFIED</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 12 : 18 }}>
            {RESULTS.map(([stat, label]) => (
              <div key={stat} style={{ borderTop: `2px solid ${D.plum}`, padding: '18px 0' }}>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 34 : 44, letterSpacing: '-0.03em', color: D.ink, lineHeight: 1 }}>{stat}</div>
                <div style={{ fontSize: 12.5, color: D.ink2, marginTop: 8, lineHeight: 1.5 }}>{label}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: D.ink2, marginTop: 20, maxWidth: 760 }}>
            Revenue grew every single month from launch, on a rising average order value — the
            store earned more per order in month three than it did at launch.
          </p>
        </section>

        {/* The capability story */}
        <section style={{ marginTop: isMobile ? 40 : 64 }}>
          <h2 style={{ fontFamily: D.display, fontSize: isMobile ? 28 : 40, letterSpacing: -0.7, margin: 0, lineHeight: 1.06 }}>
            Everything behind the storefront.
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: D.ink2, margin: '14px 0 0', maxWidth: 760 }}>
            TJS needed a patient-facing recovery store without standing up an internal
            supply-chain or fulfillment team. Unite runs the entire operation:
          </p>
          <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 10 : 14 }}>
            {CAPABILITIES.map(([h, s]) => (
              <div key={h} style={{ padding: isMobile ? 18 : 22, background: D.card, borderRadius: 14, border: `1px solid ${D.line}` }}>
                <div style={{ fontFamily: D.display, fontSize: 20, letterSpacing: -0.3, color: D.ink }}>{h}</div>
                <p style={{ fontSize: 14, color: D.ink2, lineHeight: 1.6, margin: '8px 0 0' }}>{s}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Who it's for + CTA */}
        <section style={{ marginTop: isMobile ? 40 : 64, background: D.ink, color: D.paper, borderRadius: isMobile ? 18 : 24, padding: isMobile ? 24 : 44 }}>
          <h2 style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 36, letterSpacing: -0.6, margin: 0, lineHeight: 1.08 }}>
            Could this be <em style={{ color: D.terraSoft }}>your</em> store?
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: 'rgba(243,242,235,.75)', margin: '14px 0 0', maxWidth: 700 }}>
            The TJS build is a repeatable playbook. It fits:
          </p>
          <ul style={{ margin: '16px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
            {WHO_FOR.map((w) => (
              <li key={w} style={{ fontSize: 14.5, lineHeight: 1.6, color: 'rgba(243,242,235,.85)' }}>{w}</li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/contact?reason=New%20account')}
              style={{ background: D.paper, color: D.ink, border: 'none', padding: '14px 26px', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans }}
            >
              Build my store — talk to us →
            </button>
            <a
              href="https://tjs.unitemedical.net/store"
              target="_blank"
              rel="noreferrer"
              style={{ background: 'transparent', color: D.paper, border: '1.5px solid rgba(243,242,235,.5)', padding: '13px 26px', borderRadius: 4, fontSize: 14, fontWeight: 500 }}
            >
              Visit the TJS Recovery Store →
            </a>
            <Link
              to="/services/private-label"
              style={{ background: 'transparent', color: D.paper, border: '1.5px solid rgba(243,242,235,.5)', padding: '13px 26px', borderRadius: 4, fontSize: 14, fontWeight: 500 }}
            >
              Private label & manufacturing →
            </Link>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
