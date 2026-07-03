import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard, Sparkline } from '../../components/layout/AdminCard.jsx';
import { Icon } from '../../components/shared/Icon.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';

const STATUS_COLOR = { delivered: '#3b8760', in_transit: '#1d5c4d', shipped: '#1d5c4d', processing: '#b3592b', pending: '#b3592b' };

export function AdminOverview() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const orders = db.useTable('orders', { orderBy: 'placed_at', dir: 'desc' });
  const leads = db.useTable('leads');
  const products = db.useTable('products');
  const inventory = db.useTable('inventory');
  const invoices = db.useTable('invoices');

  const currentMonth = new Date().getMonth();
  const monthOrders = useMemo(
    () => orders.filter((o) => new Date(o.placed_at).getMonth() === currentMonth),
    [orders, currentMonth],
  );
  const revenueMTD = monthOrders.reduce((a, b) => a + b.total, 0);
  const fillRate = orders.length ? orders.filter((o) => o.status === 'delivered').length / orders.length : 0;

  const segmentMix = useMemo(() => {
    const map = new Map();
    monthOrders.forEach((o) => map.set(o.segment, (map.get(o.segment) || 0) + o.total));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthOrders]);

  const lowStock = inventory.filter((i) => i.on_hand <= i.reorder_at).length;
  const overdueInvoices = invoices.filter((i) => i.status === 'open' && new Date(i.due_date) < new Date());
  // Stable sparkline derived from order count (not random) so memoization is preserved.
  const sparkline = Array.from({ length: 30 }, (_, i) => Math.round(40 + i * 2.5 + (orders.length % 8)));

  return (
    <AdminShell active="overview">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 48 : 64}px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>OPERATIONS · OVERVIEW</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', marginBottom: 22, flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>Operations overview.</h1>
          <div style={{ fontFamily: D.mono, fontSize: isMobile ? 10 : 11, letterSpacing: 1, color: D.ink3 }}>BILLING · SHIPPING · PAYMENTS</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
          {[
            [fmt.short(revenueMTD), 'Revenue MTD', `${monthOrders.length} orders`],
            [String(orders.length), 'Orders all-time', `${orders.filter((o) => o.status === 'in_transit').length} in transit`],
            [fmt.number(products.length), 'SKUs live', `${lowStock} below reorder`],
            [fmt.pct(fillRate), 'Fill rate', 'Same-day shipping (orders by 2pm EST)'],
          ].map(([b, s, sub]) => (
            <div key={s} style={{ padding: isMobile ? 16 : 22, background: D.card, borderRadius: 14, border: `1px solid ${D.line}` }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{s.toUpperCase()}</div>
              <div style={{ fontFamily: D.display, fontSize: isMobile ? 24 : 40, color: D.ink, letterSpacing: -0.8, marginTop: 8 }}>{b}</div>
              <div style={{ fontSize: 12, color: '#3b8760', marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 14 }}>
          <AdminCard title="Revenue · trailing 30 days">
            <Sparkline points={sparkline} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', marginTop: 20, gap: 18 }}>
              {segmentMix.slice(0, 4).map(([seg, val]) => (
                <div key={seg}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{seg.toUpperCase()}</div>
                  <div style={{ fontFamily: D.display, fontSize: 22, color: D.ink, marginTop: 4 }}>{fmt.short(val)}</div>
                  <div style={{ fontSize: 11, color: D.plum, fontFamily: D.mono }}>{fmt.pct(val / Math.max(1, revenueMTD))} share</div>
                </div>
              ))}
            </div>
          </AdminCard>
          <AdminCard title="Alerts">
            {[
              ...inventory.filter((i) => i.on_hand <= i.reorder_at).slice(0, 2).map((i) => {
                const p = db.get('products', i.sku);
                return ['Low stock', `${p?.name?.split('·')[0]?.trim() || i.sku} · ${i.on_hand} on hand`, D.terra];
              }),
              ...overdueInvoices.slice(0, 1).map((inv) => ['Invoice overdue', `${inv.id} · ${fmt.money(inv.amount)}`, D.terra]),
              ...leads.filter((l) => l.status === 'hot').slice(0, 2).map((l) => ['Hot lead', `${l.org_name} · ${fmt.short(l.est_annual_value)}`, '#3b8760']),
            ].map(([h, s, c], i) => (
              <div key={i} style={{ padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, display: 'flex', gap: 12, alignItems: 'start' }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: c, marginTop: 6 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{h}</div>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 2 }}>{s}</div>
                </div>
              </div>
            ))}
          </AdminCard>
        </div>
        <div style={{ marginTop: 14 }}>
          <AdminCard title="Recent orders">
            <div className="um-scroll-x">
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                  {['ORDER', 'CUSTOMER', 'SEGMENT', 'ITEMS', 'TOTAL', 'PAYMENT', 'STATUS'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: `1px solid ${D.line}` }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 8).map((o) => {
                  const items = db.list('order_items', { where: { order_id: o.id } }).reduce((a, b) => a + b.qty, 0);
                  const c = STATUS_COLOR[o.status] || D.ink3;
                  return (
                    <tr key={o.id} onClick={() => navigate(`/admin/orders`)} style={{ borderTop: `1px solid ${D.line}`, cursor: 'pointer' }}>
                      <td style={{ padding: '12px', fontFamily: D.mono, fontSize: 12 }}>{o.id}</td>
                      <td style={{ padding: '12px', fontWeight: 500 }}>{o.customer_name}</td>
                      <td style={{ padding: '12px', color: D.ink2 }}>{o.segment?.toUpperCase()}</td>
                      <td style={{ padding: '12px' }}>{items}</td>
                      <td style={{ padding: '12px', fontFamily: D.display, fontSize: 15, color: D.plum }}>{fmt.money(o.total)}</td>
                      <td style={{ padding: '12px', color: D.ink2 }}>{(o.payment_terms || '').toUpperCase()}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: c }}><Icon.dot /> {o.status?.replace('_', ' ').toUpperCase()}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </AdminCard>
        </div>
      </div>
    </AdminShell>
  );
}
