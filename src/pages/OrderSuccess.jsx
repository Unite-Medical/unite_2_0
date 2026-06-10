import { useNavigate, useParams } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const FALLBACK_REP = { name: 'Miguel Vasquez', phone: '833.868.6483', email: 'sales@unitemedical.net' };

export function OrderSuccess() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({ title: 'Order confirmed', noindex: true });
  const order = db.useRow('orders', id);
  const items = db.useTable('order_items', { where: { order_id: id } });
  const ship = db.useTable('shipments', { where: { order_id: id } })[0];
  const invoice = db.useTable('invoices', { where: { order_id: id } })[0];
  const address = order ? db.get('addresses', order.ship_to_address_id) : null;
  const org = order ? db.get('organizations', order.customer_id) : null;
  const placedBy = order ? db.get('profiles', order.placed_by) : null;
  const repName = org?.account_rep || FALLBACK_REP.name;

  if (!order) {
    return (
      <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
        <Nav />
        <main style={{ maxWidth: 640, margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
          <h1 style={{ fontFamily: D.display, fontSize: 56, fontWeight: 400, letterSpacing: -1.2, lineHeight: 1, margin: 0 }}>Order not found.</h1>
          <p style={{ color: D.ink2, marginTop: 14 }}>Check the order number and try again.</p>
          <button onClick={() => navigate('/dashboard')} style={{ marginTop: 16, background: D.plum, color: D.paper, border: 'none', padding: '13px 22px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Open dashboard</button>
        </main>
      </div>
    );
  }

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main" style={{ maxWidth: 1080, margin: '0 auto', padding: `${isMobile ? 40 : 72}px ${padX}px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '52px 1fr' : '64px 1fr', gap: isMobile ? 14 : 20, alignItems: 'center' }}>
          <div style={{ width: isMobile ? 52 : 64, height: isMobile ? 52 : 64, borderRadius: 32, background: D.plum, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon.check style={{ color: D.paper, width: 28, height: 28 }} />
          </div>
          <div>
            <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>ORDER #{order.id}</div>
            <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 6.5vw, 68px)', fontWeight: 400, letterSpacing: 'clamp(-0.7px, -0.16vw, -1.5px)', lineHeight: 1.05, margin: '10px 0 0' }}>
              Order confirmed, <Grad>{(placedBy?.name || 'friend').split(' ')[0]}</Grad>.
            </h1>
          </div>
        </div>
        <p style={{ fontSize: 17, color: D.ink2, marginTop: 22, maxWidth: 720, lineHeight: 1.55 }}>
          We&apos;ve picked at the {db.get('warehouses', order.ship_from_warehouse)?.name || 'Atlanta DC'} and our WMS has issued tracking. our billing system invoice {invoice?.id} is in the customer&apos;s queue.
        </p>

        <div style={{ marginTop: isMobile ? 28 : 40, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr', gap: isMobile ? 18 : 24 }}>
          <div style={{ background: D.card, borderRadius: 16, border: `1px solid ${D.line}`, padding: isMobile ? 22 : 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 22 }}>
              <div style={{ fontFamily: D.display, fontSize: 28, letterSpacing: -0.4 }}>In this order</div>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3 }}>{items.length} LINES · {items.reduce((a, b) => a + b.qty, 0)} UNITS</div>
            </div>
            {items.map((it, i) => (
              <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px', gap: 16, padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, fontSize: 14 }}>
                <div style={{ color: D.ink }}>{it.name}<div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3, marginTop: 2 }}>{it.sku}</div></div>
                <div style={{ fontFamily: D.mono, color: D.ink2, textAlign: 'right' }}>× {it.qty}</div>
                <div style={{ fontFamily: D.mono, color: D.ink, textAlign: 'right' }}>{fmt.money(it.ext_price)}</div>
              </div>
            ))}
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: `2px solid ${D.plum}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: D.ink2 }}>
                <span>Subtotal</span><span>{fmt.money(order.subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: D.ink2, marginTop: 6 }}>
                <span>Freight</span><span>{order.freight === 0 ? 'Free' : fmt.money(order.freight)}</span>
              </div>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: D.display, fontSize: 22, letterSpacing: -0.3 }}>Total · {(order.payment_terms || 'net30').toUpperCase()}</div>
                <div style={{ fontFamily: D.display, fontSize: 44, color: D.plum, letterSpacing: -0.9 }}>{fmt.money(order.total)}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ padding: 24, background: D.plum, color: D.paper, borderRadius: 16 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plumSoft }}>ESTIMATED DELIVERY</div>
              <div style={{ fontFamily: D.display, fontSize: 36, letterSpacing: -0.9, marginTop: 8, lineHeight: 1 }}>{fmt.date(ship?.eta || order.eta, { year: false })}</div>
              <div style={{ fontSize: 13, color: D.plumSoft, marginTop: 8 }}>{ship?.carrier?.replace('_', ' ').toUpperCase()} · {ship?.tracking_number}</div>
              <button onClick={() => navigate(`/orders/${order.id}/track`)} style={{ marginTop: 18, width: '100%', background: D.paper, color: D.plum, border: 'none', padding: 12, borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Track order</button>
            </div>

            {address && (
              <div style={{ padding: 24, background: D.card, borderRadius: 16, border: `1px solid ${D.line}` }}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>SHIP TO</div>
                <div style={{ fontFamily: D.display, fontSize: 18, marginTop: 8, letterSpacing: -0.2 }}>{address.label}</div>
                <div style={{ fontSize: 13, color: D.ink2, marginTop: 4, lineHeight: 1.5 }}>{address.line1}<br />{address.city}, {address.state} {address.zip}</div>
                {order.po_number && <div style={{ marginTop: 14, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>PO · {order.po_number}</div>}
              </div>
            )}

            <div style={{ padding: 24, background: D.card, borderRadius: 16, border: `1px solid ${D.line}` }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>YOUR REP</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, background: D.plum }} />
                <div>
                  <div style={{ fontFamily: D.display, fontSize: 18, letterSpacing: -0.2 }}>{repName}</div>
                  <div style={{ fontSize: 12, color: D.ink2 }}>{FALLBACK_REP.phone} · {repName.toLowerCase().split(' ')[0]}@unitemedical.net</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
