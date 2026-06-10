import { Link, useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { PartnerMarquee } from '../components/shared/PartnerMarquee.jsx';
import { cartStore } from '../store/cart.js';
import { PRODUCTS, TRUST_METRICS } from '../data/index.js';
import { TESTIMONIALS } from '../data/testimonials.js';
import { IMG, PRODUCT_IMG } from '../lib/imageMap.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO, organizationSchema, websiteSchema } from '../lib/seo.js';

function Hero() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <section
      id="main"
      style={{ background: D.paper, position: 'relative' }}
    >
      <div style={{ padding: `${isMobile ? 36 : 80}px ${padX}px ${isMobile ? 32 : 48}px` }}>
        <div className="um-fade-up" style={{
          maxWidth: 1360, margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.15fr 1fr',
          gap: isMobile ? 32 : 64,
          alignItems: isMobile ? 'start' : 'end',
        }}>
          <div>
            <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: isMobile ? 18 : 28, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: D.plum, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>FDA-REGISTERED · VETERAN-OWNED · EST. 2019</span>
            </div>
            <h1 style={{
              fontFamily: D.display, fontWeight: 400,
              fontSize: 'clamp(44px, 11vw, 104px)',
              lineHeight: 1.08,
              letterSpacing: 'clamp(-0.9px, -0.2vw, -2px)',
              color: D.ink, margin: 0,
              paddingTop: '0.08em',
              paddingBottom: '0.08em',
            }}>
              The supply chain your suppliers use.
            </h1>
            <p style={{ fontSize: isMobile ? 16 : 18, lineHeight: 1.55, color: D.ink2, maxWidth: 560, marginTop: isMobile ? 18 : 28 }}>
              We source, stock, and ship Class 1 and Class 2 medical devices for surgery centers,
              pharmacies, health systems, physician groups, and government buyers. We own and
              warehouse everything we sell. No minimum orders on stocked items. Landed cost,
              transparent.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: isMobile ? 24 : 36, flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/catalog')} style={{ background: D.plum, color: D.paper, border: 'none', padding: isMobile ? '14px 22px' : '15px 24px', borderRadius: 999, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: D.sans, display: 'flex', alignItems: 'center', gap: 10, flex: isMobile ? '1 1 200px' : '0 0 auto', justifyContent: 'center' }}>
                Browse products <Icon.arrow />
              </button>
              <button onClick={() => navigate('/quote')} style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: isMobile ? '14px 22px' : '15px 24px', borderRadius: 999, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: D.sans, flex: isMobile ? '1 1 200px' : '0 0 auto' }}>
                Source & quote
              </button>
            </div>
          </div>
          <div style={{ position: 'relative', marginTop: isMobile ? 0 : 0 }}>
            <PhotoPlaceholder
              src={IMG.HOME_HERO}
              caption="warehouse floor, golden hour"
              height={isMobile ? 280 : 500}
              stripeFrom="#e8ddcd" stripeTo="#d9c8b0" textColor={D.plum}
              eager
            />
            <div style={{
              position: 'absolute',
              left: isMobile ? 12 : -32,
              bottom: isMobile ? 12 : 40,
              background: D.paper, border: `1px solid ${D.line}`,
              padding: isMobile ? 16 : 22, width: isMobile ? 240 : 300,
              boxShadow: '0 20px 40px -20px rgba(36,26,40,.25)',
            }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>LIVE INVENTORY</div>
              <div style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 34, lineHeight: 1.1, color: D.ink, marginTop: 8, letterSpacing: -0.6 }}>Stocked &amp; warehoused</div>
              <div style={{ fontSize: 12, color: D.ink2, marginTop: 6 }}>Georgia &amp; Nevada</div>
              {/* TODO(alex): wire to Shopify product/inventory count API
                  once available \u2014 see PRD Open Q #2. */}
            </div>
          </div>
        </div>
      </div>
      <PartnerMarquee />
    </section>
  );
}

// "By the numbers" — uses the canonical TRUST_METRICS array from data/index.js.
// Lead-in headline rewritten to remove the competitor jab per spec.
function Metrics() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <div style={{ background: D.paper, padding: `${isMobile ? 56 : 88}px ${padX}px`, borderBottom: `1px solid ${D.line}` }}>
      <div style={{
        maxWidth: 1360, margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1.3fr',
        gap: isMobile ? 32 : 80,
      }}>
        <div>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 20 }}>BY THE NUMBERS</div>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 6vw, 56px)', fontWeight: 400, color: D.ink, letterSpacing: 'clamp(-0.7px, -0.13vw, -1.2px)', lineHeight: 1.02, margin: 0 }}>
            The receipts. <Grad>Verified.</Grad>
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? '24px 18px' : '32px 48px' }}>
          {TRUST_METRICS.map((t, i) => (
            <div key={i} style={{ borderTop: `2px solid ${D.plum}`, paddingTop: 16 }}>
              <div style={{
                fontFamily: D.display,
                fontSize: 'clamp(28px, 5.6vw, 54px)',
                letterSpacing: -1, color: D.ink, lineHeight: 0.95,
                wordBreak: 'break-word',
              }}>{t.big}</div>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3, marginTop: 10 }}>{t.small.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// "Two ways to buy" — replaces the "Find Your Lane" segment tabs per spec §4a.
function TwoWaysToBuy() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <div style={{ background: D.plum, color: D.paper, padding: `${isMobile ? 56 : 96}px ${padX}px` }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plumSoft, marginBottom: 16 }}>TWO WAYS TO BUY</div>
        <h2 style={{ fontFamily: D.display, fontSize: 'clamp(36px, 7.2vw, 72px)', fontWeight: 400, letterSpacing: 'clamp(-0.9px, -0.19vw, -1.8px)', lineHeight: 1.0, margin: 0, maxWidth: 1000 }}>
          Two ways to buy.
        </h2>
        <div style={{ marginTop: isMobile ? 32 : 56, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 22 }}>
          <div style={{ background: D.paper, color: D.ink, borderRadius: 16, padding: isMobile ? 24 : 36 }}>
            <h3 style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 32, letterSpacing: -0.5, margin: 0 }}>Ready to buy?</h3>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: D.ink2, marginTop: 12 }}>
              Browse our stocked catalog. Same-day shipping, no minimums on stocked items.
            </p>
            <button onClick={() => navigate('/catalog')} style={{ background: D.ink, color: D.paper, border: 'none', padding: '12px 22px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              Browse products <Icon.arrow />
            </button>
          </div>
          <div style={{ background: D.paper, color: D.ink, borderRadius: 16, padding: isMobile ? 24 : 36 }}>
            <h3 style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 32, letterSpacing: -0.5, margin: 0 }}>Need to source?</h3>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: D.ink2, marginTop: 12 }}>
              Use our quoting engine to find and price non-stock items from our vetted
              manufacturer network.
            </p>
            <button onClick={() => navigate('/quote')} style={{ background: D.ink, color: D.paper, border: 'none', padding: '12px 22px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              Source &amp; quote <Icon.arrow />
            </button>
          </div>
        </div>
        <p style={{ fontSize: 14, color: D.plumSoft, marginTop: 28, maxWidth: 700 }}>
          Don&apos;t see your segment? We work with any facility that buys medical supplies.{' '}
          <Link to="/quote" style={{ color: D.paper, textDecoration: 'underline' }}>Start a quote →</Link>
        </p>
      </div>
    </div>
  );
}

// Testimonial rail — uses the canonical TESTIMONIALS data (spec §5).
function Testimonials() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <div style={{ background: D.paper, padding: `${isMobile ? 56 : 96}px ${padX}px`, borderTop: `1px solid ${D.line}` }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 16 }}>WHAT CUSTOMERS SAY</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 16 : 22 }}>
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} style={{ margin: 0, background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, padding: isMobile ? 22 : 28 }}>
              <blockquote style={{ margin: 0, fontFamily: D.display, fontSize: isMobile ? 18 : 20, letterSpacing: -0.3, lineHeight: 1.35, color: D.ink, fontStyle: 'italic' }}>
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption style={{ marginTop: 18, fontSize: 13, color: D.ink2 }}>
                <div style={{ fontWeight: 600, color: D.ink }}>{t.name}</div>
                <div>{t.title} · {t.org}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}

// Partner Spotlight — TJS Recovery Store, per spec §4a.
function PartnerSpotlight() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <div style={{ background: D.paperAlt, padding: `${isMobile ? 56 : 96}px ${padX}px`, borderTop: `1px solid ${D.line}`, borderBottom: `1px solid ${D.line}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 16 }}>PARTNER SPOTLIGHT</div>
        <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 5.6vw, 48px)', fontWeight: 400, letterSpacing: -1, lineHeight: 1.1, margin: 0 }}>
          &ldquo;We built their patient recovery store. <Grad>They put their name on it.</Grad>&rdquo;
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.65, color: D.ink2, marginTop: 18, maxWidth: 820 }}>
          Total Joint Specialists — one of the most respected orthopedic groups in the
          country — chose Unite to build, stock, and fulfill their entire Patient Recovery
          Store. From product manufacturing to same-day drop shipping, every order flows
          through our platform.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
          <a
            href="https://tjs.unitemedical.net/store"
            target="_blank"
            rel="noreferrer"
            style={{ background: D.plum, color: D.paper, padding: '12px 22px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}
          >
            Visit the TJS Recovery Store →
          </a>
          <Link
            to="/case-studies/tjs"
            style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '11px 22px', borderRadius: 999, fontSize: 14, fontWeight: 500 }}
          >
            Read the case study →
          </Link>
        </div>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3, marginTop: 20 }}>
          White-label storefront · Product manufacturing · Direct-to-patient fulfillment
        </div>
      </div>
    </div>
  );
}

// SegmentRouter "Find Your Lane" tabs removed per spec §4a — replaced by the
// TwoWaysToBuy section above.

function Featured() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  const picks = PRODUCTS.slice(0, 4);
  return (
    <div style={{ padding: `${isMobile ? 56 : 96}px ${padX}px`, background: D.paperAlt, borderTop: `1px solid ${D.line}` }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', marginBottom: isMobile ? 24 : 36, flexDirection: isMobile ? 'column' : 'row', gap: 14 }}>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 6vw, 56px)', fontWeight: 400, letterSpacing: 'clamp(-0.7px, -0.13vw, -1.2px)', color: D.ink, margin: 0, lineHeight: 1.02 }}>
            In stock, <Grad>shipping today</Grad>.
          </h2>
          <button onClick={() => navigate('/catalog')} style={{ color: D.ink, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: D.sans, padding: 0 }}>
            Browse products <Icon.arrow />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: isMobile ? 12 : 18 }}>
          {picks.map((p) => (
            <article key={p.sku} className="um-card" style={{ background: D.card, borderRadius: 14, overflow: 'hidden', border: `1px solid ${D.line}` }}>
              <PhotoPlaceholder src={PRODUCT_IMG[p.sku]} caption={p.img} height={isMobile ? 140 : 210} stripeFrom="#ebe3d3" stripeTo="#ddd1b7" textColor={D.plum} />
              <div style={{ padding: isMobile ? 14 : 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: D.mono, fontSize: 10, letterSpacing: 0.8, color: D.ink3 }}>
                  <span>{p.sku}</span>
                  <span style={{ display: isMobile ? 'none' : 'inline' }}>HCPCS {p.hcpcs}</span>
                </div>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 16 : 19, color: D.ink, marginTop: 10, lineHeight: 1.25, minHeight: isMobile ? 40 : 48 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{p.cat} · {p.packSize}</div>
                <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', marginTop: 14 }}>
                  <div>
                    <div style={{ fontFamily: D.display, fontSize: isMobile ? 20 : 24, color: D.plum, letterSpacing: -0.4 }}>${p.price.toFixed(2)}</div>
                    <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>MOQ {p.moq}</div>
                  </div>
                  <button onClick={() => cartStore.add(p.sku)} aria-label={`Add ${p.name}`} style={{ background: D.ink, color: D.paper, border: 'none', width: 40, height: 40, borderRadius: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon.plus />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function CTA() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <div style={{ padding: `${isMobile ? 72 : 120}px ${padX}px`, background: D.ink, color: D.paper }}>
      <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: isMobile ? 28 : 72, alignItems: 'center' }}>
        <h2 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 400, letterSpacing: 'clamp(-1px, -0.19vw, -1.8px)', lineHeight: 1.0, margin: 0 }}>
          Enter data once.<br />
          <Grad>Sync everything.</Grad>
        </h2>
        <div>
          <div style={{ fontSize: isMobile ? 15 : 17, lineHeight: 1.55, color: '#cfc4d2', marginBottom: isMobile ? 22 : 28 }}>
            Order placed → inventory updates → invoice auto-creates → label prints → tracking
            returns to your portal. Zero manual touchpoints.
          </div>
          <button onClick={() => navigate('/quote')} style={{ background: D.plum, color: D.paper, border: 'none', padding: '14px 24px', borderRadius: 999, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: D.sans, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            Start a quote <Icon.arrow />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Homepage() {
  useSEO({
    title: 'The supply chain your suppliers use',
    description:
      'Veteran-owned, FDA-registered wholesale medical supply for surgery centers, pharmacies, health systems, government, and regional distributors. No minimums on stocked items. Same-day shipping on orders before 2pm EST from Georgia & Nevada.',
    canonical: '/',
    type: 'website',
    jsonLd: [organizationSchema(), websiteSchema()],
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink }}>
      <Nav />
      <Hero />
      <Metrics />
      <TwoWaysToBuy />
      <Featured />
      <PartnerSpotlight />
      <Testimonials />
      <CTA />
      <Footer />
    </div>
  );
}
