import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { D } from '../../tokens.js';
import { UMLogo } from '../shared/Logo.jsx';
import { Icon } from '../shared/Icon.jsx';
import { auth } from '../../lib/auth.js';
import { useViewport } from '../../lib/viewport.js';
import { useWebhookBridge } from '../../lib/webhookBridge.js';

const NAV = [
  ['Overview',      'overview',   '/admin'],
  ['Morning brief', 'digest',     '/admin/digest'],
  ['Products',      'products',   '/admin/products'],
  ['Orders',        'orders',     '/admin/orders'],
  ['Fulfillment',   'fulfillment', '/admin/fulfillment'],
  ['Quotes',        'quotes',     '/admin/quotes'],
  ['Inventory',     'inventory',  '/admin/inventory'],
  ['Receiving',     'receiving',  '/admin/inventory/receive'],
  ['Lots & recall', 'lots',       '/admin/inventory/lots'],
  ['Cycle count',   'count',      '/admin/inventory/count'],
  ['Transfers',     'transfers',  '/admin/inventory/transfers'],
  ['Purchase orders', 'purchase-orders', '/admin/purchase-orders'],
  ['Replenishment', 'replenish',  '/admin/replenishment'],
  ['Finance',       'finance',    '/admin/finance'],
  ['Customers',     'customers',  '/admin/customers'],
  ['CRM',           'crm',        '/admin/crm'],
  ['Reps',          'reps',       '/admin/reps'],
  ['Vendors',       'vendors',    '/admin/vendors'],
  ['Discovery',     'discovery',  '/admin/discovery'],
  ['Compliance',    'compliance', '/admin/compliance'],
  ['Webhooks',      'webhooks',   '/admin/webhooks'],
  ['Surplus',       'surplus',    '/admin/surplus'],
  ['CMS',           'cms',        '/admin/cms'],
  ['Analytics',     'analytics',  '/admin/analytics'],
  ['Settings',      'settings',   '/admin/settings'],
];

export function AdminShell({ active, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = auth.use();
  const { isMobile } = useViewport();
  const [open, setOpen] = useState(false);

  // Drain verified webhook events from /api/hooks/events into the
  // local DB while an admin tab is open (PRD-01 interim bridge).
  useWebhookBridge(session?.role === 'admin');

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const isActive = (id, path) => active === id || location.pathname === path;

  const Sidebar = (
    <>
      <Link to="/" aria-label="Unite Medical home">
        <UMLogo size={22} color={D.paper} weight={600} />
      </Link>
      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1.2, color: D.plumSoft, marginTop: 6 }}>ADMIN CONSOLE</div>
      <nav style={{ marginTop: 24 }}>
        {NAV.map(([label, id, path]) => (
          <Link key={id} to={path} style={{
            display: 'block',
            padding: '11px 12px', borderRadius: 6, fontSize: 13,
            background: isActive(id, path) ? D.plum : 'transparent',
            color: isActive(id, path) ? D.paper : '#b9a8bc',
            marginBottom: 2,
          }}>{label}</Link>
        ))}
      </nav>
      <div style={{ marginTop: 40, padding: 14, background: 'rgba(255,255,255,.06)', borderRadius: 10 }}>
        <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.plumSoft }}>LOGGED IN AS</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>{session?.name || 'Damon Reed'}</div>
        <div style={{ fontSize: 11, color: '#9d8e9f' }}>{session?.role === 'admin' ? 'Super admin' : session ? 'Customer' : 'Demo · sign in'}</div>
        {session ? (
          <button onClick={() => { auth.logout(); navigate('/'); }} style={{ marginTop: 10, fontSize: 11, fontFamily: D.mono, letterSpacing: 1, color: D.plumSoft, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>SIGN OUT</button>
        ) : (
          <button onClick={() => navigate('/login')} style={{ marginTop: 10, fontSize: 11, fontFamily: D.mono, letterSpacing: 1, color: D.plumSoft, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>SIGN IN</button>
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div style={{ minHeight: '100vh', background: D.paper, fontFamily: D.sans, color: D.ink }}>
        <header style={{ background: D.ink, color: D.paper, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <Link to="/" aria-label="Unite Medical home"><UMLogo size={22} color={D.paper} weight={600} /></Link>
          <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1.2, color: D.plumSoft }}>ADMIN</div>
          <button onClick={() => setOpen(true)} aria-label="Open admin menu" aria-expanded={open} style={{ background: 'transparent', color: D.paper, border: '1px solid rgba(255,255,255,.18)', borderRadius: 10, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
            <Icon.menu />
          </button>
        </header>
        {open && (
          <>
            <div className="um-drawer-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
            <aside className="um-drawer" role="dialog" aria-modal="true" aria-label="Admin navigation" style={{ background: D.ink, color: D.paper, padding: '22px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Link to="/"><UMLogo size={22} color={D.paper} weight={600} /></Link>
                <button onClick={() => setOpen(false)} aria-label="Close menu" style={{ background: 'transparent', color: D.paper, border: '1px solid rgba(255,255,255,.18)', borderRadius: 10, width: 40, height: 40, cursor: 'pointer' }}>
                  <Icon.close />
                </button>
              </div>
              {Sidebar}
            </aside>
          </>
        )}
        <div>{children}</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: '100vh', background: D.paper, fontFamily: D.sans, color: D.ink }}>
      <aside aria-label="Admin navigation" style={{ background: D.ink, color: D.paper, padding: '22px 18px', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
        {Sidebar}
      </aside>
      <div style={{ overflowY: 'auto' }}>{children}</div>
    </div>
  );
}
