import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Eyebrow } from '../components/shared/Eyebrow.jsx';
import { Reveal } from '../components/shared/Reveal.jsx';
import { PartnerMarquee } from '../components/shared/PartnerMarquee.jsx';
import { cartStore } from '../store/cart.js';
import { db } from '../lib/db.js';
import { availability } from '../lib/wms/availability.js';
import { PRODUCTS, TRUST_METRICS } from '../data/index.js';
import { TESTIMONIALS } from '../data/testimonials.js';
import { IMG, PRODUCT_IMG, productCutout } from '../lib/imageMap.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO, organizationSchema, websiteSchema } from '../lib/seo.js';

/* ------------------------------------------------------------------ */
/* Hero — editorial front page. Bone paper, oversized serif headline,  */
/* standfirst + CTAs, then the photograph as an inset plate with a     */
/* mono data strip. Print, not cinema.                                 */
/* ------------------------------------------------------------------ */
function Hero() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <section id="main" style={{ background: D.paper, color: D.ink, padding: `${isMobile ? 40 : 76}px ${padX}px 0` }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div className="um-fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Eyebrow pulse>FDA-Registered · Veteran-Owned · Est. 2019</Eyebrow>
          {!isMobile && (
            <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.ink3 }}>
              LITHIA SPRINGS, GA · SHIPS TO ALL 50 STATES
            </span>
          )}
        </div>

        <h1
          className="um-fade-up um-d1"
          style={{
            fontFamily: D.display, fontWeight: 400,
            fontSize: 'clamp(52px, 11vw, 152px)',
            lineHeight: 0.96,
            letterSpacing: '-0.02em',
            margin: `${isMobile ? 22 : 36}px 0 0`,
            maxWidth: '10.5em',
          }}
        >
          The supply chain your <Grad>suppliers</Grad> use.
        </h1>

        <div
          className="um-fade-up um-d2"
          style={{
            borderTop: `1px solid ${D.ink}`,
            marginTop: isMobile ? 26 : 44,
            paddingTop: isMobile ? 20 : 28,
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(360px, 640px) 1fr auto',
            gap: isMobile ? 20 : 48,
            alignItems: 'start',
          }}
        >
          <p style={{ fontSize: isMobile ? 15.5 : 17.5, lineHeight: 1.6, color: D.ink2, margin: 0 }}>
            A global supply chain company specializing in medical. We stock and wholesale core
            categories from our Georgia warehouse, and source the rest through our vetted
            manufacturer network — for surgery centers, pharmacies, health systems, physician
            groups, and government buyers. No minimum orders on stocked items. Same-day shipping
            on orders before 2pm EST.
          </p>
          {!isMobile && <span />}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/catalog')} style={{ background: D.ink, color: D.paper, border: `1px solid ${D.ink}`, padding: isMobile ? '14px 22px' : '16px 28px', borderRadius: 4, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans, display: 'flex', alignItems: 'center', gap: 10, flex: isMobile ? '1 1 200px' : '0 0 auto', justifyContent: 'center' }}>
              Browse products <Icon.arrow />
            </button>
            <button onClick={() => navigate('/quote')} style={{ background: 'transparent', color: D.ink, border: `1px solid ${D.ink}`, padding: isMobile ? '14px 22px' : '16px 28px', borderRadius: 4, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: D.sans, flex: isMobile ? '1 1 200px' : '0 0 auto' }}>
              Source &amp; quote
            </button>
          </div>
        </div>

        {/* Photographic plate — inset, framed by a hairline, data strip below */}
        <div className="um-fade-up um-d3" style={{ marginTop: isMobile ? 28 : 48 }}>
          <div style={{ border: `1px solid ${D.ink}`, borderBottom: 'none', height: isMobile ? 260 : 480, position: 'relative', overflow: 'hidden' }}>
            <img
              src={IMG.HOME_HERO}
              alt="Unite Medical warehouse operations"
              fetchPriority="high"
              decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
          <div style={{
            border: `1px solid ${D.ink}`,
            background: D.inkDeep, color: 'rgba(243,242,235,.72)',
            padding: `${isMobile ? 12 : 14}px ${isMobile ? 14 : 22}px`,
            display: 'flex', alignItems: 'center', gap: isMobile ? 14 : 28, flexWrap: 'wrap',
            fontFamily: D.mono, fontSize: isMobile ? 10 : 11, letterSpacing: 1.1,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: '#5fbd8a', display: 'inline-block', animation: 'umPulse 2.6s ease-in-out infinite' }} />
              LIVE INVENTORY
            </span>
            <span style={{ opacity: .35 }}>/</span>
            <span>STOCKED &amp; WAREHOUSED</span>
            <span style={{ opacity: .35 }}>/</span>
            <span>GEORGIA WAREHOUSE · ALL 50 STATES</span>
            {!isMobile && <>
              <span style={{ opacity: .35 }}>/</span>
              <span>SAME-DAY SHIPPING · ORDERS BEFORE 2PM EST</span>
            </>}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Metrics — the registration numbers as a plain data table on an      */
/* evergreen ground. No glass, no glow: the numbers ARE the design.    */
/* ------------------------------------------------------------------ */
function Metrics() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;

  return (
    <div style={{ color: D.paper, padding: `${isMobile ? 64 : 110}px ${padX}px`, background: D.inkDeep }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <Reveal>
          <Eyebrow dark style={{ marginBottom: 20 }}>By the numbers</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(38px, 7vw, 82px)', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 0.98, margin: 0 }}>
            The receipts. <Grad style={{ color: D.plumSoft }}>Verified.</Grad>
          </h2>
        </Reveal>
        <div style={{
          marginTop: isMobile ? 36 : 60,
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: isMobile ? '0 20px' : '0 40px',
        }}>
          {TRUST_METRICS.map((t, i) => (
            <Reveal key={i} delay={i * 70}>
              <div style={{ borderTop: '1px solid rgba(243,242,235,.24)', padding: `${isMobile ? 18 : 24}px 0 ${isMobile ? 22 : 8}px` }}>
                <div style={{ fontFamily: D.mono, fontSize: isMobile ? 9.5 : 11, letterSpacing: 1.2, color: 'rgba(243,242,235,.55)', lineHeight: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t.small.toUpperCase()}</span>
                  <span style={{ opacity: .5 }}>{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div style={{
                  fontFamily: D.display,
                  fontSize: isMobile ? 'clamp(22px, 6vw, 32px)' : 'clamp(28px, 2.6vw, 42px)',
                  letterSpacing: '-0.01em', lineHeight: 1.06,
                  color: D.paper,
                  overflowWrap: 'anywhere',
                  marginTop: 14,
                }}>{t.big}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Who we serve — the customer index. Numbered rows, one per buyer     */
/* type, inverting to ink on hover. The site's organizing principle.   */
/* ------------------------------------------------------------------ */
const SEGMENTS = [
  { n: '01', h: 'Surgery centers', sub: 'Case-cart staples, bracing, and recovery DME with no minimums and Net-30 on approved credit.', path: '/segments/asc' },
  { n: '02', h: 'Pharmacies & retail', sub: 'OTC, diagnostics, and front-of-store lines — from single stores to regional chains.', path: '/segments/pharmacy' },
  { n: '03', h: 'EMS & fire', sub: 'First-response consumables and trauma supplies, quoted by the pallet or the case.', path: '/segments/ems' },
  { n: '04', h: 'Government & VA', sub: 'BPA 36F79725D0203 · CAGE 8MK70. A veteran-owned prime with the paperwork done.', path: '/government' },
  { n: '05', h: 'Distributors & resellers', sub: 'Wholesale pricing, opt-in catalog exposure, and custom sourcing under your own brand.', path: '/segments/distributors' },
  { n: '06', h: 'Health systems & physician groups', sub: 'Shortage matching, cross-referenced substitutes, and white-label patient programs.', path: '/shortage-list' },
];

function WhoWeServe() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <div style={{ background: D.paper, padding: `${isMobile ? 64 : 110}px ${padX}px`, borderBottom: `1px solid ${D.line}` }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <Reveal>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <Eyebrow style={{ marginBottom: 18 }}>Who we serve</Eyebrow>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 8vw, 96px)', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 0.98, margin: 0 }}>
                Built for the people <Grad>who buy.</Grad>
              </h2>
            </div>
            {!isMobile && (
              <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.ink3, paddingBottom: 10 }}>
                SIX BUYER TYPES · ONE WAREHOUSE
              </span>
            )}
          </div>
        </Reveal>
        <div style={{ marginTop: isMobile ? 30 : 56, borderTop: `1px solid ${D.ink}` }}>
          {SEGMENTS.map((s, i) => (
            <Reveal key={s.n} delay={i * 50}>
              <Link
                to={s.path}
                className="um-index-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '44px 1fr 24px' : '90px 1fr 1.2fr 40px',
                  alignItems: 'center',
                  gap: isMobile ? 12 : 32,
                  padding: `${isMobile ? 18 : 26}px ${isMobile ? 4 : 10}px`,
                  borderBottom: `1px solid ${D.line}`,
                  color: D.ink,
                }}
              >
                <span style={{ fontFamily: D.mono, fontSize: isMobile ? 11 : 13, letterSpacing: 1, color: D.plum }}>{s.n}</span>
                <span style={{ fontFamily: D.display, fontSize: isMobile ? 24 : 40, letterSpacing: '-0.01em', lineHeight: 1.05 }}>{s.h}</span>
                {!isMobile && <span style={{ fontSize: 15, lineHeight: 1.55, color: D.ink2 }}>{s.sub}</span>}
                <Icon.arrow style={{ justifySelf: 'end' }} />
              </Link>
            </Reveal>
          ))}
        </div>
        <p style={{ fontSize: 14, color: D.ink2, marginTop: 24, maxWidth: 700 }}>
          Don&apos;t see your segment? We work with any facility that buys medical supplies.{' '}
          <Link to="/quote" style={{ color: D.plum, textDecoration: 'underline', textUnderlineOffset: 3 }}>Start a quote →</Link>
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Two ways to buy — split panels that invert to green on hover        */
/* ------------------------------------------------------------------ */
function TwoWaysToBuy() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  const panels = [
    {
      n: '01', h: 'Ready to buy?',
      p: 'Browse our stocked catalog. Same-day shipping, no minimums on stocked items.',
      cta: 'Browse products', path: '/catalog',
    },
    {
      n: '02', h: 'Need to source?',
      p: 'Use our quoting engine to find and price non-stock items from our vetted manufacturer network.',
      cta: 'Source & quote', path: '/quote',
    },
  ];
  return (
    <div style={{ background: D.paperAlt, padding: `${isMobile ? 64 : 110}px ${padX}px`, borderBottom: `1px solid ${D.line}` }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <Reveal>
          <Eyebrow style={{ marginBottom: 18 }}>Two ways to buy</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 8vw, 96px)', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 0.98, margin: 0 }}>
            Two ways <Grad>to buy.</Grad>
          </h2>
        </Reveal>
        <div style={{ marginTop: isMobile ? 32 : 56, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 24 }}>
          {panels.map((c, i) => (
            <Reveal key={c.n} delay={i * 90}>
              <button
                className="um-flip-panel"
                onClick={() => navigate(c.path)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  width: '100%', textAlign: 'left',
                  minHeight: isMobile ? 260 : 380,
                  borderRadius: 6, padding: isMobile ? 26 : 40,
                  cursor: 'pointer', position: 'relative', overflow: 'hidden',
                  fontFamily: D.sans,
                }}
              >
                <span aria-hidden="true" className="um-flip-numeral" style={{
                  position: 'absolute', top: isMobile ? -6 : -14, right: isMobile ? 10 : 18,
                  fontFamily: D.display, fontSize: isMobile ? 110 : 180, lineHeight: 1,
                  letterSpacing: '-0.03em', userSelect: 'none',
                }}>{c.n}</span>
                <span style={{ fontFamily: D.display, fontSize: isMobile ? 30 : 44, letterSpacing: -0.5, lineHeight: 1.05, position: 'relative' }}>{c.h}</span>
                <span className="um-flip-sub" style={{ fontSize: isMobile ? 15 : 16.5, lineHeight: 1.6, marginTop: 16, maxWidth: 440, position: 'relative', flex: 1 }}>
                  {c.p}
                </span>
                <span className="um-flip-cta" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: isMobile ? '13px 22px' : '14px 24px', borderRadius: 4,
                  fontSize: 14, fontWeight: 600, marginTop: 24, position: 'relative',
                }}>
                  {c.cta} <Icon.arrow />
                </span>
              </button>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Featured — full-bleed horizontal scroll-snap product rail           */
/* ------------------------------------------------------------------ */
function Featured() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  const picks = PRODUCTS.slice(0, 8);
  const railRef = useRef(null);
  // Live availability so the stock badge reflects reality (PRD-28 §2.4) —
  // same WMS projection (on_hand − reserved) the catalog gates on.
  const inv = db.useTable('inventory');
  const stockBySku = availability.stockBySku();
  void inv;

  // Arrow buttons scroll the rail one card at a time — the scrollbar is
  // hidden, so plain-mouse users need a real affordance (PRD-28 §2.3).
  function scrollRail(dir) {
    const rail = railRef.current;
    if (!rail) return;
    const cardWidth = (isMobile ? 262 : 396) + (isMobile ? 12 : 20);
    rail.scrollBy({ left: dir * cardWidth, behavior: 'smooth' });
  }

  return (
    <div style={{ padding: `${isMobile ? 64 : 120}px 0`, background: D.paper, overflow: 'hidden' }}>
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: `0 ${padX}px` }}>
        <Reveal>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', flexDirection: isMobile ? 'column' : 'row', gap: 14 }}>
            <div>
              <Eyebrow style={{ marginBottom: 18 }}>Stocked catalog</Eyebrow>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 7vw, 88px)', fontWeight: 400, letterSpacing: '-0.02em', color: D.ink, margin: 0, lineHeight: 0.98 }}>
                In stock, <Grad>shipping today</Grad>.
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => navigate('/catalog')} style={{ color: D.ink, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: `1px solid ${D.ink}`, borderRadius: 4, padding: '12px 22px', cursor: 'pointer', fontFamily: D.sans, whiteSpace: 'nowrap' }}>
                Browse products <Icon.arrow />
              </button>
              {!isMobile && (
                <>
                  <button onClick={() => scrollRail(-1)} aria-label="Previous products" style={{ background: 'none', border: `1px solid ${D.ink}`, color: D.ink, width: 44, height: 44, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon.arrow style={{ transform: 'rotate(180deg)' }} />
                  </button>
                  <button onClick={() => scrollRail(1)} aria-label="Next products" style={{ background: D.ink, border: `1px solid ${D.ink}`, color: D.paper, width: 44, height: 44, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon.arrow />
                  </button>
                </>
              )}
            </div>
          </div>
        </Reveal>
      </div>

      {/* Rail bleeds across the full viewport; cards snap as you scroll */}
      <div
        ref={railRef}
        className="um-rail"
        style={{
          display: 'flex', gap: isMobile ? 12 : 20,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          paddingTop: isMobile ? 28 : 44,
          paddingBottom: 8,
          // Align the first card with the 1360px container, then bleed right
          paddingLeft: `max(${padX}px, calc((100vw - 1360px) / 2 + ${padX}px))`,
          paddingRight: padX,
          scrollPaddingLeft: `max(${padX}px, calc((100vw - 1360px) / 2 + ${padX}px))`,
        }}
      >
        {picks.map((p) => {
          const cutout = productCutout(p.sku);
          // Real availability from the WMS projection — badge only shows when
          // stock is verified on hand (PRD-28 §2.4); never hardcoded.
          const inStock = (stockBySku.get(p.sku)?.available || 0) > 0;
          return (
            <article
              key={p.sku}
              className="um-card"
              style={{
                flex: `0 0 ${isMobile ? 262 : 396}px`,
                scrollSnapAlign: 'start',
                background: D.card, borderRadius: 6, overflow: 'hidden',
                border: `1px solid ${D.line}`,
                display: 'flex', flexDirection: 'column',
              }}
            >
              {cutout ? (
                <Link to={`/products/${p.sku}`} aria-label={p.name} style={{ display: 'block' }}>
                  <div className="um-cutout-stage" style={{
                    height: isMobile ? 196 : 300, position: 'relative',
                    display: 'grid', placeItems: 'center',
                    background: D.paperAlt, borderBottom: `1px solid ${D.line}`,
                    overflow: 'hidden',
                  }}>
                    <img
                      className="um-cutout-img"
                      src={cutout}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      style={{ maxWidth: '78%', maxHeight: '82%', objectFit: 'contain', position: 'relative' }}
                    />
                    {inStock && (
                      <span style={{
                        position: 'absolute', top: 12, left: 12,
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontFamily: D.mono, fontSize: 9, letterSpacing: 1,
                        color: D.ink2, background: 'rgba(252,251,246,.92)',
                        border: `1px solid ${D.line}`, borderRadius: 3, padding: '4px 9px',
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: 3, background: '#2e7d5f', display: 'inline-block', animation: 'umPulse 2.6s ease-in-out infinite' }} />
                        IN STOCK
                      </span>
                    )}
                  </div>
                </Link>
              ) : (
                <PhotoPlaceholder src={PRODUCT_IMG[p.sku]} caption={p.img} height={isMobile ? 196 : 300} stripeFrom="#e7e5da" stripeTo="#dcd9ca" textColor={D.plum} />
              )}
              <div style={{ padding: isMobile ? 18 : 24, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: D.mono, fontSize: 10, letterSpacing: 0.8, color: D.ink3 }}>
                  <span>{p.sku}</span>
                  <span style={{ display: isMobile ? 'none' : 'inline' }}>HCPCS {p.hcpcs}</span>
                </div>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 19 : 24, color: D.ink, marginTop: 10, lineHeight: 1.2, flex: 1 }}>{p.name}</div>
                <div style={{ fontSize: 13, color: D.ink2, marginTop: 6 }}>{p.cat} · {p.packSize}</div>
                <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTop: `1px solid ${D.line}` }}>
                  <div>
                    <div style={{ fontFamily: D.display, fontSize: isMobile ? 22 : 28, color: D.ink, letterSpacing: -0.4 }}>${p.price.toFixed(2)}</div>
                    <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>MOQ {p.moq}</div>
                  </div>
                  <button onClick={() => cartStore.add(p.sku)} aria-label={`Add ${p.name}`} className="um-add-btn" style={{ background: D.ink, color: D.paper, border: 'none', width: 44, height: 44, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon.plus />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {/* trailing breathing room so the last card can snap into view */}
        <div aria-hidden="true" style={{ flex: `0 0 ${padX}px` }} />
      </div>
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: `0 ${padX}px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1.2, color: D.ink3, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-block', width: 36, height: 1, background: D.ink3 }} />
          SCROLL
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live inventory widget — reads the WMS availability projection       */
/* (on_hand − reserved) straight off the ledger-backed `inventory`     */
/* table, so the homepage shows the same truth as storefront + admin.  */
/* ------------------------------------------------------------------ */
function LiveInventoryWidget() {
  const inv = db.useTable('inventory');
  const s = availability.summary();
  const inStockSkus = availability.stockBySku();
  let live = 0;
  for (const v of inStockSkus.values()) if (v.available > 0) live += 1;
  void inv;
  const stats = [
    { v: s.total_available.toLocaleString(), l: 'Units available now' },
    { v: live.toLocaleString(), l: 'SKUs in stock' },
    { v: s.total_reserved.toLocaleString(), l: 'Units reserved' },
  ];
  return (
    <Reveal>
      <div style={{ border: `1px solid ${D.ink}`, borderRadius: 6, padding: 20, marginBottom: 18, background: D.card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: '#2e7d5f', animation: 'umPulse 2.6s ease-in-out infinite' }} />
          <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1.4, color: D.plum }}>LIVE INVENTORY · WMS</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {stats.map((st) => (
            <div key={st.l}>
              <div style={{ fontFamily: D.display, fontSize: 30, letterSpacing: -0.5, color: D.ink }}>{st.v}</div>
              <div style={{ fontSize: 11, color: D.ink2, marginTop: 4, lineHeight: 1.3 }}>{st.l}</div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ */
/* OwnedInventory — the stocked + sourced model as plain editorial:    */
/* headline left, live widget + hairline fact rows right.              */
/* ------------------------------------------------------------------ */
function OwnedInventory() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  const facts = [
    { stat: 'GA', label: 'Georgia warehouse', sub: 'Our Lithia Springs, GA warehouse ships to all 50 states and territories.' },
    { stat: 'Direct', label: 'Manufacturer relationships', sub: 'Core categories bought direct and held as owned stock in our own warehouse.' },
    { stat: '2pm', label: 'Same-day cutoff', sub: 'Orders placed before 2pm EST on stocked items ship the same day.' },
  ];
  return (
    <div style={{ background: D.paperAlt, padding: `${isMobile ? 64 : 110}px ${padX}px`, borderTop: `1px solid ${D.line}` }}>
      <div style={{
        maxWidth: 1360, margin: '0 auto',
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1fr',
        gap: isMobile ? 40 : 80, alignItems: 'start',
      }}>
        <Reveal>
          <Eyebrow style={{ marginBottom: 18 }}>Stocked + sourced</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 58px)', fontWeight: 400, letterSpacing: '-0.015em', lineHeight: 1.04, margin: 0, color: D.ink }}>
            Stocked when you need it today. <Grad>Sourced when you don&apos;t.</Grad>
          </h2>
          <p style={{ fontSize: isMobile ? 14.5 : 16.5, lineHeight: 1.65, color: D.ink2, marginTop: 20, maxWidth: 520 }}>
            We buy our core categories direct from manufacturers and hold that stock in our own
            Georgia warehouse. For everything else, our vetted sourcing network finds it fast —
            with transparent pricing either way.
          </p>
          <button
            onClick={() => navigate('/catalog')}
            style={{
              background: D.ink, color: D.paper, border: 'none',
              padding: isMobile ? '14px 24px' : '16px 30px', borderRadius: 4,
              fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans,
              display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 28,
            }}
          >
            Browse stocked catalog <Icon.arrow />
          </button>
        </Reveal>
        <div>
          <LiveInventoryWidget />
          {facts.map((f, i) => (
            <Reveal key={f.label} delay={i * 80}>
              <div style={{
                display: 'grid', gridTemplateColumns: isMobile ? '92px 1fr' : '130px 1fr',
                gap: isMobile ? 16 : 28, alignItems: 'baseline',
                padding: `${isMobile ? 22 : 28}px 0`,
                borderTop: `1px solid ${D.line}`,
              }}>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 40 : 54, letterSpacing: '-0.02em', color: D.plum, lineHeight: 1 }}>{f.stat}</div>
                <div>
                  <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 600, color: D.ink }}>{f.label}</div>
                  <div style={{ fontSize: isMobile ? 13 : 14, lineHeight: 1.6, color: D.ink2, marginTop: 6 }}>{f.sub}</div>
                </div>
              </div>
            </Reveal>
          ))}
          <div style={{ borderTop: `1px solid ${D.line}` }} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shortage strip — the no-EDI intake play, one line + one action      */
/* ------------------------------------------------------------------ */
function ShortageStrip() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <div style={{ background: D.inkDeep, color: D.paper, padding: `${isMobile ? 64 : 100}px ${padX}px` }}>
      <div style={{
        maxWidth: 1360, margin: '0 auto',
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto',
        gap: isMobile ? 28 : 64, alignItems: 'center',
      }}>
        <Reveal>
          <Eyebrow dark style={{ marginBottom: 16 }}>No EDI · No portal setup · No formatting</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(30px, 5vw, 58px)', fontWeight: 400, letterSpacing: '-0.015em', lineHeight: 1.04, margin: 0 }}>
            Backordered somewhere else?<br />
            <Grad style={{ color: D.plumSoft }}>Paste your shortage list.</Grad>
          </h2>
          <p style={{ fontSize: isMobile ? 14.5 : 16, lineHeight: 1.6, color: 'rgba(243,242,235,.72)', marginTop: 16, maxWidth: 560 }}>
            Upload or paste your shortage list and we return a quote — items we stock are matched
            against our own live inventory, and the rest goes to our sourcing network.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: 12 }}>
            <button
              onClick={() => navigate('/shortage-list')}
              style={{
                background: D.paper, color: D.ink, border: 'none',
                padding: isMobile ? '15px 26px' : '18px 34px', borderRadius: 4,
                fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans,
                display: 'inline-flex', alignItems: 'center', gap: 10,
              }}
            >
              Match my list <Icon.arrow />
            </button>
            <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: 'rgba(243,242,235,.55)' }}>
              FREE · TAKES ~60 SECONDS
            </span>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Partner spotlight — surgical-green band, oversized serif pull quote */
/* ------------------------------------------------------------------ */
function PartnerSpotlight() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <div style={{ background: D.plum, color: D.paper, padding: `${isMobile ? 64 : 120}px ${padX}px`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative' }}>
        <Reveal>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 2, color: D.plumSoft, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden="true" style={{ width: 28, height: 1, background: D.plumSoft }} />
            PARTNER SPOTLIGHT
          </div>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 6vw, 68px)', fontWeight: 400, letterSpacing: '-0.015em', lineHeight: 1.06, margin: 0 }}>
            &ldquo;We built their patient recovery store. <em style={{ color: D.terraSoft }}>They put their name on it.</em>&rdquo;
          </h2>
          <p style={{ fontSize: isMobile ? 15 : 17, lineHeight: 1.65, color: 'rgba(243,242,235,.82)', marginTop: 28, maxWidth: 820 }}>
            Total Joint Specialists — one of the most respected orthopedic groups in the
            country — chose Unite to build, stock, and fulfill their entire Patient Recovery
            Store. From product manufacturing to same-day drop shipping, every order flows
            through our platform.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
            <a
              href="https://tjs.unitemedical.net/store"
              target="_blank"
              rel="noreferrer"
              style={{ background: D.paper, color: D.plum, padding: '14px 26px', borderRadius: 4, fontSize: 14, fontWeight: 600 }}
            >
              Visit the TJS Recovery Store →
            </a>
            <Link
              to="/case-studies/tjs"
              style={{ background: 'transparent', color: D.paper, border: `1px solid rgba(243,242,235,.5)`, padding: '13px 26px', borderRadius: 4, fontSize: 14, fontWeight: 500 }}
            >
              Read the case study →
            </Link>
          </div>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plumSoft, marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(243,242,235,.22)' }}>
            White-label storefront · Product manufacturing · Direct-to-patient fulfillment
          </div>
        </Reveal>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Testimonials — three hairline columns, print-style attributions     */
/* ------------------------------------------------------------------ */
function Testimonials() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <div style={{ background: D.paper, padding: `${isMobile ? 64 : 110}px ${padX}px` }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <Reveal>
          <Eyebrow style={{ marginBottom: isMobile ? 24 : 40 }}>What customers say</Eyebrow>
        </Reveal>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          borderTop: `1px solid ${D.ink}`,
        }}>
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 80}>
              <figure style={{
                margin: 0,
                padding: isMobile ? '24px 0' : '36px 32px 36px 0',
                marginRight: !isMobile && i < 2 ? 0 : undefined,
                borderRight: !isMobile && i < 2 ? `1px solid ${D.line}` : 'none',
                borderBottom: isMobile ? `1px solid ${D.line}` : 'none',
                paddingLeft: !isMobile && i > 0 ? 32 : 0,
                height: '100%',
                display: 'flex', flexDirection: 'column',
                boxSizing: 'border-box',
              }}>
                <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum, marginBottom: 18 }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <blockquote style={{ margin: 0, fontFamily: D.display, fontSize: isMobile ? 19 : 23, letterSpacing: '-0.01em', lineHeight: 1.32, fontStyle: 'italic', flex: 1, color: D.ink }}>
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption style={{ marginTop: 20, fontSize: 13, paddingTop: 16, borderTop: `1px solid ${D.line}`, color: D.ink2 }}>
                  <div style={{ fontWeight: 600, color: D.ink }}>{t.name}</div>
                  <div style={{ marginTop: 2 }}>{t.title} · {t.org}</div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CTA — centered mega-type sign-off                                   */
/* ------------------------------------------------------------------ */
function CTA() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <div style={{ padding: `${isMobile ? 80 : 150}px ${padX}px`, background: D.inkDeep, color: D.paper, position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(44px, 10vw, 120px)', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 0.98, margin: 0 }}>
            Enter data once.<br />
            <Grad style={{ color: D.plumSoft }}>Sync everything.</Grad>
          </h2>
          <div style={{ fontSize: isMobile ? 15 : 17, lineHeight: 1.6, color: 'rgba(243,242,235,.66)', margin: `${isMobile ? 24 : 36}px auto 0`, maxWidth: 560 }}>
            Request a quote → get an instant, fully landed, compliance-checked price you can
            trust. Accept online and it becomes an order. No guesswork, no waiting, no
            back-and-forth.
          </div>
          <button onClick={() => navigate('/quote')} style={{ background: D.paper, color: D.ink, border: 'none', padding: isMobile ? '15px 28px' : '17px 34px', borderRadius: 4, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans, display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: isMobile ? 28 : 44 }}>
            Start a quote <Icon.arrow />
          </button>
        </Reveal>
      </div>
    </div>
  );
}

export function Homepage() {
  useSEO({
    title: 'The supply chain your suppliers use',
    description:
      'Veteran-owned, FDA-registered wholesale medical supply for surgery centers, pharmacies, health systems, government, and regional distributors. No minimums on stocked items. Same-day shipping on orders before 2pm EST from our Georgia warehouse.',
    canonical: '/',
    type: 'website',
    jsonLd: [organizationSchema(), websiteSchema()],
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink }}>
      <Nav />
      <Hero />
      <PartnerMarquee
        background={D.paper}
        borderColor={D.line}
        variant="ink"
        eyebrowColor={D.plum}
      />
      <Metrics />
      <WhoWeServe />
      <TwoWaysToBuy />
      <Featured />
      <OwnedInventory />
      <ShortageStrip />
      <PartnerSpotlight />
      <Testimonials />
      <CTA />
      <Footer />
    </div>
  );
}
