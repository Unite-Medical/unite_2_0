import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { auth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const STATUS_COLOR = { delivered: '#3b8760', in_transit: '#5e2963', shipped: '#5e2963', processing: '#b8502c', pending: '#b8502c' };

export function Dashboard() {
  const navigate = useNavigate();
  const session = auth.use();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({ title: 'Dashboard', noindex: true });
  const orgId = session?.org_id || 'org_atlsurgical';
  const userId = session?.user_id || 'usr_demo';

  const allOrders = db.useTable('orders', { where: { customer_id: orgId }, orderBy: 'placed_at', dir: 'desc' });
  const orders = allOrders.slice(0, 5);
  const invoices = db.useTable('invoices', { where: { customer_id: orgId } });
  const org = db.get('organizations', orgId);
  const profile = db.get('profiles', userId);

  const monthSpend = allOrders
    .filter((o) => new Date(o.placed_at).getMonth() === new Date().getMonth())
    .reduce((a, b) => a + b.total, 0);
  const activeOrders = allOrders.filter((o) => ['processing', 'shipped', 'in_transit', 'pending'].includes(o.status)).length;
  const formularySize = db.count('products');
  const outstanding = invoices.filter((i) => i.status === 'open').reduce((a, b) => a + b.amount, 0);

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <div style={{ padding: `${isMobile ? 32 : 56}px ${padX}px 24px`, background: D.paper }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: isMobile ? 22 : 48, alignItems: isMobile ? 'start' : 'end' }}>
            <div>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(org?.name || 'YOUR ORGANIZATION').toUpperCase()} · {(org?.terms || 'NET30').toUpperCase()}</div>
              <h1 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 9vw, 88px)', fontWeight: 400, letterSpacing: 'clamp(-1.1px, -0.23vw, -2.2px)', margin: '12px 0 0', lineHeight: 1.0 }}>
                Welcome back, <em>{(profile?.name || 'friend').split(' ')[0]}</em>.
              </h1>
              <div style={{ fontSize: isMobile ? 14 : 16, color: D.ink2, marginTop: 14 }}>Your rep <span style={{ color: D.ink, fontWeight: 600 }}>{org?.account_rep || 'Meredith Cole'}</span> is online · 11 min avg reply.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: isMobile ? 'flex-start' : 'end', flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/catalog')} style={{ background: D.plum, color: D.paper, border: 'none', padding: '12px 20px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>Quick reorder</button>
              <button onClick={() => navigate('/contact')} style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '12px 20px', borderRadius: 999, cursor: 'pointer', fontSize: 14 }}>Message rep</button>
              <button onClick={() => { auth.logout(); navigate('/'); }} style={{ background: 'transparent', color: D.ink2, border: 'none', padding: '12px 14px', cursor: 'pointer', fontSize: 13 }}>Sign out</button>
            </div>
          </div>
        </div>
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: `24px ${padX}px ${isMobile ? 56 : 80}px` }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: isMobile ? 10 : 14, marginBottom: isMobile ? 18 : 24 }}>
            {[
              [fmt.short(monthSpend), 'This month spend', `${allOrders.length} orders YTD`, true],
              [String(activeOrders), 'Active orders', `${allOrders.filter((o) => o.status === 'in_transit').length} in transit`, false],
              [fmt.number(formularySize), 'SKUs in formulary', '12 low-stock alerts', false],
              [(org?.terms || 'NET30').toUpperCase(), 'Payment terms', `${fmt.money(outstanding)} outstanding`, false],
            ].map(([big, small, sub, up], i) => (
              <div key={i} style={{ padding: isMobile ? 16 : 20, background: D.card, borderRadius: 14, border: `1px solid ${D.line}` }}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{small.toUpperCase()}</div>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 36, color: D.ink, letterSpacing: -0.7, marginTop: 8 }}>{big}</div>
                <div style={{ fontSize: 12, color: up ? '#3b8760' : D.ink2, marginTop: 4 }}>{sub}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: 18 }}>
            <div style={{ background: D.card, borderRadius: 14, border: `1px solid ${D.line}`, overflow: 'hidden' }}>
              <div style={{ padding: '18px 22px', borderBottom: `1px solid ${D.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: D.display, fontSize: 22 }}>Recent orders</div>
                <button onClick={() => navigate('/account/invoices')} style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3, background: 'none', border: 'none', cursor: 'pointer' }}>VIEW ALL</button>
              </div>
              {orders.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: D.ink3 }}>No orders yet.</div>
              ) : (
                <div className={isMobile ? 'um-scroll-x' : ''}>
                  <table style={{ width: '100%', minWidth: isMobile ? 520 : 'auto', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                        {['ORDER', 'DATE', 'ITEMS', 'TOTAL', 'STATUS'].map((h) => <th key={h} style={{ padding: '12px 16px', textAlign: 'left' }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o, i) => {
                        const items = db.list('order_items', { where: { order_id: o.id } }).reduce((a, b) => a + b.qty, 0);
                        const c = STATUS_COLOR[o.status] || D.ink3;
                        return (
                          <tr key={o.id} onClick={() => navigate(`/orders/${o.id}/track`)} style={{ borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, cursor: 'pointer' }}>
                            <td style={{ padding: '14px 16px', fontFamily: D.mono, fontSize: 12 }}>{o.id}</td>
                            <td style={{ padding: '14px 16px', color: D.ink2 }}>{fmt.date(o.placed_at)}</td>
                            <td style={{ padding: '14px 16px' }}>{items}</td>
                            <td style={{ padding: '14px 16px', fontFamily: D.display, fontSize: 16, color: D.plum }}>{fmt.money(o.total)}</td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: c }}><Icon.dot /> {o.status.replace('_', ' ').toUpperCase()}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ background: D.plum, color: D.paper, borderRadius: 14, padding: 22 }}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plumSoft }}>YOUR REP</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 24, background: D.plumSoft }} />
                  <div>
                    <div style={{ fontFamily: D.display, fontSize: 22, letterSpacing: -0.3 }}>{org?.account_rep || 'Meredith Cole'}</div>
                    <div style={{ fontSize: 12, color: D.plumSoft }}>{org?.segment === 'gov' ? 'Government' : 'Southeast'} · {org?.segment?.toUpperCase()} specialist</div>
                  </div>
                </div>
                <div style={{ marginTop: 16, fontSize: 13, color: D.plumSoft, lineHeight: 1.5 }}>&ldquo;{(profile?.name || 'Friend').split(' ')[0]} — circling back on the next reorder. Anything to add to the cart?&rdquo;</div>
                <button onClick={() => navigate('/contact')} style={{ marginTop: 14, width: '100%', background: D.paper, color: D.plum, border: 'none', padding: 12, borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Reply · book a call</button>
              </div>
              <div style={{ background: D.card, borderRadius: 14, padding: 22, border: `1px solid ${D.line}` }}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>QUICK LINKS</div>
                {[
                  ['Build a quote (self-serve)', '/portal/quote'],
                  ['Your quotes', '/account/quotes'],
                  ['Open the catalog', '/catalog'],
                  ['Account settings', '/account/settings'],
                  ['Invoices & receipts', '/account/invoices'],
                  ['HCPCS reference', '/resources/coding'],
                ].map(([label, path]) => (
                  <button key={path} onClick={() => navigate(path)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '14px 0', borderTop: `1px solid ${D.line}`, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: D.sans, color: D.ink, fontSize: 14, textAlign: 'left' }}>
                    <span>{label}</span>
                    <Icon.arrow />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
