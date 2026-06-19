import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';
import { purchaseOrders } from '../../lib/wms/purchaseOrders.js';
import { draftPurchaseOrders } from '../../lib/replenishment.js';

const STATUS_COLOR = {
  draft: D.ink3, approved: '#b8a04a', sent: '#4a78b8', partial: '#b8a04a',
  received: '#3b8760', closed: D.ink2, cancelled: D.terra,
};

export function AdminPurchaseOrders() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const pos = db.useTable('purchase_orders', { orderBy: 'created_at', dir: 'desc' });
  const [busy, setBusy] = useState(null);
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(
    () => (filter === 'all' ? pos : pos.filter((p) => p.status === filter)),
    [pos, filter],
  );

  async function act(fn, id) {
    setBusy(id);
    try { await fn(); } finally { setBusy(null); }
  }

  const counts = useMemo(() => {
    const c = {};
    for (const p of pos) c[p.status] = (c[p.status] || 0) + 1;
    return c;
  }, [pos]);

  return (
    <AdminShell active="replenish">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px 64px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>OPS · PURCHASE ORDERS</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, margin: 0 }}>Purchase orders.</h1>
          <button
            onClick={() => act(async () => { await draftPurchaseOrders(); }, 'draft-all')}
            disabled={busy === 'draft-all'}
            style={{ background: D.plum, color: D.paper, border: 'none', padding: '11px 18px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            {busy === 'draft-all' ? 'Drafting…' : 'Draft POs from replenishment'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {['all', 'draft', 'approved', 'sent', 'partial', 'received', 'closed', 'cancelled'].map((s) => (
            <button key={s} onClick={() => setFilter(s)} style={{
              fontFamily: D.mono, fontSize: 11, letterSpacing: 0.6, padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${filter === s ? D.plum : D.line}`, background: filter === s ? D.plum : D.card, color: filter === s ? D.paper : D.ink2,
            }}>{s.toUpperCase()}{s !== 'all' && counts[s] ? ` · ${counts[s]}` : ''}</button>
          ))}
        </div>

        <AdminCard title={`${filtered.length} purchase order(s)`}>
          <div className="um-scroll-x">
            <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                  {['PO', 'VENDOR', 'LINES', 'UNITS (RCVD/ORD)', 'TOTAL', 'STATUS', 'ACTIONS'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: `1px solid ${D.line}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const prog = purchaseOrders.progress(p.id) || { ordered: 0, received: 0 };
                  return (
                    <tr key={p.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                      <td style={{ padding: '12px', fontFamily: D.mono, fontSize: 12 }}>
                        <Link to={`/admin/purchase-orders/${p.id}/print`} style={{ color: D.plum }}>{p.id}</Link>
                      </td>
                      <td style={{ padding: '12px', fontWeight: 500 }}>{p.vendor_name}</td>
                      <td style={{ padding: '12px', color: D.ink2 }}>{p.line_items?.length || 0}</td>
                      <td style={{ padding: '12px', fontFamily: D.mono }}>{prog.received}/{prog.ordered}</td>
                      <td style={{ padding: '12px', fontFamily: D.mono }}>{fmt.money(p.total_cost || 0, { cents: false })}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: STATUS_COLOR[p.status] || D.ink2 }}>● {p.status}</span>
                      </td>
                      <td style={{ padding: '12px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {p.status === 'draft' && <Act label="Approve" busy={busy === p.id} onClick={() => act(() => purchaseOrders.approve(p.id), p.id)} />}
                        {p.status === 'approved' && <Act label="Send" busy={busy === p.id} onClick={() => act(() => purchaseOrders.send(p.id), p.id)} />}
                        {(p.status === 'sent' || p.status === 'partial') && <Link to="/admin/inventory/receive" style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum }}>RECEIVE</Link>}
                        {p.status === 'received' && <Act label="Close" busy={busy === p.id} onClick={() => act(() => purchaseOrders.close(p.id), p.id)} />}
                        {['draft', 'approved', 'sent'].includes(p.status) && <Act label="Cancel" danger busy={busy === p.id} onClick={() => act(() => purchaseOrders.cancel(p.id), p.id)} />}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '28px 12px', textAlign: 'center', color: D.ink3 }}>No purchase orders in this view.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </div>
    </AdminShell>
  );
}

function Act({ label, onClick, busy, danger }) {
  return (
    <button onClick={onClick} disabled={busy} style={{
      background: 'transparent', border: 'none', cursor: busy ? 'wait' : 'pointer', padding: 0,
      fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: danger ? D.terra : D.plum,
    }}>{busy ? '…' : label.toUpperCase()}</button>
  );
}
