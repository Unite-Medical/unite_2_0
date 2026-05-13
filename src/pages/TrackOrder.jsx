import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const PROGRESSION = [
  { status: 'label_created', label: 'Label printed', sub: 'our WMS issued tracking' },
  { status: 'in_transit', label: 'In transit', sub: 'Picked up by carrier' },
  { status: 'out_for_delivery', label: 'Out for delivery', sub: 'On the truck' },
  { status: 'delivered', label: 'Delivered', sub: 'Signed for at receiving' },
];

function nextStatus(current) {
  const idx = PROGRESSION.findIndex((p) => p.status === current);
  if (idx === -1 || idx === PROGRESSION.length - 1) return null;
  return PROGRESSION[idx + 1];
}

/** Bump the shipment forward every ~15s so the page feels alive in a demo. */
function useShipmentTicker(shipment) {
  useEffect(() => {
    if (!shipment) return undefined;
    const t = setInterval(() => {
      const fresh = db.get('shipments', shipment.id);
      if (!fresh) return;
      const next = nextStatus(fresh.status);
      if (!next) return;
      db.update('shipments', fresh.id, {
        status: next.status,
        events: [...(fresh.events || []), { ts: new Date().toISOString(), label: `${next.label} · ${next.sub}` }],
      });
      if (next.status === 'delivered') {
        db.update('orders', fresh.order_id, { status: 'delivered' });
      } else if (next.status === 'in_transit') {
        db.update('orders', fresh.order_id, { status: 'in_transit' });
      }
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment?.id]);
}

export function TrackOrder() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({ title: 'Track order', noindex: true });
  const order = db.useRow('orders', id);
  const shipment = db.useTable('shipments', { where: { order_id: id } })[0];
  const items = db.useTable('order_items', { where: { order_id: id } });
  const wh = order ? db.get('warehouses', order.ship_from_warehouse) : null;
  useShipmentTicker(shipment);

  if (!order) {
    return (
      <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
        <Nav />
        <main style={{ maxWidth: 640, margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
          <h1 style={{ fontFamily: D.display, fontSize: 56, fontWeight: 400, letterSpacing: -1.2, lineHeight: 1, margin: 0 }}>Tracking unavailable.</h1>
          <p style={{ color: D.ink2, marginTop: 14 }}>This order ID isn&apos;t in the system.</p>
          <button onClick={() => navigate('/dashboard')} style={{ marginTop: 16, background: D.plum, color: D.paper, border: 'none', padding: '13px 22px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Back to dashboard</button>
        </main>
      </div>
    );
  }

  const completedIdx = Math.max(0, PROGRESSION.findIndex((p) => p.status === (shipment?.status || 'label_created')));

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow={`ORDER ${order.id} · ${order.customer_name?.toUpperCase()}`}
          title={<>Live <Grad>tracking</Grad>.</>}
          sub={`Live from ${shipment?.carrier?.replace('_', ' ').toUpperCase() || 'CARRIER'} + our ${wh?.name || 'DC'}. Refreshes automatically.`}
          right={
            <div style={{ padding: 24, background: D.card, border: `1px solid ${D.line}`, borderRadius: 16 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>TRACKING</div>
              <div style={{ fontFamily: D.display, fontSize: 28, letterSpacing: -0.5, marginTop: 8, wordBreak: 'break-all' }}>{shipment?.tracking_number || '—'}</div>
              <div style={{ fontSize: 13, color: D.ink2, marginTop: 6 }}>ETA {fmt.date(shipment?.eta || order.eta, { year: false })}</div>
            </div>
          }
        />

        <div style={{ maxWidth: 1360, margin: '0 auto', padding: `24px ${padX}px ${isMobile ? 56 : 64}px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: isMobile ? 22 : 32 }}>
          <div>
            <div style={{ height: isMobile ? 160 : 220, borderRadius: 16, border: `1px solid ${D.line}`, background: D.paperAlt, position: 'relative', overflow: 'hidden', marginBottom: isMobile ? 18 : 24 }}>
              <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(45deg, transparent 0 18px, rgba(94,41,99,0.04) 18px 19px)' }} />
              <svg viewBox="0 0 400 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
                <path d="M 60 70 Q 180 20 320 40" fill="none" stroke={D.plum} strokeWidth="0.8" strokeDasharray="3,3" />
                <circle cx="60" cy="70" r="2.5" fill={D.plum} /><circle cx="320" cy="40" r="2.5" fill={D.plum} />
                <circle cx={60 + (260 * (completedIdx / Math.max(1, PROGRESSION.length - 1)))} cy={70 - (30 * (completedIdx / Math.max(1, PROGRESSION.length - 1)))} r="4" fill={D.terra} />
              </svg>
              <div style={{ position: 'absolute', bottom: 18, left: 24, fontFamily: D.mono, fontSize: 11, letterSpacing: 0.8, color: D.plum }}>
                {(wh?.name || 'ATLANTA DC').toUpperCase()} → {(shipment?.carrier || '').toUpperCase()} → DESTINATION
              </div>
            </div>

            <div style={{ background: D.card, borderRadius: 16, border: `1px solid ${D.line}`, padding: isMobile ? 22 : 32 }}>
              <div style={{ fontFamily: D.display, fontSize: isMobile ? 24 : 30, letterSpacing: -0.5, marginBottom: 20 }}>Timeline</div>
              {PROGRESSION.map((p, i) => {
                const done = i <= completedIdx;
                const now = i === completedIdx;
                const event = (shipment?.events || []).slice().reverse().find((e) => e.label.startsWith(p.label));
                return (
                  <div key={p.status} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 160px', gap: 14, padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, alignItems: 'start' }}>
                    <div>
                      <div style={{ width: 16, height: 16, borderRadius: 8, background: done ? D.plum : D.line, marginTop: 2, boxShadow: now ? '0 0 0 6px rgba(94,41,99,.18)' : 'none' }} />
                    </div>
                    <div>
                      <div style={{ fontFamily: D.display, fontSize: 18, letterSpacing: -0.2, color: done ? D.ink : D.ink3 }}>{p.label}</div>
                      <div style={{ fontSize: 13, color: D.ink2, marginTop: 4 }}>{p.sub}</div>
                    </div>
                    <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 0.6, color: D.ink3, textAlign: 'right' }}>{event ? fmt.dateTime(event.ts).toUpperCase() : i === 0 ? fmt.dateTime(order.placed_at).toUpperCase() : '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
            <div style={{ padding: 24, background: D.card, borderRadius: 16, border: `1px solid ${D.line}` }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>SHIPMENT 1 OF 1</div>
              <div style={{ fontFamily: D.display, fontSize: 22, letterSpacing: -0.3, marginTop: 8 }}>{shipment?.cartons || '—'} cartons · {shipment?.weight_lbs || '—'} lbs</div>
              <div style={{ fontSize: 13, color: D.ink2, marginTop: 6 }}>{items.length} lines · {items.reduce((a, b) => a + b.qty, 0)} units shipped together</div>
            </div>
            <div style={{ padding: 24, background: D.card, borderRadius: 16, border: `1px solid ${D.line}` }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>ORDER VALUE</div>
              <div style={{ fontFamily: D.display, fontSize: 32, letterSpacing: -0.6, marginTop: 8, color: D.plum }}>{fmt.money(order.total)}</div>
              <div style={{ fontSize: 13, color: D.ink2, marginTop: 6 }}>{(order.payment_terms || 'net30').toUpperCase()} · {order.payment_status?.toUpperCase()}</div>
            </div>
            <button onClick={() => navigate('/contact')} style={{ background: D.plum, color: D.paper, border: 'none', padding: 14, borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Contact rep about this order</button>
            <button style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: 13, borderRadius: 999, fontSize: 14, cursor: 'pointer' }}>Download packing slip</button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
