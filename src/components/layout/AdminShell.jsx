import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { D } from '../../tokens.js';
import { UMLogo } from '../shared/Logo.jsx';
import { Icon } from '../shared/Icon.jsx';
import { auth } from '../../lib/auth.js';
import { useViewport } from '../../lib/viewport.js';
import { useWebhookBridge } from '../../lib/webhookBridge.js';

const NAV = [
  ...(import.meta.env.VITE_UNITE_ENVIRONMENT==='staging' ? [['Testing & feedback','testing','/admin/testing']] : []),
  ['Today',      'overview',   '/admin'],
  ['Needs attention', 'desk', '/admin/desk'],
  ['Checkout reviews', 'packing', '/admin/packing'],
  ['Document review', 'documents', '/admin/documents'],
  ['Launch preparation', 'launch', '/admin/launch'],
  ['Morning brief', 'digest',     '/admin/digest'],
  ['Products',      'products',   '/admin/products'],
  ['Barcodes',      'barcodes',   '/admin/inventory/barcodes'],
  ['Shopify history', 'shopify-history', '/admin/shopify-history'],
  ['Orders',        'orders',     '/admin/orders'],
  ['Fulfillment',   'fulfillment', '/admin/fulfillment'],
  ['Quotes',        'quotes',     '/admin/quotes'],
  ['Sourcing',      'sourcing',   '/admin/sourcing'],
  ['Inventory',     'inventory',  '/admin/inventory'],
  ['Receiving',     'receiving',  '/admin/inventory/receive'],
  ['Lots & recall', 'lots',       '/admin/inventory/lots'],
  ['Cycle count',   'count',      '/admin/inventory/count'],
  ['Transfers',     'transfers',  '/admin/inventory/transfers'],
  ['Consignment',   'consignment', '/admin/consignment'],
  ['Purchase orders', 'purchase-orders', '/admin/purchase-orders'],
  ['Replenishment', 'replenish',  '/admin/replenishment'],
  ['Finance',       'finance',    '/admin/finance'],
  ['Customers',     'customers',  '/admin/customers'],
  ['CRM',           'crm',        '/admin/crm'],
  ['HubSpot', 'hubspot',   '/admin/crm/hubspot'],
  ['Reps',          'reps',       '/admin/reps'],
  ['Team & permissions',   'team',       '/admin/team'],
  ['Vendors',       'vendors',    '/admin/vendors'],
  ['Discovery',     'discovery',  '/admin/discovery'],
  ['Compliance',    'compliance', '/admin/compliance'],
  ['UDI / GUDID',   'udi',        '/admin/udi'],
  ['Webhooks',      'webhooks',   '/admin/webhooks'],
  ['Surplus',       'surplus',    '/admin/surplus'],
  ['Website content',           'cms',        '/admin/cms'],
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
    const previous = document.activeElement;
    document.body.style.overflow = 'hidden';
    const drawer = document.querySelector('[aria-label="Admin navigation"][role="dialog"]');
    const first = drawer?.querySelector('button'); first?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'Tab' && drawer) {
        const items = [...drawer.querySelectorAll('a,button,summary')].filter(el=>el.getClientRects().length);
        const firstItem=items[0], last=items[items.length-1];
        if(event.shiftKey && document.activeElement===firstItem){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();firstItem?.focus();}
      }
    };
    document.addEventListener('keydown',onKey);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown',onKey); previous?.focus(); };
  }, [open]);

  const isActive = (id, path) => active === id || location.pathname === path;
  const visibleNav = session?.role === 'finance' ? NAV.filter(([, id]) => id === 'finance')
    : ['warehouse_operator','warehouse_manager'].includes(session?.role) ? NAV.filter(([,id])=>id==='receiving') : NAV;
  const primary = new Set(['overview','desk','orders','inventory','customers','launch','finance','testing']);
  const groups = [
    ['Warehouse', ['packing','fulfillment','receiving','lots','count','transfers','consignment','barcodes']],
    ['Buying and sales', ['quotes','products','purchase-orders','sourcing','replenish','vendors','crm','hubspot','reps']],
    ['Reports and settings', ['documents','shopify-history','digest','analytics','team','discovery','compliance','udi','webhooks','surplus','cms','settings']],
  ];
  const navLink = ([label,id,path]) => <Link key={id} to={path} aria-current={isActive(id,path)?'page':undefined} style={{display:'block',padding:'12px',borderRadius:6,fontSize:14,background:isActive(id,path)?D.plum:'transparent',color:isActive(id,path)?'#fff':'#c2cfc6',marginBottom:3}}>{label}</Link>;

  const Sidebar = (
    <>
      <Link to="/" aria-label="Unite Medical home">
        <UMLogo size={22} color={D.paper} weight={600} />
      </Link>
      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1.2, color: D.plumSoft, marginTop: 6 }}>{import.meta.env.DEV ? 'LOCAL PREVIEW · SAMPLE DATA' : 'ADMIN CONSOLE'}</div>
      <nav aria-label="Main navigation" style={{ marginTop: 24 }}>
        {visibleNav.filter(([,id])=>primary.has(id)).map(navLink)}
        {groups.map(([title,ids])=>{
          const entries=visibleNav.filter(([,id])=>ids.includes(id));
          return entries.length ? <details key={`${title}:${location.pathname}`} open={entries.some(([,id,path])=>isActive(id,path)) || undefined} style={{marginTop:12,borderTop:'1px solid #35483b',paddingTop:12}}><summary style={{fontSize:14,color:'#c2cfc6',padding:'10px 4px',cursor:'pointer'}}>{title}</summary>{entries.map(navLink)}</details> : null;
        })}
      </nav>
      <div style={{ marginTop: 40, padding: 14, background: 'rgba(255,255,255,.06)', borderRadius: 10 }}>
        <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.plumSoft }}>LOGGED IN AS</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>{session?.name || 'Not signed in'}</div>
        <div style={{ fontSize: 11, color: '#8b9a90' }}>{session?.role === 'admin' ? 'Administrator' : session?.role === 'finance' ? 'Finance' : session ? (session.role || 'Customer').replaceAll('_',' ') : 'Sign in'}</div>
        {session?.roles?.length>1&&<label style={{display:'block',marginTop:12}}>Working role<select value={session.role} onChange={async e=>{try{const next=await auth.switchRole(e.target.value);navigate(next.role==='admin'?'/admin':next.role==='finance'?'/admin/finance':['warehouse_operator','warehouse_manager'].includes(next.role)?'/admin/inventory/receive':'/work');}catch(err){window.alert(err.message);}}}>{session.roles.map(role=><option key={role}>{role}</option>)}</select></label>}
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
      <div style={{ minWidth:0 }}>{children}</div>
    </div>
  );
}
