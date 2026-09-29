import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UMLogo } from '../shared/Logo.jsx';
import { Icon } from '../shared/Icon.jsx';
import { useCart } from '../../store/cart.js';
import { auth } from '../../lib/auth.js';
import { commerceAccessFor } from '../../lib/accessPolicy.js';
import './nav.css';

const LINKS = [
  ['/catalog', 'Products'], ['/quote', 'Source & Quote'],
  ['/regenicool', 'RegeniCool™ Pro'], ['/services', 'Services'],
  ['/robotics', 'Restore Robotics'], ['/government', 'Government'], ['/about', 'About'],
  ['/welllink', 'WellLink'],
];
const MORE_LINKS = [
  ['/diagnostics', 'Diagnostic Tests'], ['/shortage-list', 'Shortage List Matcher'],
  ['/supply-risk', 'Supply Risk Monitor'], ['/procurement', 'Procurement & Diversity'],
  ['/contact', 'Contact'], ['/locations', 'Locations'], ['/blog', 'Blog'],
  ['/compliance', 'Compliance'], ['/case-studies/tjs', 'TJS Case Study'],
];
function accountPath(session) {
  if (!session) return '/login';
  if (session.role === 'admin') return '/admin';
  if (['warehouse_manager', 'warehouse_operator'].includes(session.role)) return '/admin/inventory/receive';
  if (session.role === 'distributor') return '/distributor';
  return session.role === 'customer' ? '/dashboard' : '/work';
}

/** Shared floating navigation. Hero pages opt into a transparent overlay. */
export function Nav({ overlay = false, heroSelector }) {
  const location = useLocation(), cart = useCart(), session = auth.use();
  const commerce = commerceAccessFor(session, auth.org());
  const canAccessWellLinkWorkspace = ['admin', 'sales', 'sales_manager', 'finance', 'warehouse_operator', 'warehouse_manager'].includes(session?.role);
  const cartCount = cart.items.reduce((sum, item) => sum + item.qty, 0);
  const [open, setOpen] = useState(false);
  const [chrome, setChrome] = useState({ dark: overlay, top: 16 });
  const header = useRef(null), toggle = useRef(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const hero = heroSelector ? document.querySelector(heroSelector) : null;
      const dark = overlay && (hero ? hero.getBoundingClientRect().bottom > 110 : window.scrollY < 80);
      const banner = document.querySelector('.um-staging-banner');
      const top = Math.max(16, (banner?.getBoundingClientRect().bottom || 0) + 12);
      setChrome(previous => previous.dark === dark && previous.top === top ? previous : { dark, top });
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    schedule(); window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [overlay, heroSelector]);
  useEffect(() => {
    if (!open) return;
    const key = event => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    const outside = event => { if (!header.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  const active = path => path === '/catalog' ? /^\/(catalog|products)(\/|$)/.test(location.pathname) : location.pathname === path || location.pathname.startsWith(`${path}/`);
  const navLinks = items => items.map(([path, label]) => <Link key={path} to={path} aria-current={active(path) ? 'page' : undefined} onClick={() => setOpen(false)}>{label}</Link>);
  return <>
    {!overlay && <div className="un-nav-space" aria-hidden="true"/>}
    <header ref={header} className={`un-nav${chrome.dark ? ' un-nav--dark' : ''}`} style={{ '--un-nav-top': `${chrome.top}px` }}>
      <Link to="/" className="un-nav-logo" aria-label="Unite Medical home" onClick={() => setOpen(false)}><UMLogo size={28} color={chrome.dark ? '#fff' : '#16201a'}/></Link>
      <nav className="un-nav-primary" aria-label="Primary">{navLinks(LINKS)}</nav>
      <div className="un-nav-actions">
        <Link className="un-nav-icon un-nav-search" to="/catalog" aria-label="Search products"><Icon.search/></Link>
        <Link className="un-nav-account" to={accountPath(session)}>{session ? 'Dashboard' : 'Sign in'}</Link>
        {commerce.can_use_cart ? <Link className="un-nav-cta" to="/cart" aria-label={`Cart, ${cartCount} items`}><Icon.cart/><span>Cart{cartCount ? ` (${cartCount})` : ''}</span></Link> : <Link className="un-nav-cta" to="/portal/quote">Quick quote <span aria-hidden="true">↗</span></Link>}
        <button ref={toggle} className="un-nav-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="unite-site-menu" onClick={() => setOpen(!open)}><span/><span/><span/></button>
      </div>
      {open && <nav className="un-nav-menu" id="unite-site-menu" aria-label="Site menu">
        <div className="un-nav-menu-main"><p>EXPLORE UNITE</p>{navLinks(LINKS)}</div>
        <div><p>RESOURCES & SUPPORT</p>{navLinks(MORE_LINKS)}</div>
        <div className="un-nav-menu-footer">
          <Link to={accountPath(session)} onClick={() => setOpen(false)}>{session ? 'Open dashboard' : 'Sign in'} ↗</Link>
          {session?.role === 'admin' && <Link to="/admin" onClick={() => setOpen(false)}>Admin Console ↗</Link>}
          {canAccessWellLinkWorkspace && <Link to="/staff/welllink" onClick={() => setOpen(false)}>WellLink staff workspace ↗</Link>}
          <Link to="/catalog" onClick={() => setOpen(false)}>Search products ↗</Link>
          <Link to="/quote" onClick={() => setOpen(false)}>Start a quote ↗</Link>
          <a href="tel:+18338686483">833.868.6483 ↗</a>
          {location.pathname === '/robotics' && <a href="#robotics-lead" onClick={() => setOpen(false)}>Talk to the robotics team ↗</a>}
          <small>VETERAN-OWNED · FDA 3015727296 · CAGE 8MK70<br/>MSPV BPA 36C24123A0077</small>
        </div>
      </nav>}
    </header>
  </>;
}
