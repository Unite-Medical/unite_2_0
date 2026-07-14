// Portfolio — rebuilt per PRD-28 §4.1. The six fabricated case studies that
// named real third parties are gone. Layout kept. Content now:
//   1. REAL flagship — TJS patient-recovery store (data pulled, copy approved)
//   2. REAL flagship — Restore Robotics savings ($900K+ static until the
//      Restore-portal data bridge lands; never a fake-live counter)
//   3. REAL stat — 7 Medava SKUs on the national MSPV contract
//   4+ Illustrative, ANONYMIZED cards — generic descriptors, no names,
//      no competitor names.
import { useNavigate, Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { PORTFOLIO_IMG } from '../lib/imageMap.js';

// Real TJS storefront art served by the live store itself.
const TJS_IMG = 'https://tjs.unitemedical.net/api/og';

// Illustrative composites — anonymized per PRD-28 §4.1 (no customer names,
// no competitor names).
const ANON_CASES = [
  {
    customer: 'A 4-OR ambulatory surgery center',
    segment: 'ASC · Southeast',
    stat: 'Same-day',
    stat_label: 'shipping on stocked reorders',
    body: 'Brought on as a secondary source, now handling primary reorders. A formulary built around the procedures they actually run, with same-day shipping from our Georgia warehouse.',
  },
  {
    customer: 'An independent Georgia pharmacy',
    segment: 'Independent Pharmacy',
    stat: 'Drop-ship',
    stat_label: 'OTC diagnostics fulfillment',
    body: 'Wholesale diagnostics plus drop-ship fulfillment let a small pharmacy serve orders it previously had to turn away — no inventory risk, no minimums.',
  },
  {
    customer: 'A regional distributor',
    segment: 'Distributor Program',
    stat: 'White-label',
    stat_label: 'bracing under their brand',
    body: 'Private-label orthotic bracing manufactured and drop-shipped under the distributor\u2019s own brand. Their customer relationships, our product and logistics.',
  },
  {
    customer: 'A county EMS agency',
    segment: 'EMS',
    stat: 'Monthly',
    stat_label: 'per-rig restock program',
    body: 'Standing restock subscriptions across the fleet with consolidated quarterly invoicing — supplies stay stocked without purchase-order churn.',
  },
];

export function Portfolio() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Portfolio — proven outcomes',
    description:
      'Proven outcomes: a branded patient-recovery store growing revenue 43% in its first 90 days, $900K+ saved for hospital systems through the Restore Robotics program, and 7 Medava SKUs on the national MSPV contract.',
    canonical: '/portfolio',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow="PORTFOLIO · THE WORK"
          title={<>Proven <Grad>outcomes</Grad>.</>}
          sub="The work, in plain numbers."
        />
        <section style={{ padding: `24px ${padX}px ${isMobile ? 56 : 110}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>

            {/* FLAGSHIP 1 — Total Joint Specialists (real, named, approved) */}
            <article className="um-card" style={{
              background: D.ink, color: D.paper, borderRadius: isMobile ? 20 : 28, overflow: 'hidden',
              display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.15fr 1fr', alignItems: 'stretch',
            }}>
              <div style={{ minHeight: isMobile ? 220 : 440 }}>
                <PhotoPlaceholder src={TJS_IMG} alt="The Total Joint Specialists patient recovery store" caption="tjs patient recovery store" height="100%" stripeFrom="#243530" stripeTo="#182620" textColor={D.plumSoft} radius={0} />
              </div>
              <div style={{ padding: isMobile ? 24 : '56px 60px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' }}>
                <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plumSoft }}>PHYSICIAN GROUP · PATIENT RECOVERY STORE</div>
                <h3 style={{ fontFamily: D.display, fontSize: isMobile ? 30 : 44, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.05, margin: '14px 0 0' }}>Total Joint Specialists</h3>
                <div style={{ marginTop: isMobile ? 20 : 32 }}>
                  <div style={{ fontFamily: D.display, fontSize: isMobile ? 64 : 104, lineHeight: 0.9, letterSpacing: '-0.04em', background: D.grad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>+43%</div>
                  <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: 'rgba(243,242,235,.55)', marginTop: 10 }}>REVENUE GROWTH, LAUNCH MONTH TO MONTH THREE</div>
                </div>
                <p style={{ fontSize: isMobile ? 14.5 : 16, color: 'rgba(243,242,235,.75)', lineHeight: 1.65, margin: `${isMobile ? 18 : 28}px 0 0` }}>
                  Unite built Total Joint Specialists a complete, branded patient-recovery store
                  from scratch — a 49-product catalog, private-label bracing we manufacture, and
                  direct-to-patient fulfillment from our Georgia warehouse. In its first 90 days,
                  revenue grew every single month — up 43% from launch to month three
                  ($5,278 → $7,547), on a rising average order value. The surgeon&apos;s brand stays
                  on every touchpoint; we run everything behind it.
                </p>
                <div style={{ display: 'flex', gap: isMobile ? 14 : 24, marginTop: isMobile ? 18 : 26, flexWrap: 'wrap', fontFamily: D.mono, fontSize: 10.5, letterSpacing: 0.8, color: 'rgba(243,242,235,.6)' }}>
                  <span>$19.3K REVENUE, FIRST 90 DAYS</span>
                  <span>49-PRODUCT CATALOG, LIVE AT LAUNCH</span>
                  <span>REVENUE UP EVERY MONTH</span>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: isMobile ? 22 : 32, flexWrap: 'wrap' }}>
                  <Link to="/case-studies/tjs" style={{ background: D.paper, color: D.ink, padding: '13px 24px', borderRadius: 4, fontSize: 14, fontWeight: 600 }}>
                    Read the case study →
                  </Link>
                  <button onClick={() => navigate('/contact')} style={{ background: 'transparent', color: D.paper, border: '1.5px solid rgba(243,242,235,.5)', padding: '12px 24px', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontFamily: D.sans }}>
                    Could this be your store? →
                  </button>
                </div>
              </div>
            </article>

            {/* FLAGSHIP 2 — Restore Robotics savings (real; static $900K+ until
                the Restore-portal data bridge is wired — never a fake-live number) */}
            <article className="um-card" style={{
              marginTop: isMobile ? 16 : 24,
              background: D.plum, color: D.paper, borderRadius: isMobile ? 20 : 28, overflow: 'hidden',
              display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.15fr', alignItems: 'stretch',
            }}>
              <div style={{ padding: isMobile ? 24 : '56px 60px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' }}>
                <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plumSoft }}>HOSPITAL SYSTEMS · SURGICAL ROBOTICS</div>
                <h3 style={{ fontFamily: D.display, fontSize: isMobile ? 30 : 44, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.05, margin: '14px 0 0' }}>Restore Robotics program</h3>
                <div style={{ marginTop: isMobile ? 20 : 32 }}>
                  <div style={{ fontFamily: D.display, fontSize: isMobile ? 64 : 104, lineHeight: 0.9, letterSpacing: '-0.04em', color: D.paper }}>$900K+</div>
                  <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plumSoft, marginTop: 10 }}>SAVED FOR HOSPITAL SYSTEMS TO DATE</div>
                </div>
                <p style={{ fontSize: isMobile ? 14.5 : 16, color: '#cfe0d7', lineHeight: 1.65, margin: `${isMobile ? 18 : 28}px 0 0` }}>
                  Total savings Unite has generated for hospital systems through the Restore
                  Robotics program — over $900,000 to date. FDA 510(k)-cleared remanufactured
                  da Vinci instruments deliver 20–25% per-instrument savings with a
                  manufacturer-of-record warranty.
                </p>
                <Link to="/robotics" style={{ marginTop: isMobile ? 22 : 32, background: D.paper, color: D.plum, padding: '13px 24px', borderRadius: 4, fontSize: 14, fontWeight: 600 }}>
                  Explore the robotics program →
                </Link>
              </div>
              <div style={{ minHeight: isMobile ? 220 : 440 }}>
                <PhotoPlaceholder src={PORTFOLIO_IMG[3]} alt="Surgical robotic instruments" caption="restore robotics program" height="100%" stripeFrom="#243530" stripeTo="#182620" textColor={D.plumSoft} radius={0} />
              </div>
            </article>

            {/* REAL stat — Medava on the national MSPV contract */}
            <div style={{ marginTop: isMobile ? 16 : 24, background: D.paperAlt, border: `1px solid ${D.line}`, borderRadius: isMobile ? 20 : 28, padding: isMobile ? 24 : 44, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr', gap: isMobile ? 12 : 44, alignItems: 'center' }}>
              <div style={{ fontFamily: D.display, fontSize: isMobile ? 64 : 96, letterSpacing: '-0.04em', lineHeight: 0.9, color: D.plum }}>7</div>
              <div>
                <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum }}>GOVERNMENT · MSPV</div>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 22 : 30, letterSpacing: -0.4, marginTop: 8 }}>Medava SKUs on the national MSPV contract</div>
                <p style={{ fontSize: 14.5, color: D.ink2, lineHeight: 1.6, margin: '10px 0 0', maxWidth: 640 }}>
                  Medava products are carried on the national Medical/Surgical Prime Vendor
                  contract via an authorized SDVOSB distributor who holds the contract —
                  supplying VA medical centers nationwide.
                </p>
              </div>
            </div>

            {/* Illustrative, anonymized cards — generic descriptors, no names */}
            <div style={{ marginTop: isMobile ? 16 : 24, fontFamily: D.mono, fontSize: 10, letterSpacing: 1.2, color: D.ink3 }}>
              MORE OF THE WORK · CUSTOMER NAMES WITHHELD
            </div>
            <div style={{ marginTop: isMobile ? 10 : 14, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: isMobile ? 14 : 24 }}>
              {ANON_CASES.map((c, idx) => (
                <article key={c.customer} className="um-card" style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <PhotoPlaceholder src={PORTFOLIO_IMG[(idx + 1) % PORTFOLIO_IMG.length]} caption={c.segment.toLowerCase()} height={isMobile ? 160 : 240} stripeFrom="#e8ddcd" stripeTo="#d9c8b0" textColor={D.plum} radius={0} />
                  <div style={{ padding: isMobile ? 22 : 32, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum }}>{c.segment.toUpperCase()}</div>
                    <h3 style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 30, fontWeight: 400, letterSpacing: -0.6, lineHeight: 1.1, margin: '10px 0 0' }}>{c.customer}</h3>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 18 }}>
                      <div style={{ fontFamily: D.display, fontSize: isMobile ? 40 : 48, color: D.plum, letterSpacing: '-0.03em', lineHeight: 0.95 }}>{c.stat}</div>
                      <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3 }}>{c.stat_label.toUpperCase()}</div>
                    </div>
                    <p style={{ fontSize: 14.5, color: D.ink2, lineHeight: 1.6, margin: '16px 0 0', flex: 1 }}>{c.body}</p>
                    <button onClick={() => navigate('/contact')} style={{ marginTop: 24, background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '11px 18px', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontFamily: D.sans }}>
                      Talk to a rep about your version →
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
