import { useMemo } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard, Sparkline } from '../../components/layout/AdminCard.jsx';
import { Icon } from '../../components/shared/Icon.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';

const SEGMENT_LABEL = { asc: 'Ambulatory surgery', gov: 'Gov/VA', pharmacy: 'Pharmacy', distributors: 'Regional distributors', ems: 'EMS', hospital: 'Hospital' };
const SEGMENT_COLOR = { asc: '#5e2963', gov: '#b8502c', pharmacy: '#3b8760', distributors: '#8f8490', ems: '#b8a04a', hospital: '#564b5c' };

export function AdminAnalytics() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const orders = db.useTable('orders');
  const products = db.useTable('products');
  const orderItems = db.useTable('order_items');

  const trail = useMemo(() => {
    const days = 30;
    const buckets = Array.from({ length: days }, () => 0);
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    orders.forEach((o) => {
      const d = Math.floor((now - new Date(o.placed_at).getTime()) / 86400000);
      if (d >= 0 && d < days) buckets[days - 1 - d] += o.total / 1000;
    });
    return buckets;
  }, [orders]);

  const byCategory = useMemo(() => {
    const m = new Map();
    orderItems.forEach((it) => {
      const p = products.find((pr) => pr.sku === it.sku);
      if (!p) return;
      m.set(p.category, (m.get(p.category) || 0) + it.ext_price);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [orderItems, products]);
  const totalCat = byCategory.reduce((a, [, v]) => a + v, 0);

  const topSkus = useMemo(() => {
    const m = new Map();
    orderItems.forEach((it) => m.set(it.sku, (m.get(it.sku) || 0) + it.ext_price));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [orderItems]);

  const segmentMix = useMemo(() => {
    const m = new Map();
    orders.forEach((o) => m.set(o.segment, (m.get(o.segment) || 0) + o.total));
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0);
    return Array.from(m.entries()).map(([k, v]) => [k, v / Math.max(1, total)]).sort((a, b) => b[1] - a[1]);
  }, [orders]);

  const totalRev = orders.reduce((a, b) => a + b.total, 0);
  const target = totalRev * 0.92;

  const weekly = useMemo(() => {
    const weeks = 12;
    const buckets = Array.from({ length: weeks }, () => 0);
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    orders.forEach((o) => {
      const d = Math.floor((now - new Date(o.placed_at).getTime()) / (7 * 86400000));
      if (d >= 0 && d < weeks) buckets[weeks - 1 - d] += 1;
    });
    return buckets;
  }, [orders]);

  return (
    <AdminShell active="analytics">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 48 : 64}px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>ANALYTICS · REVENUE & PERFORMANCE</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', marginBottom: 22, flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>Analytics.</h1>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3 }}>FY26 · our billing system LIVE</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: 14, marginBottom: 14 }}>
          <AdminCard title={`Revenue · trailing 30 days · actual ${fmt.short(totalRev)} · target ${fmt.short(target)}`}>
            <Sparkline points={trail.length ? trail : [0]} tall />
            <div style={{ display: 'flex', gap: 20, marginTop: 18, fontSize: 12, color: D.ink2 }}>
              <span><Icon.dot style={{ color: D.plum }} /> Actual · {fmt.short(totalRev)}</span>
              <span><Icon.dot style={{ color: D.ink3 }} /> Target · {fmt.short(target)}</span>
              <span style={{ color: '#3b8760' }}>{totalRev > target ? '+' : ''}{fmt.pct((totalRev - target) / target)} over plan</span>
            </div>
          </AdminCard>
          <AdminCard title="By category">
            <div style={{ display: 'grid', gap: 10 }}>
              {byCategory.slice(0, 6).map(([n, v]) => (
                <div key={n}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{n}</span><span style={{ fontFamily: D.display, color: D.plum }}>{fmt.short(v)}</span>
                  </div>
                  <div style={{ height: 6, background: D.paperAlt, borderRadius: 3, marginTop: 6 }}>
                    <div style={{ height: 6, background: D.plum, borderRadius: 3, width: `${Math.max(2, Math.round((v / Math.max(1, totalCat)) * 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </AdminCard>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 14 }}>
          <AdminCard title="Top SKUs · 90 days">
            {topSkus.map(([sku, val], i) => {
              const p = products.find((pr) => pr.sku === sku);
              return (
                <div key={sku} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{p?.name?.split('·')[0]?.trim() || sku}</div>
                    <div style={{ fontSize: 11, color: D.ink3, fontFamily: D.mono }}>{sku}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: D.display, fontSize: 16, color: D.plum }}>{fmt.short(val)}</div>
                  </div>
                </div>
              );
            })}
          </AdminCard>
          <AdminCard title="Weekly orders · 12 wk">
            <div style={{ display: 'flex', alignItems: 'end', gap: 6, height: 180, marginTop: 12 }}>
              {weekly.map((v, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ background: D.plum, height: `${v * 12}px`, borderRadius: 2, minHeight: 4 }} />
                </div>
              ))}
            </div>
            <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3, letterSpacing: 1, marginTop: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span>WK-12</span><span>NOW</span>
            </div>
          </AdminCard>
          <AdminCard title="Customer segments · share of wallet">
            {segmentMix.map(([seg, share], i) => (
              <div key={seg} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: 5, background: SEGMENT_COLOR[seg] || D.ink3 }} />
                <div style={{ flex: 1, fontSize: 13 }}>{SEGMENT_LABEL[seg] || seg}</div>
                <div style={{ fontFamily: D.display, fontSize: 18, color: D.plum }}>{fmt.pct(share)}</div>
              </div>
            ))}
          </AdminCard>
        </div>
      </div>
    </AdminShell>
  );
}
