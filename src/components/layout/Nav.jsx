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

/**
 * Structured chrome: a solid green-black bar with a mono utility strip on
 * top and the primary row below. Links use an underline indicator, the
 * cart is a sharp paper button, and nothing floats, blurs, or glows.
 * `overlay` keeps API compatibility (fixed positioning over hero media).
 */
export function Nav({ overlay = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const cart = useCart();
  const session = auth.use();
  const cartCount = cart.items.reduce((a, b) => a + b.qty, 0);
  const { isMobile } = useViewport();
  const [open, setOpen] = useState(false);

  // Compress the bar a touch once scrolled.
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

  const padX = isMobile ? 16 : 40;
  const padY = scrolled ? (isMobile ? 10 : 12) : (isMobile ? 13 : 18);

  return (
    <header className={`um-nav-wrap${overlay ? ' um-nav-wrap--overlay' : ''}`} style={{ color: D.paper }}>
      <div className="um-nav-bar">
        {/* Utility strip — registration data as chrome. */}
        {!isMobile && (
          <div style={{ borderBottom: '1px solid rgba(243,242,235,.1)', color: 'rgba(243,242,235,.6)', fontFamily: D.mono, fontSize: 10.5, letterSpacing: 1 }}>
            <div style={{ maxWidth: 1440, margin: '0 auto', padding: `7px ${padX}px`, display: 'flex', gap: 22, alignItems: 'center' }}>
              <span>FDA 3015727296</span>
              <span>MSPV BPA 36C24123A0077</span>
              <span>CAGE 8MK70</span>
              <span>VETERAN-OWNED · LITHIA SPRINGS, GA</span>
              <span style={{ flex: 1 }} />
              <Link to="/admin" style={{ color: 'inherit', letterSpacing: 1.4 }} title="Open admin console">ADMIN</Link>
              <a href="tel:+18338686483" style={{ color: D.plumSoft }}>SALES 833.868.6483</a>
            </div>
          </div>
        )}
        {isMobile && (
          <div style={{ borderBottom: '1px solid rgba(243,242,235,.1)', color: 'rgba(243,242,235,.6)', fontFamily: D.mono, fontSize: 9.5, letterSpacing: 1, textAlign: 'center', padding: '6px 12px' }}>
            FDA-REGISTERED · CAGE 8MK70 · <a href="tel:+18338686483" style={{ color: D.plumSoft }}>833.868.6483</a>
          </div>
        )}

        {/* Primary row */}
        <div style={{
          maxWidth: 1440, margin: '0 auto',
          padding: `${padY}px ${padX}px`,
          transition: 'padding 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center', gap: isMobile ? 12 : 32,
        }}>
          <Link to="/" aria-label="Unite Medical home" style={{ display: 'inline-flex' }}>
            <UMLogo size={isMobile ? 26 : 30} color={D.paper} weight={600} />
          </Link>

          {!isMobile && (
            <nav aria-label="Primary" style={{ display: 'flex', gap: 30, justifyContent: 'center' }}>
              {LINKS.map(([path, label]) => (
                <Link
                  key={path}
                  to={path}
                  className="um-nav-link"
                  aria-current={isActive(path) ? 'page' : undefined}
                  style={{
                    color: isActive(path) ? D.paper : 'rgba(243,242,235,.68)',
                    padding: '10px 0',
                    fontSize: 14.5,
                    fontWeight: isActive(path) ? 600 : 500,
                    fontFamily: D.sans,
                    letterSpacing: 0.1,
                  }}
                >
                  {label}
                </Link>
              ))}
            </nav>
          )}
          {isMobile && <span />}

          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 18, justifySelf: 'end' }}>
            {!isMobile && (
              <button
                onClick={() => navigate('/catalog')}
                aria-label="Search catalog"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', border: '1px solid rgba(243,242,235,.22)', borderRadius: 4, color: 'rgba(243,242,235,.55)', fontSize: 13, width: 200, background: 'transparent', cursor: 'pointer', fontFamily: D.sans }}
              >
                <Icon.search /> <span>Search products</span>
              </button>
            )}
            {!isMobile && (
              <Link to={session ? '/dashboard' : '/login'} style={{ background: 'none', color: 'rgba(243,242,235,.85)', fontFamily: D.sans, fontSize: 13.5 }}>
                {session ? 'Dashboard' : 'Sign in'}
              </Link>
            )}
            <Link to="/cart" aria-label={`Cart, ${cartCount} items`} style={{ display: 'flex', alignItems: 'center', gap: 7, background: D.paper, color: D.ink, padding: isMobile ? '9px 12px' : '10px 16px', borderRadius: 4, fontSize: isMobile ? 12 : 13, fontWeight: 600, fontFamily: D.sans }}>
              <Icon.cart /> {cartCount ? cartCount : (isMobile ? '' : 'Cart')}
            </Link>
            {isMobile && (
              <button
                onClick={() => setOpen(true)}
                aria-label="Open menu"
                aria-expanded={open}
                style={{ background: 'transparent', color: D.paper, border: '1px solid rgba(243,242,235,.25)', borderRadius: 4, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
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
              <button onClick={() => setOpen(false)} aria-label="Close menu" style={{ background: 'transparent', color: D.ink, border: `1px solid ${D.line}`, borderRadius: 4, width: 40, height: 40, cursor: 'pointer' }}>
                <Icon.close />
              </button>
            </div>
            <nav aria-label="Primary mobile" style={{ padding: 14 }}>
              {LINKS.map(([path, label]) => (
                <Link key={path} to={path} style={{
                  display: 'block', padding: '14px 14px',
                  fontFamily: D.display, fontSize: 26, letterSpacing: -0.3,
                  color: isActive(path) ? D.plum : D.ink,
                  borderBottom: `1px solid ${D.line}`,
                }}>{label}</Link>
              ))}
              <div style={{ height: 12 }} />
              {[
                ['/robotics', 'Robotics Program'],
                ['/diagnostics', 'Diagnostic Tests'],
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
              <Link to={session ? '/dashboard' : '/login'} style={{ background: D.plum, color: D.paper, padding: '13px 16px', borderRadius: 4, fontSize: 14, fontWeight: 600, textAlign: 'center' }}>
                {session ? 'Open dashboard' : 'Sign in'}
              </Link>
              <Link to="/quote" style={{ background: 'transparent', color: D.ink, border: `1px solid ${D.ink}`, padding: '12px 16px', borderRadius: 4, fontSize: 14, fontWeight: 500, textAlign: 'center' }}>
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
