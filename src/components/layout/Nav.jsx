import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { D } from '../../tokens.js';
import { UMLogo } from '../shared/Logo.jsx';
import { Icon } from '../shared/Icon.jsx';
import { useCart } from '../../store/cart.js';
import { useViewport } from '../../lib/viewport.js';
import { auth } from '../../lib/auth.js';

// Primary nav per Unite_CTO_Site_Document.md §2.1 — five items, no Solutions.
const LINKS = [
  ['/catalog', 'Products'],
  ['/quote', 'Source & Quote'],
  ['/services', 'Services'],
  ['/government', 'Government'],
  ['/about', 'About'],
];

// `overlay` — nav floats over the page top (no flow space). Use on pages
// whose hero photography should run full-bleed behind the capsule.
export function Nav({ overlay = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const cart = useCart();
  const session = auth.use();
  const cartCount = cart.items.reduce((a, b) => a + b.qty, 0);
  const { isMobile } = useViewport();
  const [open, setOpen] = useState(false);

  // At the top of the page the nav is a solid full-bleed band that
  // merges with the dark hero/masthead below it; once you scroll it
  // compresses into the frosted glass chrome.
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > 24);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setScrolled(window.scrollY > 24);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const isActive = (path) => {
    if (path === '/catalog') return location.pathname.startsWith('/catalog') || location.pathname.startsWith('/products');
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const padX = isMobile ? 14 : 22;
  // A touch taller while full-bleed at the top; compresses on detach.
  const padY = scrolled ? (isMobile ? 10 : 12) : (isMobile ? 13 : 17);

  return (
    <header
      className={`um-nav-wrap${overlay ? ' um-nav-wrap--overlay' : ''}`}
      style={{
        // Full-bleed at the top of the page; inset once detached.
        padding: scrolled ? `${isMobile ? 10 : 14}px ${isMobile ? 12 : 24}px 0` : '0',
        color: D.paper,
      }}
    >
      <div
        className={`um-nav-glass${scrolled ? '' : ' um-nav-glass--top'}`}
        style={{ maxWidth: scrolled ? 1280 : '100vw', margin: '0 auto' }}
      >
      {!isMobile && (
        <div style={{ background: 'rgba(0,0,0,.28)', color: 'rgba(247,242,234,.78)', fontFamily: D.mono, fontSize: 11, letterSpacing: 0.8, borderBottom: '1px solid rgba(247,242,234,.08)' }}>
          <div style={{ padding: `7px ${padX}px`, display: 'flex', gap: 20, alignItems: 'center' }}>
            <span>FDA · 3015727296</span>
            <span style={{ opacity: .4 }}>/</span>
            <span>BPA · 36F79725D0203</span>
            <span style={{ opacity: .4 }}>/</span>
            <span>CAGE · 8MK70</span>
            <span style={{ opacity: .4 }}>/</span>
            <span>Veteran-Owned · Lithia Springs, GA</span>
            <span style={{ flex: 1 }} />
            <Link
              to="/admin"
              style={{ opacity: 0.85, color: 'inherit', background: 'rgba(255,255,255,.08)', padding: '2px 9px', borderRadius: 999, letterSpacing: 1 }}
              title="Open admin console"
            >
              ADMIN
            </Link>
            <span style={{ opacity: .4 }}>/</span>
            <a href="tel:+18338686483" style={{ opacity: .7, color: 'inherit' }}>Sales · 833.868.6483</a>
          </div>
        </div>
      )}
      {isMobile && (
        <div style={{ background: 'rgba(0,0,0,.28)', color: 'rgba(247,242,234,.78)', fontFamily: D.mono, fontSize: 10, letterSpacing: 0.8, textAlign: 'center', padding: '6px 12px', borderBottom: '1px solid rgba(247,242,234,.08)' }}>
          FDA · CAGE 8MK70 · VETERAN-OWNED · <a href="tel:+18338686483" style={{ color: 'inherit', textDecoration: 'underline' }}>833.868.6483</a>
        </div>
      )}

      <div style={{
        padding: `${padY}px ${padX}px`,
        transition: 'padding 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center', gap: isMobile ? 12 : 28,
      }}>
        <Link to="/" aria-label="Unite Medical home" style={{ display: 'inline-flex' }}>
          <UMLogo size={isMobile ? 26 : 30} color={D.paper} weight={600} />
        </Link>

        {!isMobile && (
          <nav aria-label="Primary" style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {LINKS.map(([path, label]) => (
              <Link
                key={path}
                to={path}
                className="um-nav-link"
                aria-current={isActive(path) ? 'page' : undefined}
                style={{
                  background: isActive(path) ? D.plum : 'transparent',
                  color: isActive(path) ? D.paper : 'rgba(247,242,234,.72)',
                  padding: '9px 18px',
                  borderRadius: 999,
                  fontSize: 14,
                  fontWeight: isActive(path) ? 600 : 500,
                  fontFamily: D.sans,
                }}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
        {isMobile && <span />}

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 14, justifySelf: 'end' }}>
          {!isMobile && (
            <button
              onClick={() => navigate('/catalog')}
              aria-label="Search catalog"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: '1px solid rgba(247,242,234,.2)', borderRadius: 999, color: 'rgba(247,242,234,.55)', fontSize: 13, width: 220, background: 'rgba(247,242,234,.06)', cursor: 'pointer' }}
            >
              <Icon.search /> <span>Search products</span>
            </button>
          )}
          {!isMobile && (
            <Link to={session ? '/dashboard' : '/login'} style={{ background: 'none', color: 'rgba(247,242,234,.85)', fontFamily: D.sans, fontSize: 13 }}>
              {session ? 'Dashboard' : 'Sign in'}
            </Link>
          )}
          <Link to="/cart" aria-label={`Cart, ${cartCount} items`} style={{ display: 'flex', alignItems: 'center', gap: 7, background: D.paper, color: D.ink, padding: isMobile ? '9px 12px' : '10px 16px', borderRadius: 999, fontSize: isMobile ? 12 : 13, fontWeight: 600, fontFamily: D.sans }}>
            <Icon.cart /> {cartCount ? cartCount : (isMobile ? '' : 'Cart')}
          </Link>
          {isMobile && (
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              style={{ background: 'transparent', color: D.paper, border: '1px solid rgba(247,242,234,.25)', borderRadius: 10, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
            >
              <Icon.menu />
            </button>
          )}
        </div>
      </div>
      </div>

      {isMobile && open && (
        <>
          <div className="um-drawer-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="um-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
            <div style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${D.line}` }}>
              <UMLogo size={26} color={D.ink} weight={600} />
              <button onClick={() => setOpen(false)} aria-label="Close menu" style={{ background: 'transparent', color: D.ink, border: `1px solid ${D.line}`, borderRadius: 10, width: 40, height: 40, cursor: 'pointer' }}>
                <Icon.close />
              </button>
            </div>
            <nav aria-label="Primary mobile" style={{ padding: 14 }}>
              {LINKS.map(([path, label]) => (
                <Link key={path} to={path} style={{
                  display: 'block', padding: '14px 14px',
                  fontFamily: D.display, fontSize: 22, letterSpacing: -0.3,
                  color: isActive(path) ? D.plum : D.ink,
                  borderRadius: 10,
                }}>{label}</Link>
              ))}
              <div style={{ height: 1, background: D.line, margin: '10px 14px' }} />
              {[
                ['/shortage-list', 'Shortage List Matcher'],
                ['/supply-risk', 'Supply Risk Monitor'],
                ['/government', 'Government'],
                ['/procurement', 'Procurement & Diversity'],
                ['/contact', 'Contact'],
                ['/locations', 'Locations'],
                ['/blog', 'Blog'],
                ['/compliance', 'Compliance'],
                ['/case-studies/tjs', 'TJS Case Study'],
                ['/admin', 'Admin Console'],
              ].map(([path, label]) => (
                <Link key={path} to={path} style={{
                  display: 'block', padding: '10px 14px',
                  fontSize: 14, color: D.ink2,
                }}>{label}</Link>
              ))}
            </nav>
            <div style={{ padding: 18, marginTop: 8, borderTop: `1px solid ${D.line}`, display: 'grid', gap: 10 }}>
              <Link to={session ? '/dashboard' : '/login'} style={{ background: D.plum, color: D.paper, padding: '12px 16px', borderRadius: 999, fontSize: 14, fontWeight: 600, textAlign: 'center' }}>
                {session ? 'Open dashboard' : 'Sign in'}
              </Link>
              <Link to="/quote" style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '11px 16px', borderRadius: 999, fontSize: 14, fontWeight: 500, textAlign: 'center' }}>
                Start a quote
              </Link>
              <a href="tel:+18338686483" style={{ marginTop: 6, fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3, textAlign: 'center' }}>
                CALL · 833.868.6483
              </a>
              {/* Single number per spec §3a; all departments route to this line. */}
            </div>
          </aside>
        </>
      )}
    </header>
  );
}
