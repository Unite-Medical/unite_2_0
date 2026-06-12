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
import { PRODUCTS, TRUST_METRICS } from '../data/index.js';
import { TESTIMONIALS } from '../data/testimonials.js';
import { IMG, PRODUCT_IMG, productCutout } from '../lib/imageMap.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO, organizationSchema, websiteSchema } from '../lib/seo.js';

/* ------------------------------------------------------------------ */
/* Hero — cinematic full-bleed: the photograph IS the first screen.    */
/* Deep-ink scrim, cream display type overlaid bottom-left, live       */
/* inventory ticker pinned along the hero's bottom hairline.           */
/* ------------------------------------------------------------------ */
function Hero() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <section
      id="main"
      style={{
        position: 'relative',
        background: D.inkDeep,
        color: D.paper,
        minHeight: isMobile ? '86svh' : '92svh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        overflow: 'hidden',
      }}
    >
      {/* Full-bleed photography behind everything */}
      <div className="um-hero-media" aria-hidden="true">
        <img src={IMG.HOME_HERO} alt="" fetchPriority="high" decoding="async" />
        <div className="um-hero-scrim" />
      </div>

      {/* Headline block, pinned low like a film title card */}
      <div style={{ position: 'relative', padding: `${isMobile ? 120 : 160}px ${padX}px 0` }}>
        <div className="um-fade-up" style={{ maxWidth: 1360, margin: '0 auto' }}>
          <Eyebrow dark pulse style={{ marginBottom: isMobile ? 18 : 28 }}>FDA-REGISTERED · VETERAN-OWNED · EST. 2019</Eyebrow>
          <h1 style={{
            fontFamily: D.display, fontWeight: 400,
            fontSize: 'clamp(46px, 10.5vw, 138px)',
            lineHeight: 0.94,
            letterSpacing: '-0.035em',
            color: D.paper, margin: 0,
            paddingBottom: '0.06em',
            maxWidth: '10.5em',
            textShadow: '0 2px 40px rgba(24,16,27,.45)',
          }}>
            The supply chain your <Grad>suppliers</Grad> use.
          </h1>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(360px, 640px) auto',
            gap: isMobile ? 22 : 56,
            alignItems: 'end',
            marginTop: isMobile ? 20 : 36,
            paddingBottom: isMobile ? 28 : 56,
          }}>
            <p style={{ fontSize: isMobile ? 15.5 : 18, lineHeight: 1.55, color: 'rgba(247,242,234,.82)', margin: 0 }}>
              We source, stock, and ship Class 1 and Class 2 medical devices for surgery centers,
              pharmacies, health systems, physician groups, and government buyers. We own and
              warehouse everything we sell. No minimum orders on stocked items. Landed cost,
              transparent.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/catalog')} style={{ background: D.paper, color: D.ink, border: 'none', padding: isMobile ? '14px 22px' : '16px 28px', borderRadius: 999, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans, display: 'flex', alignItems: 'center', gap: 10, flex: isMobile ? '1 1 200px' : '0 0 auto', justifyContent: 'center' }}>
                Browse products <Icon.arrow />
              </button>
              <button onClick={() => navigate('/quote')} className="um-glass-btn" style={{ color: D.paper, padding: isMobile ? '14px 22px' : '16px 28px', borderRadius: 999, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: D.sans, flex: isMobile ? '1 1 200px' : '0 0 auto' }}>
                Source &amp; quote
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live-inventory ticker along the hero's bottom hairline */}
      <div style={{ position: 'relative', borderTop: '1px solid rgba(247,242,234,.18)', background: 'rgba(24,16,27,.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
        <div style={{
          maxWidth: 1360, margin: '0 auto', padding: `${isMobile ? 12 : 16}px ${padX}px`,
          display: 'flex', alignItems: 'center', gap: isMobile ? 14 : 28, flexWrap: 'wrap',
          fontFamily: D.mono, fontSize: isMobile ? 10 : 11, letterSpacing: 1.1,
          color: 'rgba(247,242,234,.72)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: '#5fbd8a', display: 'inline-block', animation: 'umPulse 2.6s ease-in-out infinite' }} />
            LIVE INVENTORY
          </span>
          <span style={{ opacity: .35 }}>/</span>
          <span>STOCKED &amp; WAREHOUSED</span>
          <span style={{ opacity: .35 }}>/</span>
          <span>GEORGIA &amp; NEVADA</span>
          {!isMobile && <>
            <span style={{ opacity: .35 }}>/</span>
            <span>SAME-DAY SHIPPING · ORDERS BEFORE 2PM EST</span>
          </>}
          {/* TODO(alex): wire to Shopify product/inventory count API
              once available — see PRD Open Q #2. */}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Metrics — dark purple liquid glass. Frosted bevelled stat panes     */
/* float over an aggressive plum canvas (layered blooms + film grain). */
/* The cursor-glide sheen is driven globally (lib/glassSheen.js).      */
/* ------------------------------------------------------------------ */
function Metrics() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;

  return (
    <div
      style={{
        color: D.paper,
        padding: `${isMobile ? 72 : 120}px ${padX}px`,
        background: `linear-gradient(160deg, #1e0e23 0%, #2e1135 60%, #1a0c1f 100%)`,
      }}
    >
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <Reveal>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plumSoft, marginBottom: 20 }}>BY THE NUMBERS</div>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(38px, 7.5vw, 84px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 0.98, margin: 0 }}>
            The receipts. <Grad>Verified.</Grad>
          </h2>
        </Reveal>
        {/* Plain hairline grid — registration numbers ARE the design. */}
        <div style={{
          marginTop: isMobile ? 36 : 64,
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: isMobile ? '0 20px' : '0 40px',
        }}>
          {TRUST_METRICS.map((t, i) => (
            <Reveal key={i} delay={i * 80}>
              <div style={{ borderTop: '1px solid rgba(247,242,234,.22)', padding: `${isMobile ? 18 : 26}px 0 ${isMobile ? 22 : 8}px` }}>
                <div style={{ fontFamily: D.mono, fontSize: isMobile ? 9.5 : 11, letterSpacing: 1.2, color: 'rgba(247,242,234,.6)', lineHeight: 1.5 }}>
                  {t.small.toUpperCase()}
                </div>
                <div style={{
                  fontFamily: D.display,
                  // One fixed scale for every card so long registration
                  // codes wrap instead of dictating the row's rhythm.
                  fontSize: isMobile ? 'clamp(22px, 6vw, 32px)' : 'clamp(28px, 2.6vw, 42px)',
                  letterSpacing: -1, lineHeight: 1.06,
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
/* Two ways to buy — tall split panels that fully invert on hover      */
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
    <div style={{ background: D.paper, padding: `${isMobile ? 64 : 120}px ${padX}px`, borderBottom: `1px solid ${D.line}` }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <Reveal>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 18 }}>TWO WAYS TO BUY</div>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 8.5vw, 104px)', fontWeight: 400, letterSpacing: '-0.035em', lineHeight: 0.96, margin: 0 }}>
            Two ways <Grad>to buy.</Grad>
          </h2>
        </Reveal>
        <div style={{ marginTop: isMobile ? 32 : 64, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 24 }}>
          {panels.map((c, i) => (
            <Reveal key={c.n} delay={i * 110}>
              <button
                className="um-flip-panel"
                onClick={() => navigate(c.path)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  width: '100%', textAlign: 'left',
                  minHeight: isMobile ? 280 : 420,
                  borderRadius: 28, padding: isMobile ? 28 : 44,
                  cursor: 'pointer', position: 'relative', overflow: 'hidden',
                  fontFamily: D.sans,
                }}
              >
                <span aria-hidden="true" className="um-flip-numeral" style={{
                  position: 'absolute', top: isMobile ? -8 : -16, right: isMobile ? 10 : 18,
                  fontFamily: D.display, fontSize: isMobile ? 110 : 190, lineHeight: 1,
                  letterSpacing: '-0.05em', userSelect: 'none',
                }}>{c.n}</span>
                <span style={{ fontFamily: D.display, fontSize: isMobile ? 30 : 44, letterSpacing: -0.8, lineHeight: 1.05, position: 'relative' }}>{c.h}</span>
                <span className="um-flip-sub" style={{ fontSize: isMobile ? 15 : 17, lineHeight: 1.6, marginTop: 16, maxWidth: 440, position: 'relative', flex: 1 }}>
                  {c.p}
                </span>
                <span className="um-flip-cta" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: isMobile ? '13px 22px' : '15px 26px', borderRadius: 999,
                  fontSize: 14, fontWeight: 600, marginTop: 24, position: 'relative',
                }}>
                  {c.cta} <Icon.arrow />
                </span>
              </button>
            </Reveal>
          ))}
        </div>
        <p style={{ fontSize: 14, color: D.ink2, marginTop: 32, maxWidth: 700 }}>
          Don&apos;t see your segment? We work with any facility that buys medical supplies.{' '}
          <Link to="/quote" style={{ color: D.plum, textDecoration: 'underline', textUnderlineOffset: 3 }}>Start a quote →</Link>
        </p>
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
  return (
    <div style={{ padding: `${isMobile ? 72 : 140}px 0`, background: D.paperAlt, overflow: 'hidden' }}>
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: `0 ${padX}px` }}>
        <Reveal>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', flexDirection: isMobile ? 'column' : 'row', gap: 14 }}>
            <h2 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 7.6vw, 96px)', fontWeight: 400, letterSpacing: '-0.03em', color: D.ink, margin: 0, lineHeight: 0.98 }}>
              In stock, <Grad>shipping today</Grad>.
            </h2>
            <button onClick={() => navigate('/catalog')} style={{ color: D.ink, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: `1.5px solid ${D.ink}`, borderRadius: 999, padding: '12px 22px', cursor: 'pointer', fontFamily: D.sans, whiteSpace: 'nowrap' }}>
              Browse products <Icon.arrow />
            </button>
          </div>
        </Reveal>
      </div>

      {/* Rail bleeds across the full viewport; cards snap as you scroll */}
      <div
        className="um-rail"
        style={{
          display: 'flex', gap: isMobile ? 12 : 20,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          paddingTop: isMobile ? 28 : 48,
          paddingBottom: 8,
          // Align the first card with the 1360px container, then bleed right
          paddingLeft: `max(${padX}px, calc((100vw - 1360px) / 2 + ${padX}px))`,
          paddingRight: padX,
          scrollPaddingLeft: `max(${padX}px, calc((100vw - 1360px) / 2 + ${padX}px))`,
        }}
      >
        {picks.map((p, i) => {
          const cutout = productCutout(p.sku);
          // Alternate soft washes behind the floating cutouts so the
          // rail reads as a sequence, not a repeat.
          const wash = [
            'radial-gradient(120% 100% at 50% 108%, rgba(94,41,99,.16), transparent 62%), linear-gradient(165deg, #f6efe2 0%, #ece0cd 100%)',
            'radial-gradient(120% 100% at 50% 108%, rgba(246,79,0,.13), transparent 62%), linear-gradient(165deg, #f7f0e4 0%, #efe2cf 100%)',
            'radial-gradient(120% 100% at 50% 108%, rgba(95,189,138,.14), transparent 62%), linear-gradient(165deg, #f5efe3 0%, #eadfd0 100%)',
          ][i % 3];
          return (
            <article
              key={p.sku}
              className="um-card"
              style={{
                flex: `0 0 ${isMobile ? 262 : 396}px`,
                scrollSnapAlign: 'start',
                background: D.card, borderRadius: 20, overflow: 'hidden',
                border: `1px solid ${D.line}`,
                display: 'flex', flexDirection: 'column',
              }}
            >
              {cutout ? (
                <Link to={`/products/${p.sku}`} aria-label={p.name} style={{ display: 'block' }}>
                  <div className="um-cutout-stage" style={{
                    height: isMobile ? 196 : 312, position: 'relative',
                    display: 'grid', placeItems: 'center',
                    background: wash, borderBottom: `1px solid ${D.line}`,
                    overflow: 'hidden',
                  }}>
                    {/* floor shadow the cutout "stands" on */}
                    <div aria-hidden="true" style={{
                      position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
                      width: '58%', height: 14, borderRadius: '50%',
                      background: 'radial-gradient(ellipse, rgba(36,26,40,.18), transparent 70%)',
                    }} />
                    <img
                      className="um-cutout-img"
                      src={cutout}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      style={{ maxWidth: '80%', maxHeight: '84%', objectFit: 'contain', position: 'relative' }}
                    />
                    <span style={{
                      position: 'absolute', top: 12, left: 12,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontFamily: D.mono, fontSize: 9, letterSpacing: 1,
                      color: D.ink2, background: 'rgba(251,247,239,.78)',
                      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                      border: `1px solid ${D.line}`, borderRadius: 999, padding: '4px 10px',
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: 3, background: '#5fbd8a', display: 'inline-block', animation: 'umPulse 2.6s ease-in-out infinite' }} />
                      IN STOCK
                    </span>
                  </div>
                </Link>
              ) : (
                <PhotoPlaceholder src={PRODUCT_IMG[p.sku]} caption={p.img} height={isMobile ? 196 : 312} stripeFrom="#ebe3d3" stripeTo="#ddd1b7" textColor={D.plum} />
              )}
              <div style={{ padding: isMobile ? 18 : 24, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: D.mono, fontSize: 10, letterSpacing: 0.8, color: D.ink3 }}>
                  <span>{p.sku}</span>
                  <span style={{ display: isMobile ? 'none' : 'inline' }}>HCPCS {p.hcpcs}</span>
                </div>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 18 : 23, color: D.ink, marginTop: 10, lineHeight: 1.25, flex: 1 }}>{p.name}</div>
                <div style={{ fontSize: 13, color: D.ink2, marginTop: 6 }}>{p.cat} · {p.packSize}</div>
                <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', marginTop: 18 }}>
                  <div>
                    <div style={{ fontFamily: D.display, fontSize: isMobile ? 22 : 30, color: D.plum, letterSpacing: -0.4 }}>${p.price.toFixed(2)}</div>
                    <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>MOQ {p.moq}</div>
                  </div>
                  <button onClick={() => cartStore.add(p.sku)} aria-label={`Add ${p.name}`} className="um-add-btn" style={{ background: D.ink, color: D.paper, border: 'none', width: 46, height: 46, borderRadius: 23, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
/* Shortage strip — the no-EDI intake play, one line + one action      */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* OwnedInventory — clean fact band. The "zero middlemen" pitch as     */
/* plain editorial: headline left, three hairline fact rows right.     */
/* No photography, no glass — procurement buyers want the numbers.     */
/* ------------------------------------------------------------------ */
function OwnedInventory() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  const facts = [
    { stat: '0', label: 'Middlemen', sub: 'Inventory owned and shipped from Unite-operated distribution centers.' },
    { stat: '2', label: 'Warehouses', sub: 'Lithia Springs, GA and Las Vegas, NV — coverage on both coasts.' },
    { stat: '2pm', label: 'Same-day cutoff', sub: 'Orders placed before 2pm EST on stocked items ship the same day.' },
  ];
  return (
    <div style={{ background: D.paper, padding: `${isMobile ? 64 : 120}px ${padX}px`, borderTop: `1px solid ${D.line}` }}>
      <div style={{
        maxWidth: 1360, margin: '0 auto',
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1fr',
        gap: isMobile ? 40 : 80, alignItems: 'start',
      }}>
        <Reveal>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 18 }}>OWNED INVENTORY</div>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(30px, 5vw, 58px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.04, margin: 0, color: D.ink }}>
            Most supplies cross four distributors before they reach you. <Grad>Ours cross zero.</Grad>
          </h2>
          <p style={{ fontSize: isMobile ? 14.5 : 16.5, lineHeight: 1.65, color: D.ink2, marginTop: 20, maxWidth: 520 }}>
            We buy direct from manufacturers, hold the stock in our own buildings, and ship it
            ourselves. No brokered inventory, no surprise substitutions, no third-party markups.
          </p>
          <button
            onClick={() => navigate('/catalog')}
            style={{
              background: D.ink, color: D.paper, border: 'none',
              padding: isMobile ? '14px 24px' : '16px 30px', borderRadius: 999,
              fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans,
              display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 28,
            }}
          >
            Browse stocked catalog <Icon.arrow />
          </button>
        </Reveal>
        <div>
          {facts.map((f, i) => (
            <Reveal key={f.label} delay={i * 90}>
              <div style={{
                display: 'grid', gridTemplateColumns: isMobile ? '92px 1fr' : '130px 1fr',
                gap: isMobile ? 16 : 28, alignItems: 'baseline',
                padding: `${isMobile ? 22 : 30}px 0`,
                borderTop: `1px solid ${D.line}`,
              }}>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 40 : 56, letterSpacing: '-0.03em', color: D.plum, lineHeight: 1 }}>{f.stat}</div>
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

function ShortageStrip() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <div style={{ background: D.inkDeep, color: D.paper, padding: `${isMobile ? 64 : 110}px ${padX}px` }}>
      <div style={{
        maxWidth: 1360, margin: '0 auto',
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto',
        gap: isMobile ? 28 : 64, alignItems: 'center',
      }}>
        <Reveal>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plumSoft, marginBottom: 16 }}>
            NO EDI · NO PORTAL SETUP · NO FORMATTING
          </div>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 5vw, 56px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.04, margin: 0 }}>
            Backordered somewhere else?<br />
            <Grad>Paste your shortage list.</Grad>
          </h2>
          <p style={{ fontSize: isMobile ? 14.5 : 16, lineHeight: 1.6, color: 'rgba(247,242,234,.78)', marginTop: 16, maxWidth: 560 }}>
            We match every line against stocked inventory in real time, surface in-stock
            equivalents, and route the rest to our sourcing network.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: 12 }}>
            <button
              onClick={() => navigate('/shortage-list')}
              style={{
                background: D.paper, color: D.ink, border: 'none',
                padding: isMobile ? '15px 26px' : '18px 34px', borderRadius: 999,
                fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans,
                display: 'inline-flex', alignItems: 'center', gap: 10,
              }}
            >
              Match my list <Icon.arrow />
            </button>
            <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: 'rgba(247,242,234,.6)' }}>
              FREE · TAKES ~60 SECONDS
            </span>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Partner spotlight — full-bleed plum band, oversized pull quote      */
/* ------------------------------------------------------------------ */
function PartnerSpotlight() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <div style={{ background: D.plum, color: D.paper, padding: `${isMobile ? 64 : 130}px ${padX}px`, position: 'relative', overflow: 'hidden' }}>
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `
          radial-gradient(700px 500px at 100% 0%, rgba(36,26,40,.5), transparent 70%),
          radial-gradient(520px 400px at 0% 100%, rgba(246,79,0,.14), transparent 70%)`,
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', top: isMobile ? -30 : -60, left: isMobile ? -10 : 0,
        fontFamily: D.display, fontSize: isMobile ? 220 : 420, lineHeight: 1,
        color: 'rgba(247,242,234,.07)', userSelect: 'none', pointerEvents: 'none',
      }}>&ldquo;</div>
      <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative' }}>
        <Reveal>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plumSoft, marginBottom: 24 }}>PARTNER SPOTLIGHT</div>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(30px, 6.2vw, 68px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.04, margin: 0 }}>
            &ldquo;We built their patient recovery store. <em style={{ color: D.terraSoft }}>They put their name on it.</em>&rdquo;
          </h2>
          <p style={{ fontSize: isMobile ? 15 : 17, lineHeight: 1.65, color: '#e5d6e7', marginTop: 28, maxWidth: 820 }}>
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
              style={{ background: D.paper, color: D.plum, padding: '14px 26px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}
            >
              Visit the TJS Recovery Store →
            </a>
            <Link
              to="/case-studies/tjs"
              style={{ background: 'transparent', color: D.paper, border: `1.5px solid rgba(247,242,234,.5)`, padding: '13px 26px', borderRadius: 999, fontSize: 14, fontWeight: 500 }}
            >
              Read the case study →
            </Link>
          </div>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plumSoft, marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(247,242,234,.18)' }}>
            White-label storefront · Product manufacturing · Direct-to-patient fulfillment
          </div>
        </Reveal>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Testimonials — editorial grid, middle card inverted in ink          */
/* ------------------------------------------------------------------ */
function Testimonials() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  return (
    <div style={{ background: D.paper, padding: `${isMobile ? 64 : 120}px ${padX}px` }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <Reveal>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: isMobile ? 24 : 40 }}>WHAT CUSTOMERS SAY</div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 16 : 24, alignItems: 'stretch' }}>
          {TESTIMONIALS.map((t, i) => {
            const inverted = !isMobile && i === 1;
            return (
              <Reveal key={t.name} delay={i * 100} style={{ height: '100%', marginTop: !isMobile && i === 1 ? -24 : 0 }}>
                <figure className="um-card" style={{
                  margin: 0,
                  background: inverted ? D.ink : D.card,
                  color: inverted ? D.paper : D.ink,
                  border: `1px solid ${inverted ? D.ink : D.line}`,
                  borderRadius: 24,
                  padding: isMobile ? 24 : 32,
                  height: inverted ? 'calc(100% + 48px)' : '100%',
                  display: 'flex', flexDirection: 'column',
                  boxSizing: 'border-box',
                }}>
                  <div aria-hidden="true" style={{ fontFamily: D.display, fontSize: 64, lineHeight: 0.55, color: inverted ? 'rgba(247,242,234,.3)' : D.plumSoft, userSelect: 'none', marginBottom: 18 }}>&ldquo;</div>
                  <blockquote style={{ margin: 0, fontFamily: D.display, fontSize: isMobile ? 18 : 21, letterSpacing: -0.3, lineHeight: 1.38, fontStyle: 'italic', flex: 1 }}>
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <figcaption style={{ marginTop: 20, fontSize: 13, paddingTop: 18, borderTop: `1px solid ${inverted ? 'rgba(247,242,234,.2)' : D.line}`, color: inverted ? 'rgba(247,242,234,.7)' : D.ink2 }}>
                    <div style={{ fontWeight: 600, color: inverted ? D.paper : D.ink }}>{t.name}</div>
                    <div style={{ marginTop: 2 }}>{t.title} · {t.org}</div>
                  </figcaption>
                </figure>
              </Reveal>
            );
          })}
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
    <div style={{ padding: `${isMobile ? 80 : 160}px ${padX}px`, background: D.ink, color: D.paper, position: 'relative', overflow: 'hidden' }}>
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `
          radial-gradient(640px 480px at 50% -10%, rgba(94,41,99,.55), transparent 70%),
          radial-gradient(520px 380px at 12% 110%, rgba(246,79,0,.16), transparent 70%)`,
      }} />
      <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(44px, 10.5vw, 124px)', fontWeight: 400, letterSpacing: '-0.04em', lineHeight: 0.96, margin: 0 }}>
            Enter data once.<br />
            <Grad>Sync everything.</Grad>
          </h2>
          <div style={{ fontSize: isMobile ? 15 : 17, lineHeight: 1.6, color: '#cfc4d2', margin: `${isMobile ? 24 : 36}px auto 0`, maxWidth: 560 }}>
            Order placed → inventory updates → invoice auto-creates → label prints → tracking
            returns to your portal. Zero manual touchpoints.
          </div>
          <button onClick={() => navigate('/quote')} style={{ background: D.plum, color: D.paper, border: 'none', padding: isMobile ? '15px 28px' : '17px 34px', borderRadius: 999, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: D.sans, display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: isMobile ? 28 : 44 }}>
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
      'Veteran-owned, FDA-registered wholesale medical supply for surgery centers, pharmacies, health systems, government, and regional distributors. No minimums on stocked items. Same-day shipping on orders before 2pm EST from Georgia & Nevada.',
    canonical: '/',
    type: 'website',
    jsonLd: [organizationSchema(), websiteSchema()],
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink }}>
      {/* Overlay: hero photography runs full-bleed behind the floating capsule */}
      <Nav overlay />
      <Hero />
      <PartnerMarquee
        background={D.inkDeep}
        borderColor="rgba(247,242,234,.12)"
        variant="paper"
        eyebrowColor={D.plumSoft}
      />
      <Metrics />
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
