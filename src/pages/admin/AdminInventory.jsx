import { useMemo } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard, Sparkline } from '../../components/layout/AdminCard.jsx';
import { Icon } from '../../components/shared/Icon.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';

export function AdminInventory() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const products = db.useTable('products');
  const inventory = db.useTable('inventory');
  const warehouses = db.useTable('warehouses');

  const stockBySku = useMemo(() => {
    const m = new Map();
    inventory.forEach((i) => m.set(i.sku, (m.get(i.sku) || 0) + i.on_hand));
    return m;
  }, [inventory]);

  const totalUnits = inventory.reduce((a, b) => a + b.on_hand, 0);
  const totalValue = products.reduce((a, p) => a + (stockBySku.get(p.sku) || 0) * (p.cogs || 0), 0);
  const low = inventory.filter((i) => i.on_hand <= i.reorder_at).length;
  const out = inventory.filter((i) => i.on_hand === 0).length;

  function reorder(sku) {
    const inv = inventory.find((i) => i.sku === sku && i.warehouse_id === 'wh_atl');
    if (!inv) return;
    db.update('inventory', inv.id, { on_hand: inv.on_hand + (inv.reorder_qty || 100) });
  }

  return (
    <AdminShell active="inventory">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 48 : 64}px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>OPS · INVENTORY</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', marginBottom: 22, flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>Inventory.</h1>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3 }}>SOURCE · CIN7 (SIM)</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 14 }}>
          {[
            [fmt.number(products.length), 'Total SKUs', `${fmt.number(totalUnits)} units on hand`],
            [fmt.short(totalValue), 'Inventory value', 'at COGS'],
            [String(low), 'Low stock', 'needs reorder'],
            [String(out), 'Out of stock', 'critical'],
          ].map(([b, s, sub]) => (
            <div key={s} style={{ padding: isMobile ? 16 : 22, background: D.card, borderRadius: 14, border: `1px solid ${D.line}` }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{s.toUpperCase()}</div>
              <div style={{ fontFamily: D.display, fontSize: isMobile ? 24 : 36, color: D.ink, letterSpacing: -0.6, marginTop: 8 }}>{b}</div>
              <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
          <AdminCard title="Movement · 30 days">
            <Sparkline points={[40,48,42,55,58,52,62,68,61,70,72,65,78,82,76,88,85,80,92,96,88,95,102,98,105,110,104,115,120,118]} dual />
            <div style={{ display: 'flex', gap: 20, marginTop: 18, fontSize: 12, color: D.ink2 }}>
              <span><Icon.dot style={{ color: D.plum }} /> Inbound · our freight forwarder ASNs</span>
              <span><Icon.dot style={{ color: D.terra }} /> Outbound · our WMS labels</span>
            </div>
          </AdminCard>
          <AdminCard title="Warehouse utilization">
            {warehouses.map((w, i) => (
              <div key={w.id} style={{ padding: '12px 0', borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{w.name}</span>
                  <span style={{ fontFamily: D.display, color: D.plum }}>{Math.round(w.utilization * 100)}%</span>
                </div>
                <div style={{ height: 6, background: D.paperAlt, borderRadius: 3, marginTop: 6 }}>
                  <div style={{ height: 6, background: D.plum, borderRadius: 3, width: `${Math.round(w.utilization * 100)}%` }} />
                </div>
              </div>
            ))}
          </AdminCard>
        </div>
        <AdminCard title={`Inventory table · ${products.length} SKUs`}>
          <div className="um-scroll-x">
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                {['SKU', 'PRODUCT', 'CATEGORY', 'ON HAND', 'REORDER AT', 'STATUS', 'ACTIONS'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: `1px solid ${D.line}` }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {products.slice(0, 20).map((p, i) => {
                const stock = stockBySku.get(p.sku) || 0;
                const reorderAt = inventory.find((inv) => inv.sku === p.sku)?.reorder_at || 0;
                const [label, color] = stock <= reorderAt ? ['Low', D.terra] : stock < reorderAt * 1.4 ? ['Watch', '#b8a04a'] : ['In stock', '#3b8760'];
                return (
                  <tr key={p.sku} style={{ borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                    <td style={{ padding: '12px', fontFamily: D.mono, fontSize: 12 }}>{p.sku}</td>
                    <td style={{ padding: '12px', fontWeight: 500 }}>{p.name.split('·')[0].trim()}</td>
                    <td style={{ padding: '12px', color: D.ink2 }}>{p.category}</td>
                    <td style={{ padding: '12px', fontFamily: D.mono }}>{stock.toLocaleString()}</td>
                    <td style={{ padding: '12px', fontFamily: D.mono, color: D.ink3 }}>{reorderAt}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color }}><Icon.dot /> {label}</span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <button onClick={() => reorder(p.sku)} style={{ background: 'transparent', color: D.plum, border: 'none', cursor: 'pointer', fontFamily: D.mono, fontSize: 11, letterSpacing: 1, padding: 0 }}>REORDER</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </AdminCard>
      </div>
    </AdminShell>
  );
}
