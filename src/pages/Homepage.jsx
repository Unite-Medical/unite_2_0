import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { PartnerMarquee } from '../components/shared/PartnerMarquee.jsx';
import { db } from '../lib/db.js';
import { availability } from '../lib/wms/availability.js';
import { PRODUCTS, TRUST_METRICS } from '../data/index.js';
import { PRODUCT_IMG, productCutout } from '../lib/imageMap.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO, organizationSchema, websiteSchema } from '../lib/seo.js';
import './homepage.css';

gsap.registerPlugin(ScrollTrigger);

/* ------------------------------------------------------------------ */
/* "Night Freight" redesign. Site copy is byte-identical to the        */
/* previous homepage — only the visual system, imagery, and motion     */
/* changed. Verified by scripts/verify_homepage_copy.mjs.              */
/* ------------------------------------------------------------------ */

const RH = {
  ink: '#0a1210',
  ink2: '#0e1713',
  panel: '#101b16',
  bone: '#f3f2eb',
  bone2: 'rgba(243,242,235,.72)',
  bone3: 'rgba(243,242,235,.5)',
  line: 'rgba(243,242,235,.14)',
  lineStrong: 'rgba(243,242,235,.32)',
  sage: '#9dbcae',
  green: '#2e7d5f',
  amber: '#dcc0a8',
};

const IMGS = {
  hero: '/images/redesign/hero.webp',
  packing: '/images/redesign/packing.webp',
  dock: '/images/redesign/dock.webp',
  ortho: '/images/redesign/ortho.webp',
  pallet: '/images/redesign/pallet.webp',
  highway: '/images/redesign/highway.webp',
};

// Partner logos with real processed SVG assets (paper variant for dark ground).
const LOGO_PARTNERS = [
  { slug: 'veterans-affairs', name: 'U.S. Department of Veterans Affairs', tall: true },
  { slug: 'hca-healthcare', name: 'HCA Healthcare' },
  { slug: 'kaiser-permanente', name: 'Kaiser Permanente' },
  { slug: 'cvs-health', name: 'CVS Health' },
  { slug: 'walgreens', name: 'Walgreens' },
  { slug: 'publix', name: 'Publix' },
  { slug: 'amazon', name: 'Amazon' },
  { slug: 'gopuff', name: 'goPuff' },
  { slug: 'surgery-partners', name: 'Surgery Partners' },
  { slug: 'ascoa', name: 'ASCOA' },
];

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* Sage accent span — replaces the old gradient Grad on the dark system. */
function Accent({ children, style }) {
  return <span style={{ color: RH.sage, fontStyle: 'italic', ...style }}>{children}</span>;
}

/* Word-split headline for GSAP assembly. innerText stays byte-identical. */
function Words({ text, accentFrom = -1, accentTo = -1 }) {
  const words = text.split(' ');
  return words.map((w, i) => (
    <span key={i}>
      <span className="rh-wclip">
        <span className="rh-w" style={i >= accentFrom && i <= accentTo && accentFrom >= 0 ? { color: RH.sage, fontStyle: 'italic' } : undefined}>
          {w}
        </span>
      </span>
      {i < words.length - 1 ? ' ' : ''}
    </span>
  ));
}

/* ------------------------------------------------------------------ */
/* Three.js freight-lattice field — additive luminous points joined     */
/* into drafted geometry, drifting slowly; scroll adds parallax.        */
/* ------------------------------------------------------------------ */
function useHeroField(canvasRef, enabled) {
  useEffect(() => {
    if (!enabled || !canvasRef.current || prefersReducedMotion()) return undefined;
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import('three');
      if (disposed || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60);
      camera.position.set(0, 0.4, 8.5);

      // Deterministic seeded lattice
      let seed = 20190406;
      const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
      const N = 520;
      const pos = new Float32Array(N * 3);
      const col = new Float32Array(N * 3);
      const tints = [new THREE.Color('#c8ddd2'), new THREE.Color('#9dbcae'), new THREE.Color('#e8d9c4')];
      const pts = [];
      for (let i = 0; i < N; i += 1) {
        const x = (rand() - 0.5) * 22;
        const y = (rand() - 0.5) * 9;
        const z = (rand() - 0.5) * 14 - 2;
        pos.set([x, y, z], i * 3);
        pts.push(new THREE.Vector3(x, y, z));
        const c = tints[Math.floor(rand() * tints.length)];
        col.set([c.r, c.g, c.b], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
          attribute vec3 color; varying vec3 vColor; varying float vTw; uniform float uTime;
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float tw = 0.88 + 0.12 * sin(uTime * 0.7 + position.x * 3.1 + position.y * 2.3);
            vTw = tw;
            gl_PointSize = (46.0 / -mv.z) * tw;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          varying vec3 vColor; varying float vTw;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            float core = smoothstep(0.5, 0.12, d);
            gl_FragColor = vec4(vColor * (0.85 + 0.5 * core), core * vTw * 0.85);
          }`,
      });
      const points = new THREE.Points(geo, mat);
      scene.add(points);

      // Join near neighbours into drafted freight-lane linework
      const linePos = [];
      const lineCol = [];
      const light = new THREE.Color('#cfe2d8');
      for (let i = 0; i < N; i += 4) {
        let best = -1; let bestD = 2.6;
        for (let j = 0; j < N; j += 1) {
          if (j === i) continue;
          const d = pts[i].distanceTo(pts[j]);
          if (d < bestD) { bestD = d; best = j; }
        }
        if (best >= 0) {
          linePos.push(pts[i].x, pts[i].y, pts[i].z, pts[best].x, pts[best].y, pts[best].z);
          lineCol.push(light.r, light.g, light.b, light.r * 0.6, light.g * 0.6, light.b * 0.6);
        }
      }
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
      lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineCol, 3));
      const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
      const lines = new THREE.LineSegments(lineGeo, lineMat);
      scene.add(lines);

      const parent = canvas.parentElement;
      const resize = () => {
        const w = parent.clientWidth; const h = parent.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(parent);

      let scrollY = 0;
      const onScroll = () => { scrollY = window.scrollY || 0; };
      window.addEventListener('scroll', onScroll, { passive: true });

      let raf = 0;
      const clock = new THREE.Clock();
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const t = clock.getElapsedTime();
        mat.uniforms.uTime.value = t;
        const drift = t * 0.018;
        points.rotation.y = drift + scrollY * 0.00018;
        lines.rotation.y = drift + scrollY * 0.00018;
        points.position.y = -scrollY * 0.0012;
        lines.position.y = -scrollY * 0.0012;
        renderer.render(scene, camera);
      };
      tick();

      const onVis = () => {
        if (document.hidden) cancelAnimationFrame(raf);
        else { clock.getDelta(); tick(); }
      };
      document.addEventListener('visibilitychange', onVis);

      cleanup = () => {
        cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('scroll', onScroll);
        ro.disconnect();
        geo.dispose(); mat.dispose(); lineGeo.dispose(); lineMat.dispose();
        renderer.dispose();
      };
    })().catch(() => {});
    return () => { disposed = true; cleanup(); };
  }, [canvasRef, enabled]);
}

/* Shared GSAP reveal wiring for a section root. */
function useReveals(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    document.documentElement.classList.add('rh-js');
    if (prefersReducedMotion()) {
      document.documentElement.classList.add('rh-reduced');
      root.querySelectorAll('.rh-rv').forEach((el) => el.classList.add('rh-in'));
      return undefined;
    }
    const ctx = gsap.context(() => {
      root.querySelectorAll('.rh-rv').forEach((el) => {
        ScrollTrigger.create({
          trigger: el, start: 'top 88%', once: true,
          onEnter: () => el.classList.add('rh-in'),
        });
      });
      root.querySelectorAll('[data-rh-parallax]').forEach((el) => {
        gsap.fromTo(el, { yPercent: -8 }, {
          yPercent: 8, ease: 'none',
          scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      });
    }, root);
    const safety = setTimeout(() => {
      root.querySelectorAll('.rh-rv:not(.rh-in)').forEach((el) => el.classList.add('rh-in'));
    }, 4000);
    return () => { clearTimeout(safety); ctx.revert(); };
  }, [rootRef]);
}

function Eyebrow({ children, style }) {
  return (
    <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 2.2, color: RH.sage, display: 'flex', alignItems: 'center', gap: 12, textTransform: 'uppercase', ...style }}>
      <span aria-hidden="true" style={{ width: 28, height: 1, background: RH.sage, display: 'inline-block' }} />
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero — full-viewport night freight cinema                           */
/* ------------------------------------------------------------------ */
function Hero() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 48;
  const headRef = useRef(null);
  const canvasRef = useRef(null);
  useHeroField(canvasRef, !isMobile);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo('.rh-w', { yPercent: 110 }, {
        yPercent: 0, duration: 1.15, ease: 'power4.out', stagger: 0.055, delay: 0.15,
      });
      gsap.fromTo('.rh-hero-fade', { opacity: 0, y: 24 }, {
        opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.12, delay: 0.7,
      });
      gsap.fromTo('.rh-hero-plate', { clipPath: 'inset(0 0 100% 0)' }, {
        clipPath: 'inset(0 0 0% 0)', duration: 1.4, ease: 'power4.inOut', delay: 0.5,
      });
      gsap.fromTo('.rh-hero-plate img', { scale: 1.18 }, {
        scale: 1, duration: 2.2, ease: 'power3.out', delay: 0.5,
      });
    }, headRef);
    return () => ctx.revert();
  }, []);

  return (
    <section id="main" ref={headRef} style={{ position: 'relative', overflow: 'hidden', background: RH.ink }}>
      <div style={{ position: 'relative', maxWidth: 1440, width: '100%', margin: '0 auto', padding: `${isMobile ? 110 : 150}px ${padX}px 0` }}>
        <div className="rh-hero-fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 2.2, color: RH.sage, display: 'inline-flex', alignItems: 'center', gap: 10, textTransform: 'uppercase' }}>
            <span className="rh-pulse" style={{ width: 6, height: 6, borderRadius: 3, background: RH.sage, display: 'inline-block' }} />
            FDA-Registered · Veteran-Owned · Est. 2019
          </span>
          {!isMobile && (
            <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: RH.bone3 }}>
              LITHIA SPRINGS, GA · SHIPS TO ALL 50 STATES
            </span>
          )}
        </div>

        <h1 style={{
          fontFamily: D.display, fontWeight: 400,
          fontSize: 'clamp(52px, 10vw, 158px)',
          lineHeight: 0.94, letterSpacing: '-0.025em',
          margin: `${isMobile ? 26 : 40}px 0 0`, maxWidth: '10.5em', color: RH.bone,
        }}>
          <Words text="The supply chain your suppliers use." accentFrom={4} accentTo={4} />
        </h1>

        <div className="rh-hero-fade" style={{
          borderTop: `1px solid ${RH.lineStrong}`,
          marginTop: isMobile ? 28 : 48, paddingTop: isMobile ? 22 : 28,
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(360px, 620px) 1fr auto',
          gap: isMobile ? 22 : 48, alignItems: 'start',
        }}>
          <p style={{ fontSize: isMobile ? 15.5 : 17.5, lineHeight: 1.65, color: RH.bone2, margin: 0 }}>
            A global supply chain company specializing in medical. We stock and wholesale core
            categories from our Georgia warehouse, and source the rest through our vetted
            manufacturer network — for surgery centers, pharmacies, health systems, physician
            groups, and government buyers. No minimum orders on stocked items. Same-day shipping
            on orders before 2pm EST.
          </p>
          {!isMobile && <span />}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="rh-btn-primary" onClick={() => navigate('/catalog')} style={{ background: RH.bone, color: RH.ink, border: `1px solid ${RH.bone}`, padding: isMobile ? '14px 22px' : '17px 30px', borderRadius: 4, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans, display: 'flex', alignItems: 'center', gap: 10, flex: isMobile ? '1 1 200px' : '0 0 auto', justifyContent: 'center' }}>
              Browse products <Icon.arrow />
            </button>
            <button className="rh-btn-ghost" onClick={() => navigate('/quote')} style={{ background: 'transparent', color: RH.bone, border: `1px solid ${RH.lineStrong}`, padding: isMobile ? '14px 22px' : '17px 30px', borderRadius: 4, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: D.sans, flex: isMobile ? '1 1 200px' : '0 0 auto' }}>
              Source &amp; quote
            </button>
          </div>
        </div>

        {/* Photographic plate — framed, fully visible, curtain-revealed,
            with the Three.js freight-lattice overlaid INSIDE the frame */}
        <div className="rh-hero-plate" style={{ marginTop: isMobile ? 30 : 52, border: `1px solid ${RH.lineStrong}`, borderBottom: 'none', height: isMobile ? 280 : 520, position: 'relative', overflow: 'hidden' }}>
          <img
            src={IMGS.hero}
            alt="Unite Medical warehouse operations"
            fetchPriority="high"
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {!isMobile && <canvas ref={canvasRef} className="rh-hero-canvas" aria-hidden="true" style={{ mixBlendMode: 'screen', opacity: 0.55 }} />}
        </div>
        <div className="rh-hero-fade" style={{
          border: `1px solid ${RH.lineStrong}`,
          background: RH.ink2, color: RH.bone2,
          padding: `${isMobile ? 12 : 15}px ${isMobile ? 14 : 22}px`,
          display: 'flex', alignItems: 'center', gap: isMobile ? 14 : 28, flexWrap: 'wrap',
          fontFamily: D.mono, fontSize: isMobile ? 10 : 11, letterSpacing: 1.1,
          marginBottom: isMobile ? 48 : 72,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="rh-pulse" style={{ width: 6, height: 6, borderRadius: 3, background: '#5fbd8a', display: 'inline-block' }} />
            LIVE INVENTORY
          </span>
          <span style={{ opacity: 0.35 }}>/</span>
          <span>STOCKED &amp; WAREHOUSED</span>
          <span style={{ opacity: 0.35 }}>/</span>
          <span>GEORGIA WAREHOUSE · ALL 50 STATES</span>
          {!isMobile && <>
            <span style={{ opacity: 0.35 }}>/</span>
            <span>SAME-DAY SHIPPING · ORDERS BEFORE 2PM EST</span>
          </>}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Metrics — ledger table over the pallet macro                        */
/* ------------------------------------------------------------------ */
function Metrics() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 48;
  return (
    <div style={{ position: 'relative', color: RH.bone, padding: `${isMobile ? 72 : 130}px ${padX}px`, background: RH.ink2, overflow: 'hidden' }}>
      <div aria-hidden="true" className="rh-media-band" style={{ position: 'absolute', inset: 0, opacity: 0.28 }}>
        <img data-rh-parallax src={IMGS.pallet} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '112%', objectFit: 'cover', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${RH.ink} 0%, rgba(14,23,19,.55) 35%, rgba(14,23,19,.55) 70%, ${RH.ink} 100%)` }} />
      </div>
      <div style={{ maxWidth: 1440, margin: '0 auto', position: 'relative' }}>
        <div className="rh-rv">
          <Eyebrow style={{ marginBottom: 22 }}>By the numbers</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(38px, 7vw, 92px)', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 0.98, margin: 0 }}>
            The receipts. <Accent>Verified.</Accent>
          </h2>
        </div>
        <div style={{
          marginTop: isMobile ? 40 : 70,
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
          gap: isMobile ? '0 20px' : '0 44px',
        }}>
          {TRUST_METRICS.map((t, i) => (
            <div className="rh-rv" key={i} style={{ transitionDelay: `${i * 70}ms` }}>
              <div style={{ borderTop: `1px solid ${RH.lineStrong}`, padding: `${isMobile ? 18 : 26}px 0 ${isMobile ? 22 : 8}px` }}>
                <div style={{ fontFamily: D.mono, fontSize: isMobile ? 9.5 : 11, letterSpacing: 1.2, color: RH.bone3, lineHeight: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t.small.toUpperCase()}</span>
                  <span style={{ opacity: 0.5 }}>{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div style={{
                  fontFamily: D.display,
                  fontSize: isMobile ? 'clamp(22px, 6vw, 32px)' : 'clamp(28px, 2.6vw, 44px)',
                  letterSpacing: '-0.01em', lineHeight: 1.06,
                  color: RH.bone, overflowWrap: 'anywhere', marginTop: 14,
                }}>{t.big}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Who we serve — the customer index, inverting to bone on hover       */
/* ------------------------------------------------------------------ */
const SEGMENTS = [
  { n: '01', h: 'Surgery centers', sub: 'Case-cart staples, bracing, and recovery DME with no minimums and Net-30 on approved credit.', path: '/segments/asc' },
  { n: '02', h: 'Pharmacies & retail', sub: 'OTC, diagnostics, and front-of-store lines — from single stores to regional chains.', path: '/segments/pharmacy' },
  { n: '03', h: 'EMS & fire', sub: 'First-response consumables and trauma supplies, quoted by the pallet or the case.', path: '/segments/ems' },
  { n: '04', h: 'Government & VA', sub: 'MSPV BPA 36C24123A0077 · CAGE 8MK70. A veteran-owned prime with the paperwork done.', path: '/government' },
  { n: '05', h: 'Distributors & resellers', sub: 'Wholesale pricing, opt-in catalog exposure, and custom sourcing under your own brand.', path: '/segments/distributors' },
  { n: '06', h: 'Health systems & physician groups', sub: 'Shortage matching, cross-referenced substitutes, and white-label patient programs.', path: '/shortage-list' },
];

function WhoWeServe() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 48;
  return (
    <div style={{ background: RH.ink, padding: `${isMobile ? 72 : 130}px ${padX}px`, borderTop: `1px solid ${RH.line}` }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        <div className="rh-rv">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <Eyebrow style={{ marginBottom: 20 }}>Who we serve</Eyebrow>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 8vw, 104px)', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 0.98, margin: 0, color: RH.bone }}>
                Built for the people <Accent>who buy.</Accent>
              </h2>
            </div>
            {!isMobile && (
              <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: RH.bone3, paddingBottom: 10 }}>
                SIX BUYER TYPES · ONE WAREHOUSE
              </span>
            )}
          </div>
        </div>
        <div style={{ marginTop: isMobile ? 32 : 64, borderTop: `1px solid ${RH.lineStrong}` }}>
          {SEGMENTS.map((s, i) => (
            <div className="rh-rv" key={s.n} style={{ transitionDelay: `${i * 50}ms` }}>
              <Link
                to={s.path}
                className="rh-index-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '44px 1fr 24px' : '90px 1fr 1.2fr 40px',
                  alignItems: 'center',
                  gap: isMobile ? 12 : 32,
                  padding: `${isMobile ? 18 : 30}px ${isMobile ? 4 : 10}px`,
                  borderBottom: `1px solid ${RH.line}`,
                  color: RH.bone, textDecoration: 'none',
                }}
              >
                <span className="rh-row-num" style={{ fontFamily: D.mono, fontSize: isMobile ? 11 : 13, letterSpacing: 1, color: RH.sage }}>{s.n}</span>
                <span style={{ fontFamily: D.display, fontSize: isMobile ? 24 : 44, letterSpacing: '-0.01em', lineHeight: 1.05 }}>{s.h}</span>
                {!isMobile && <span className="rh-row-sub" style={{ fontSize: 15, lineHeight: 1.55, color: RH.bone2 }}>{s.sub}</span>}
                <Icon.arrow className="rh-row-arrow" style={{ justifySelf: 'end' }} />
              </Link>
            </div>
          ))}
        </div>
        <p className="rh-rv" style={{ fontSize: 14, color: RH.bone2, marginTop: 26, maxWidth: 700 }}>
          Don&apos;t see your segment? We work with any facility that buys medical supplies.{' '}
          <Link to="/quote" style={{ color: RH.sage, textDecoration: 'underline', textUnderlineOffset: 3 }}>Start a quote →</Link>
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Two ways to buy — packing-bench media band + twin panels            */
/* ------------------------------------------------------------------ */
function TwoWaysToBuy() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 48;
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
    <div style={{ background: RH.ink2, padding: `${isMobile ? 72 : 130}px ${padX}px`, borderTop: `1px solid ${RH.line}` }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        <div className="rh-rv" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 26 : 60, alignItems: 'end' }}>
          <div>
            <Eyebrow style={{ marginBottom: 20 }}>Two ways to buy</Eyebrow>
            <h2 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 8vw, 104px)', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 0.98, margin: 0, color: RH.bone }}>
              Two ways <Accent>to buy.</Accent>
            </h2>
          </div>
          <div className="rh-media-band" style={{ height: isMobile ? 180 : 260, border: `1px solid ${RH.line}` }}>
            <img data-rh-parallax src={IMGS.packing} alt="Unite Medical warehouse operations" loading="lazy" decoding="async" style={{ width: '100%', height: '112%', objectFit: 'cover', display: 'block' }} />
          </div>
        </div>
        <div style={{ marginTop: isMobile ? 32 : 56, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 24 }}>
          {panels.map((c, i) => (
            <div className="rh-rv" key={c.n} style={{ transitionDelay: `${i * 90}ms` }}>
              <button
                className="rh-panel-btn"
                onClick={() => navigate(c.path)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  width: '100%', textAlign: 'left',
                  minHeight: isMobile ? 260 : 380,
                  border: `1px solid ${RH.line}`, borderRadius: 6,
                  background: 'transparent', color: RH.bone,
                  padding: isMobile ? 26 : 44,
                  cursor: 'pointer', position: 'relative', overflow: 'hidden',
                  fontFamily: D.sans,
                }}
              >
                <span aria-hidden="true" style={{
                  position: 'absolute', top: isMobile ? -6 : -18, right: isMobile ? 10 : 22,
                  fontFamily: D.display, fontSize: isMobile ? 110 : 200, lineHeight: 1,
                  letterSpacing: '-0.03em', userSelect: 'none', color: 'rgba(157,188,174,.12)',
                }}>{c.n}</span>
                <span style={{ fontFamily: D.display, fontSize: isMobile ? 30 : 48, letterSpacing: -0.5, lineHeight: 1.05, position: 'relative' }}>{c.h}</span>
                <span style={{ fontSize: isMobile ? 15 : 16.5, lineHeight: 1.6, marginTop: 16, maxWidth: 440, position: 'relative', flex: 1, color: RH.bone2 }}>
                  {c.p}
                </span>
                <span className="rh-panel-cta" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: isMobile ? '13px 22px' : '14px 26px', borderRadius: 4,
                  fontSize: 14, fontWeight: 600, marginTop: 24, position: 'relative',
                  border: `1px solid ${RH.lineStrong}`, color: RH.bone,
                }}>
                  {c.cta} <Icon.arrow />
                </span>
              </button>
            </div>
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
  const padX = isMobile ? 20 : 48;
  const picks = PRODUCTS.slice(0, 8);
  const railRef = useRef(null);
  const inv = db.useTable('inventory');
  const stockBySku = availability.stockBySku();
  void inv;

  function scrollRail(dir) {
    const rail = railRef.current;
    if (!rail) return;
    const cardWidth = (isMobile ? 262 : 396) + (isMobile ? 12 : 20);
    rail.scrollBy({ left: dir * cardWidth, behavior: 'smooth' });
  }

  return (
    <div style={{ padding: `${isMobile ? 72 : 140}px 0`, background: RH.ink, overflow: 'hidden', borderTop: `1px solid ${RH.line}` }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: `0 ${padX}px` }}>
        <div className="rh-rv">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', flexDirection: isMobile ? 'column' : 'row', gap: 14 }}>
            <div>
              <Eyebrow style={{ marginBottom: 20 }}>Stocked catalog</Eyebrow>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 7vw, 96px)', fontWeight: 400, letterSpacing: '-0.02em', color: RH.bone, margin: 0, lineHeight: 0.98 }}>
                In stock, <Accent>shipping today</Accent>.
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="rh-btn-ghost" onClick={() => navigate('/catalog')} style={{ color: RH.bone, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: `1px solid ${RH.lineStrong}`, borderRadius: 4, padding: '12px 22px', cursor: 'pointer', fontFamily: D.sans, whiteSpace: 'nowrap' }}>
                Browse products <Icon.arrow />
              </button>
              {!isMobile && (
                <>
                  <button className="rh-btn-ghost" onClick={() => scrollRail(-1)} aria-label="Previous products" style={{ background: 'none', border: `1px solid ${RH.lineStrong}`, color: RH.bone, width: 44, height: 44, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon.arrow style={{ transform: 'rotate(180deg)' }} />
                  </button>
                  <button onClick={() => scrollRail(1)} aria-label="Next products" style={{ background: RH.bone, border: `1px solid ${RH.bone}`, color: RH.ink, width: 44, height: 44, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon.arrow />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        ref={railRef}
        className="rh-rail"
        style={{
          display: 'flex', gap: isMobile ? 12 : 20,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          paddingTop: isMobile ? 28 : 48,
          paddingBottom: 8,
          paddingLeft: `max(${padX}px, calc((100vw - 1440px) / 2 + ${padX}px))`,
          paddingRight: padX,
          scrollPaddingLeft: `max(${padX}px, calc((100vw - 1440px) / 2 + ${padX}px))`,
        }}
      >
        {picks.map((p) => {
          const cutout = productCutout(p.sku);
          const inStock = (stockBySku.get(p.sku)?.available || 0) > 0;
          return (
            <article
              key={p.sku}
              className="rh-card"
              style={{
                flex: `0 0 ${isMobile ? 262 : 396}px`,
                scrollSnapAlign: 'start',
                background: RH.panel, borderRadius: 6, overflow: 'hidden',
                border: `1px solid ${RH.line}`,
                display: 'flex', flexDirection: 'column',
              }}
            >
              {cutout ? (
                <Link to={`/products/${p.sku}`} aria-label={p.name} style={{ display: 'block' }}>
                  <div style={{
                    height: isMobile ? 196 : 300, position: 'relative',
                    display: 'grid', placeItems: 'center',
                    background: `radial-gradient(120% 100% at 50% 0%, #1a2b23 0%, ${RH.ink2} 100%)`,
                    borderBottom: `1px solid ${RH.line}`,
                    overflow: 'hidden',
                  }}>
                    <img
                      className="rh-card-img"
                      src={cutout}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      style={{ maxWidth: '78%', maxHeight: '82%', objectFit: 'contain', position: 'relative', filter: 'drop-shadow(0 18px 30px rgba(0,0,0,.45))' }}
                    />
                    {inStock && (
                      <span style={{
                        position: 'absolute', top: 12, left: 12,
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontFamily: D.mono, fontSize: 9, letterSpacing: 1,
                        color: RH.bone, background: 'rgba(10,18,16,.75)',
                        border: `1px solid ${RH.line}`, borderRadius: 3, padding: '4px 9px',
                        backdropFilter: 'blur(4px)',
                      }}>
                        <span className="rh-pulse" style={{ width: 5, height: 5, borderRadius: 3, background: '#5fbd8a', display: 'inline-block' }} />
                        IN STOCK
                      </span>
                    )}
                  </div>
                </Link>
              ) : (
                <PhotoPlaceholder src={PRODUCT_IMG[p.sku]} caption={p.img} height={isMobile ? 196 : 300} stripeFrom="#14231c" stripeTo="#0e1713" textColor={RH.sage} />
              )}
              <div style={{ padding: isMobile ? 18 : 24, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: D.mono, fontSize: 10, letterSpacing: 0.8, color: RH.bone3 }}>
                  <span>{p.sku}</span>
                  <span style={{ display: isMobile ? 'none' : 'inline' }}>HCPCS {p.hcpcs}</span>
                </div>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 19 : 24, color: RH.bone, marginTop: 10, lineHeight: 1.2, flex: 1 }}>{p.name}</div>
                <div style={{ fontSize: 13, color: RH.bone2, marginTop: 6 }}>{p.cat} · {p.packSize}</div>
                <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTop: `1px solid ${RH.line}` }}>
                  <div>
                    <div style={{ fontFamily: D.display, fontSize: isMobile ? 20 : 24, color: RH.sage, letterSpacing: -0.4, fontStyle: 'italic' }}>Sign in for pricing</div>
                    <div style={{ fontFamily: D.mono, fontSize: 10, color: RH.bone3 }}>MOQ {p.moq}</div>
                  </div>
                  <button onClick={() => navigate(`/portal/quote?sku=${encodeURIComponent(p.sku)}`)} aria-label={`Add ${p.name} to Quick Quote`} style={{ background: RH.sage, color: RH.ink, border: 'none', padding: '11px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, flexShrink: 0, fontFamily: D.sans }}>
                    Quick Quote →
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        <div aria-hidden="true" style={{ flex: `0 0 ${padX}px` }} />
      </div>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: `0 ${padX}px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1.2, color: RH.bone3, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-block', width: 36, height: 1, background: RH.bone3 }} />
          SCROLL
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live inventory widget — same WMS projection, dark chrome            */
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
    <div className="rh-rv">
      <div style={{ border: `1px solid ${RH.lineStrong}`, borderRadius: 6, padding: 22, marginBottom: 18, background: RH.panel }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span className="rh-pulse" style={{ width: 7, height: 7, borderRadius: 4, background: '#5fbd8a' }} />
          <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1.4, color: RH.sage }}>LIVE INVENTORY · WMS</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
          {stats.map((st) => (
            <div key={st.l}>
              <div style={{ fontFamily: D.display, fontSize: 30, letterSpacing: -0.5, color: RH.bone }}>{st.v}</div>
              <div style={{ fontSize: 11, color: RH.bone2, marginTop: 4, lineHeight: 1.3 }}>{st.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* OwnedInventory — stocked + sourced, warehouse plate left            */
/* ------------------------------------------------------------------ */
function OwnedInventory() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 48;
  const facts = [
    { stat: 'GA', label: 'Georgia warehouse', sub: 'Our Lithia Springs, GA warehouse ships to all 50 states and territories.' },
    { stat: 'Direct', label: 'Manufacturer relationships', sub: 'Core categories bought direct and held as owned stock in our own warehouse.' },
    { stat: '2pm', label: 'Same-day cutoff', sub: 'Orders placed before 2pm EST on stocked items ship the same day.' },
  ];
  return (
    <div style={{ background: RH.ink2, padding: `${isMobile ? 72 : 130}px ${padX}px`, borderTop: `1px solid ${RH.line}` }}>
      <div style={{
        maxWidth: 1440, margin: '0 auto',
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1fr',
        gap: isMobile ? 40 : 90, alignItems: 'start',
      }}>
        <div className="rh-rv">
          <Eyebrow style={{ marginBottom: 20 }}>Stocked + sourced</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 64px)', fontWeight: 400, letterSpacing: '-0.015em', lineHeight: 1.04, margin: 0, color: RH.bone }}>
            Stocked when you need it today. <Accent>Sourced when you don&apos;t.</Accent>
          </h2>
          <p style={{ fontSize: isMobile ? 14.5 : 16.5, lineHeight: 1.65, color: RH.bone2, marginTop: 22, maxWidth: 520 }}>
            We buy our core categories direct from manufacturers and hold that stock in our own
            Georgia warehouse. For everything else, our vetted sourcing network finds it fast —
            with transparent pricing either way.
          </p>
          <button
            className="rh-btn-primary"
            onClick={() => navigate('/catalog')}
            style={{
              background: RH.bone, color: RH.ink, border: 'none',
              padding: isMobile ? '14px 24px' : '16px 30px', borderRadius: 4,
              fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans,
              display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 30,
            }}
          >
            Browse stocked catalog <Icon.arrow />
          </button>
          <div className="rh-media-band" style={{ marginTop: isMobile ? 32 : 48, height: isMobile ? 200 : 300, border: `1px solid ${RH.line}` }}>
            <img data-rh-parallax src={IMGS.dock} alt="Unite Medical warehouse operations" loading="lazy" decoding="async" style={{ width: '100%', height: '112%', objectFit: 'cover', display: 'block' }} />
          </div>
        </div>
        <div>
          <LiveInventoryWidget />
          {facts.map((f, i) => (
            <div className="rh-rv" key={f.label} style={{ transitionDelay: `${i * 80}ms` }}>
              <div style={{
                display: 'grid', gridTemplateColumns: isMobile ? '92px 1fr' : '130px 1fr',
                gap: isMobile ? 16 : 28, alignItems: 'baseline',
                padding: `${isMobile ? 22 : 30}px 0`,
                borderTop: `1px solid ${RH.line}`,
              }}>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 40 : 58, letterSpacing: '-0.02em', color: RH.sage, lineHeight: 1 }}>{f.stat}</div>
                <div>
                  <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 600, color: RH.bone }}>{f.label}</div>
                  <div style={{ fontSize: isMobile ? 13 : 14, lineHeight: 1.6, color: RH.bone2, marginTop: 6 }}>{f.sub}</div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${RH.line}` }} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shortage strip — night dock band                                    */
/* ------------------------------------------------------------------ */
function ShortageStrip() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 48;
  return (
    <div style={{ position: 'relative', background: RH.ink, color: RH.bone, padding: `${isMobile ? 72 : 120}px ${padX}px`, overflow: 'hidden', borderTop: `1px solid ${RH.line}` }}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, opacity: 0.24 }}>
        <img src={IMGS.highway} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${RH.ink} 0%, rgba(10,18,16,.5) 55%, ${RH.ink} 100%)` }} />
      </div>
      <div style={{
        maxWidth: 1440, margin: '0 auto', position: 'relative',
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto',
        gap: isMobile ? 28 : 64, alignItems: 'center',
      }}>
        <div className="rh-rv">
          <Eyebrow style={{ marginBottom: 18 }}>No EDI · No portal setup · No formatting</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(30px, 5vw, 64px)', fontWeight: 400, letterSpacing: '-0.015em', lineHeight: 1.04, margin: 0 }}>
            Backordered somewhere else?<br />
            <Accent>Paste your shortage list.</Accent>
          </h2>
          <p style={{ fontSize: isMobile ? 14.5 : 16, lineHeight: 1.6, color: RH.bone2, marginTop: 16, maxWidth: 560 }}>
            Upload or paste your shortage list and we return a quote — items we stock are matched
            against our own live inventory, and the rest goes to our sourcing network.
          </p>
        </div>
        <div className="rh-rv" style={{ transitionDelay: '100ms' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: 12 }}>
            <button
              className="rh-btn-primary"
              onClick={() => navigate('/shortage-list')}
              style={{
                background: RH.bone, color: RH.ink, border: 'none',
                padding: isMobile ? '15px 26px' : '18px 36px', borderRadius: 4,
                fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans,
                display: 'inline-flex', alignItems: 'center', gap: 10,
              }}
            >
              Match my list <Icon.arrow />
            </button>
            <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: RH.bone3 }}>
              FREE · TAKES ~60 SECONDS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Partner spotlight — still-life plate + oversized serif pull quote   */
/* ------------------------------------------------------------------ */
function PartnerSpotlight() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 48;
  return (
    <div style={{ background: RH.ink2, color: RH.bone, padding: `${isMobile ? 72 : 140}px ${padX}px`, position: 'relative', overflow: 'hidden', borderTop: `1px solid ${RH.line}` }}>
      <div style={{
        maxWidth: 1440, margin: '0 auto', position: 'relative',
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.25fr 1fr',
        gap: isMobile ? 36 : 90, alignItems: 'center',
      }}>
        <div className="rh-rv">
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 2, color: RH.sage, marginBottom: 26, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden="true" style={{ width: 28, height: 1, background: RH.sage }} />
            PARTNER SPOTLIGHT
          </div>
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5.4vw, 72px)', fontWeight: 400, letterSpacing: '-0.015em', lineHeight: 1.06, margin: 0 }}>
            &ldquo;We built their patient recovery store. <em style={{ color: RH.amber }}>They put their name on it.</em>&rdquo;
          </h2>
          <p style={{ fontSize: isMobile ? 15 : 17, lineHeight: 1.65, color: RH.bone2, marginTop: 28, maxWidth: 820 }}>
            Total Joint Specialists — one of the most respected orthopedic groups in the
            country — chose Unite to build, stock, and fulfill their entire Patient Recovery
            Store. From product manufacturing to same-day drop shipping, every order flows
            through our platform.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
            <a
              className="rh-btn-primary"
              href="https://tjs.unitemedical.net/store"
              target="_blank"
              rel="noreferrer"
              style={{ background: RH.bone, color: RH.ink, padding: '14px 26px', borderRadius: 4, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
            >
              Visit the TJS Recovery Store →
            </a>
            <Link
              className="rh-btn-ghost"
              to="/case-studies/tjs"
              style={{ background: 'transparent', color: RH.bone, border: `1px solid ${RH.lineStrong}`, padding: '13px 26px', borderRadius: 4, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}
            >
              Read the case study →
            </Link>
          </div>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: RH.sage, marginTop: 32, paddingTop: 24, borderTop: `1px solid ${RH.line}` }}>
            White-label storefront · Product manufacturing · Direct-to-patient fulfillment
          </div>
        </div>
        {!isMobile && (
          <div className="rh-rv rh-media-band" style={{ transitionDelay: '120ms', height: 520, border: `1px solid ${RH.line}` }}>
            <img data-rh-parallax src={IMGS.ortho} alt="Unite Medical warehouse operations" loading="lazy" decoding="async" style={{ width: '100%', height: '112%', objectFit: 'cover', display: 'block' }} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CTA — centered mega-type sign-off over the freight interchange      */
/* ------------------------------------------------------------------ */
function CTA() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 48;
  return (
    <div style={{ padding: `${isMobile ? 90 : 170}px ${padX}px`, background: RH.ink, color: RH.bone, position: 'relative', overflow: 'hidden', borderTop: `1px solid ${RH.line}` }}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, opacity: 0.3 }}>
        <img src={IMGS.hero} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: 'scaleX(-1)' }} />
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(90% 90% at 50% 50%, rgba(10,18,16,.55) 0%, ${RH.ink} 88%)` }} />
      </div>
      <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', textAlign: 'center' }}>
        <div className="rh-rv">
          <h2 style={{ fontFamily: D.display, fontSize: 'clamp(44px, 10vw, 130px)', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 0.98, margin: 0 }}>
            Enter data once.<br />
            <Accent>Sync everything.</Accent>
          </h2>
          <div style={{ fontSize: isMobile ? 15 : 17, lineHeight: 1.6, color: RH.bone2, margin: `${isMobile ? 24 : 38}px auto 0`, maxWidth: 560 }}>
            Request a quote → get an instant, fully landed, compliance-checked price you can
            trust. Accept online and it becomes an order. No guesswork, no waiting, no
            back-and-forth.
          </div>
          <button className="rh-btn-primary" onClick={() => navigate('/quote')} style={{ background: RH.bone, color: RH.ink, border: 'none', padding: isMobile ? '15px 28px' : '18px 38px', borderRadius: 4, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans, display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: isMobile ? 28 : 48 }}>
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
      'Veteran-owned, FDA-registered wholesale medical supply for surgery centers, pharmacies, health systems, government, and regional distributors. No minimums on stocked items. Same-day shipping on orders before 2pm EST from our Georgia warehouse.',
    canonical: '/',
    type: 'website',
    jsonLd: [organizationSchema(), websiteSchema()],
  });
  const rootRef = useRef(null);
  useReveals(rootRef);
  return (
    <div ref={rootRef} className="rh-root" style={{ fontFamily: D.sans }}>
      <Nav />
      <Hero />
      <PartnerMarquee
        items={LOGO_PARTNERS}
        background={RH.ink2}
        borderColor="rgba(243,242,235,.14)"
        variant="paper"
        eyebrowColor={RH.sage}
        height={30}
      />
      <Metrics />
      <WhoWeServe />
      <TwoWaysToBuy />
      <Featured />
      <OwnedInventory />
      <ShortageStrip />
      <PartnerSpotlight />
      <CTA />
      <Footer />
    </div>
  );
}
