import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { useCart, cartStore } from '../store/cart.js';
import { auth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { placeOrder } from '../lib/orders.js';
import { approvedMethodsFor, METHOD_LABEL, TERMS_METHODS } from '../lib/paymentMethods.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

function Section({ title, children }) {
  return (
    <div style={{ background: D.card, borderRadius: 14, border: `1px solid ${D.line}`, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.line}`, fontFamily: D.display, fontSize: 18 }}>{title}</div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

const SHIPPING_OPTIONS = [
  { id: 'fedex_ground', label: 'Standard ground', sub: '3-5 business days', cost: 0 },
  { id: 'fedex_2day', label: 'Expedited', sub: '2 business days', cost: 38 },
  { id: 'fedex_overnight', label: 'Same-day (Atlanta metro)', sub: 'By 6pm today', cost: 95 },
];

export function Checkout() {
  const navigate = useNavigate();
  const session = auth.use();
  const cart = useCart();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({ title: 'Checkout', canonical: '/checkout', noindex: true });
  const items = cart.items;
  const subtotal = cart.subtotal;
  const orgId = session?.org_id || 'org_atlsurgical';
  const addresses = useMemo(() => db.list('addresses', { where: { org_id: orgId } }), [orgId]);
  const orgRow = useMemo(() => db.get('organizations', orgId), [orgId]);

  // PRD-26 §6: render only the payment rails Unite pre-approved for this
  // account. Selecting an off-list method is impossible in the UI and
  // rejected server-side in placeOrder (defense in depth).
  const paymentOptions = useMemo(() => {
    return approvedMethodsFor(orgRow).map((m) => ({
      id: m.method,
      label: METHOD_LABEL[m.method] || m.method,
      sub: TERMS_METHODS.has(m.method) && m.credit_limit != null ? `limit ${fmt.money(m.credit_limit, { cents: false })}` : (m.method === 'card' ? 'paid up front' : 'approved'),
    }));
  }, [orgRow]);

  const [activeAddrId, setActiveAddrId] = useState(addresses.find((a) => a.is_default)?.id || addresses[0]?.id);
  const [shipMethod, setShipMethod] = useState('fedex_ground');
  const [paymentMethod, setPaymentMethod] = useState(paymentOptions[0]?.id || 'card');
  const [poNumber, setPoNumber] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState(null);

  const ship = SHIPPING_OPTIONS.find((s) => s.id === shipMethod);
  const freight = subtotal > 500 ? 0 : ship.cost || 42;
  const total = +(subtotal + freight).toFixed(2);

  const stepActive = items.length === 0 ? 1 : 4;

  async function handlePlace() {
    if (items.length === 0) return;
    setError(null); setPlacing(true);
    try {
      const result = await placeOrder({
        customer: {
          user_id: session?.user_id || 'usr_demo',
          org_id: orgId,
          org_name: orgRow?.name || 'Atlanta Surgical Center',
          segment: orgRow?.segment || 'asc',
        },
        address: addresses.find((a) => a.id === activeAddrId),
        items: items.map((it) => ({ sku: it.sku, name: it.name, qty: it.qty, unit_price: it.unit_price })),
        payment_terms: paymentMethod,
        payment_method: paymentMethod,
        order_source: 'catalog',
        po_number: poNumber || null,
        ship_method: shipMethod,
      });
      cartStore.clear();
      if (result.held) { navigate('/account/invoices'); return; }
      navigate(`/orders/${result.order.id}/confirmed`);
    } catch (e) {
      setError(e?.message || 'Could not place the order. Try again.');
    } finally {
      setPlacing(false);
    }
  }

  if (items.length === 0) {
    return (
      <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
        <Nav />
        <main id="main" style={{ maxWidth: 640, margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>CHECKOUT</div>
          <h1 style={{ fontFamily: D.display, fontSize: 56, fontWeight: 400, letterSpacing: -1.2, lineHeight: 1, margin: '12px 0 18px' }}>Cart is empty.</h1>
          <p style={{ color: D.ink2 }}>Add a few items first — we&apos;ll be right here.</p>
          <button onClick={() => navigate('/catalog')} style={{ marginTop: 18, background: D.plum, color: D.paper, border: 'none', padding: '13px 22px', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Open the catalog</button>
        </main>
      </div>
    );
  }

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <div style={{ padding: `${isMobile ? 32 : 52}px ${padX}px 24px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum }}>CHECKOUT · {items.length} LINES · {cart.count} UNITS</div>
            <h1 style={{ fontFamily: D.display, fontSize: 'clamp(36px, 6.5vw, 64px)', fontWeight: 400, letterSpacing: 'clamp(-0.8px, -0.16vw, -1.5px)', margin: '10px 0 20px', lineHeight: 1.0 }}>
              Almost <em>there</em>.
            </h1>
            <div style={{ display: 'flex', gap: 4 }}>
              {['Address', 'Shipping', 'Payment', 'Review'].map((s, i) => (
                <div key={s} style={{ flex: 1 }}>
                  <div style={{ height: 3, background: i < stepActive ? D.plum : D.line, borderRadius: 2 }} />
                  <div style={{ fontFamily: D.mono, fontSize: isMobile ? 9 : 10, letterSpacing: 1, marginTop: 10, color: i < stepActive ? D.plum : D.ink3 }}>{isMobile ? String(i + 1).padStart(2, '0') : `${String(i + 1).padStart(2, '0')} · ${s.toUpperCase()}`}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1360, margin: '0 auto', padding: `28px ${padX}px ${isMobile ? 64 : 80}px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: isMobile ? 22 : 36 }}>
          <div style={{ display: 'grid', gap: 20 }}>
            <Section title="01 · Shipping address">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                {addresses.map((a) => (
                  <button key={a.id} onClick={() => setActiveAddrId(a.id)} style={{ padding: 16, borderRadius: 12, border: `1.5px solid ${activeAddrId === a.id ? D.plum : D.line}`, background: activeAddrId === a.id ? D.paperAlt : D.card, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'start', gap: 10, fontFamily: D.sans, color: D.ink }}>
                    <div style={{ width: 16, height: 16, borderRadius: 8, border: `1.5px solid ${activeAddrId === a.id ? D.plum : D.ink3}`, marginTop: 3, background: activeAddrId === a.id ? D.plum : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.paper, fontSize: 10 }}>{activeAddrId === a.id ? '✓' : ''}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{a.label}</div>
                      <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{a.line1} · {a.city}, {a.state} {a.zip}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="02 · Shipping method">
              {SHIPPING_OPTIONS.map((s, i) => (
                <button key={s.id} onClick={() => setShipMethod(s.id)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: 16, borderBottom: i === SHIPPING_OPTIONS.length - 1 ? 'none' : `1px solid ${D.line}`, display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 14, alignItems: 'center', cursor: 'pointer', fontFamily: D.sans, color: D.ink }}>
                  <div style={{ width: 16, height: 16, borderRadius: 8, border: `1.5px solid ${shipMethod === s.id ? D.plum : D.ink3}`, background: shipMethod === s.id ? D.plum : 'transparent' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.label}</div>
                    <div style={{ fontSize: 12, color: D.ink2, marginTop: 2 }}>{s.sub}</div>
                  </div>
                  <div style={{ fontFamily: D.display, fontSize: 18, color: D.plum }}>{s.cost === 0 ? 'Free' : fmt.money(s.cost, { cents: false })}</div>
                </button>
              ))}
            </Section>

            <Section title="03 · Payment">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10 }}>
                {paymentOptions.map((p) => (
                  <button key={p.id} onClick={() => setPaymentMethod(p.id)} style={{ padding: 16, borderRadius: 12, border: `1.5px solid ${paymentMethod === p.id ? D.plum : D.line}`, background: paymentMethod === p.id ? D.paperAlt : D.card, cursor: 'pointer', fontFamily: D.sans, textAlign: 'left', color: D.ink }}>
                    <div style={{ fontFamily: D.display, fontSize: 18, letterSpacing: -0.3 }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: D.ink3, fontFamily: D.mono, marginTop: 4, letterSpacing: 0.8 }}>{p.sub.toUpperCase()}</div>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: D.paperAlt, fontSize: 13, color: D.ink2 }}>
                PO # (optional) — <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="Enter customer PO" style={{ border: 'none', background: 'transparent', outline: 'none', fontFamily: D.sans, fontSize: 13, color: D.ink, minWidth: 200 }} />
              </div>
            </Section>

            <Section title="04 · Review line items">
              <div style={{ display: 'grid', gap: 8 }}>
                {items.map((it) => (
                  <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, padding: '8px 0', fontSize: 13, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{it.name}</div>
                      <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>{it.sku}</div>
                    </div>
                    <div style={{ color: D.ink2 }}>× {it.qty}</div>
                    <div style={{ fontFamily: D.display, fontSize: 16, color: D.plum, minWidth: 80, textAlign: 'right' }}>{fmt.money(it.qty * it.unit_price)}</div>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          <div>
            <div style={{ position: isMobile ? 'static' : 'sticky', top: 120, background: D.plum, color: D.paper, borderRadius: 16, padding: isMobile ? 22 : 28 }}>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plumSoft }}>ORDER · {items.length} ITEMS</div>
              <div style={{ marginTop: 18, display: 'grid', gap: 12, fontSize: 13 }}>
                {items.slice(0, 5).map((it) => (
                  <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12 }}>
                    <span style={{ color: D.plumSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name.split('·')[0].trim()}</span>
                    <span style={{ color: D.plumSoft }}>× {it.qty}</span>
                    <span>{fmt.money(it.qty * it.unit_price)}</span>
                  </div>
                ))}
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,.18)', margin: '20px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: D.plumSoft }}>
                <span>Freight</span><span>{freight === 0 ? 'Free' : fmt.money(freight)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginTop: 16 }}>
                <div style={{ fontFamily: D.mono, fontSize: 11, color: D.plumSoft }}>TOTAL</div>
                <div style={{ fontFamily: D.display, fontSize: 40, letterSpacing: -1 }}>{fmt.money(total)}</div>
              </div>
              {error && <div style={{ marginTop: 14, padding: 10, background: 'rgba(255,255,255,.12)', borderRadius: 8, fontSize: 12 }}>{error}</div>}
              <button disabled={placing} onClick={handlePlace} style={{ marginTop: 20, width: '100%', background: D.paper, color: D.plum, border: 'none', padding: 14, borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: placing ? 'wait' : 'pointer', opacity: placing ? 0.7 : 1 }}>
                {placing ? 'Placing order…' : 'Place order'}
              </button>
              <div style={{ marginTop: 12, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plumSoft, textAlign: 'center' }}>SYNCS TO our billing system · SHIPSTATION · STRIPE</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
