import { useMemo, useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { shipstation, cin7 } from '../../lib/services.js';
import { useViewport } from '../../lib/viewport.js';

const FILTERS = ['All', 'net30', 'net60', 'card', 'mspv', 'wire'];
const STATUS_COLOR = { picked: '#b8502c', label_created: '#5e2963', in_transit: '#2d6a4f', shipped: '#2d6a4f', delivered: '#8f8490', out_for_delivery: '#2d6a4f', pending: '#b8502c', processing: '#b8502c', cancelled: '#b8502c' };
const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'in_transit', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'invoiced', 'paid', 'refunded'];
const CARRIERS = ['fedex_ground', 'ups_ground', 'usps_priority', 'fedex_2day', 'ups_2day'];

export function AdminOrders() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const allOrders = db.useTable('orders', { orderBy: 'placed_at', dir: 'desc' });
  const [filter, setFilter] = useState('All');
  const [selectedId, setSelectedId] = useState(allOrders[0]?.id);

  const orders = useMemo(() => filter === 'All' ? allOrders : allOrders.filter((o) => o.payment_terms === filter), [allOrders, filter]);
  const selected = db.useRow('orders', selectedId);
  const selectedItems = db.useTable('order_items', { where: { order_id: selectedId } });
  const selectedShipment = db.useTable('shipments', { where: { order_id: selectedId } })[0];
  const auditLog = db.useTable('audit_log', { where: { ref_id: selectedId }, orderBy: 'created_at', dir: 'desc' });

  const today = allOrders.filter((o) => new Date(o.placed_at).toDateString() === new Date().toDateString());
  const inTransit = allOrders.filter((o) => o.status === 'in_transit').length;
  const pending = allOrders.filter((o) => o.status === 'pending' || o.status === 'processing').length;

  const [syncing, setSyncing] = useState(false);
  async function syncShipStation() {
    setSyncing(true);
    await Promise.all([cin7.syncInventory('wh_atl'), shipstation.getRates({ weight_lbs: 12 })]);
    setSyncing(false);
  }

  function updateOrderStatus(status) {
    if (!selected) return;
    db.update('orders', selected.id, { status });
    if (selectedShipment && (status === 'shipped' || status === 'in_transit' || status === 'delivered')) {
      db.update('shipments', selectedShipment.id, {
        status: status === 'delivered' ? 'delivered' : status === 'in_transit' ? 'in_transit' : 'label_created',
      });
    }
  }

  function updatePaymentStatus(payment_status) {
    if (!selected) return;
    db.update('orders', selected.id, { payment_status });
  }

  function updateTracking(tracking_number) {
    if (!selected) return;
    db.update('orders', selected.id, { tracking_number });
    if (selectedShipment) db.update('shipments', selectedShipment.id, { tracking_number });
  }

  function updateCarrier(carrier) {
    if (!selected) return;
    db.update('orders', selected.id, { carrier });
    if (selectedShipment) db.update('shipments', selectedShipment.id, { carrier });
  }

  function cancelOrder() {
    if (!selected) return;
    if (!window.confirm(`Cancel order ${selected.id}? This is reversible by changing the status back.`)) return;
    db.update('orders', selected.id, { status: 'cancelled', payment_status: 'refunded' });
  }

  return (
    <AdminShell active="orders">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 24 : 32}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>OPS · ORDERS & SHIPPING</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', flexDirection: isMobile ? 'column' : 'row', gap: 14 }}>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>Orders.</h1>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={syncShipStation} disabled={syncing} style={{ background: 'transparent', color: D.ink, border: `1px solid ${D.line}`, padding: '10px 16px', borderRadius: 999, fontSize: 13, cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.6 : 1 }}>
              {syncing ? 'Syncing…' : 'Sync our WMS + Cin7'}
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5,1fr)', gap: 12, marginTop: 22 }}>
          {[
            [String(today.length), 'Orders today'],
            [fmt.short(today.reduce((a, b) => a + b.total, 0)), 'Revenue today'],
            [String(pending), 'In WMS pick'],
            [String(inTransit), 'In transit'],
            [fmt.pct(allOrders.length ? allOrders.filter((o) => o.status === 'delivered').length / allOrders.length : 0), 'Fill rate · all-time'],
          ].map(([b, s]) => (
            <div key={s} style={{ padding: 20, background: D.card, borderRadius: 12, border: `1px solid ${D.line}` }}>
              <div style={{ fontFamily: D.display, fontSize: 28, color: D.plum, letterSpacing: -0.5 }}>{b}</div>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginTop: 6 }}>{s.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: `0 ${padX}px ${isMobile ? 32 : 40}px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 20 }}>
        <div style={{ marginTop: isMobile ? 18 : 24 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? D.plum : D.card, color: filter === f ? D.paper : D.ink2, border: `1px solid ${filter === f ? D.plum : D.line}`, padding: '6px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer' }}>{f.toUpperCase()}</button>
            ))}
          </div>
          <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, overflow: 'hidden' }}>
            <div className="um-scroll-x">
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3 }}>
                  {['ORDER', 'CUSTOMER', 'DATE', 'AMOUNT', 'TERMS', 'STATUS', 'DC'].map((h) => <th key={h} style={{ padding: '10px 14px', textAlign: 'left' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 30).map((r) => {
                  const c = STATUS_COLOR[r.status] || D.ink3;
                  return (
                    <tr key={r.id} onClick={() => setSelectedId(r.id)} style={{ borderTop: `1px solid ${D.line}`, background: selectedId === r.id ? 'rgba(94,41,99,.06)' : 'transparent', cursor: 'pointer' }}>
                      <td style={{ padding: '11px 14px', fontFamily: D.mono, color: D.plum, fontWeight: 600 }}>{r.id}</td>
                      <td style={{ padding: '11px 14px' }}>{r.customer_name}</td>
                      <td style={{ padding: '11px 14px', color: D.ink2, fontFamily: D.mono }}>{fmt.date(r.placed_at)}</td>
                      <td style={{ padding: '11px 14px', fontFamily: D.mono }}>{fmt.money(r.total)}</td>
                      <td style={{ padding: '11px 14px', color: D.ink2 }}>{(r.payment_terms || '').toUpperCase()}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: `${c}20`, color: c }}>{(r.status || '').replace('_', ' ').toUpperCase()}</span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: D.ink2 }}>{db.get('warehouses', r.ship_from_warehouse)?.code}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
        {selected && (
          <div style={{ marginTop: isMobile ? 8 : 24, background: D.card, borderRadius: 12, border: `2px solid ${D.plum}`, padding: isMobile ? 20 : 24 }}>
            <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>SELECTED · {selected.id}</div>
            <div style={{ fontFamily: D.display, fontSize: 30, letterSpacing: -0.5, marginTop: 6, lineHeight: 1.1 }}>{selected.customer_name}</div>
            <div style={{ fontSize: 12, color: D.ink2 }}>{selected.segment?.toUpperCase()} · {fmt.dateTime(selected.placed_at)}</div>
            <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                [fmt.money(selected.total), 'Total'],
                [`${selectedItems.length} / ${selectedItems.reduce((a, b) => a + b.qty, 0)}`, 'Lines / units'],
                [(selected.payment_terms || '').toUpperCase(), `Terms${selected.po_number ? ` · PO ${selected.po_number}` : ''}`],
                [selected.payment_status?.toUpperCase() || '—', 'Payment status'],
              ].map(([b, s]) => (
                <div key={s} style={{ padding: 12, background: D.paper, borderRadius: 8 }}>
                  <div style={{ fontSize: 16, fontFamily: D.display, letterSpacing: -0.3 }}>{b}</div>
                  <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3, marginTop: 4 }}>{s.toUpperCase()}</div>
                </div>
              ))}
            </div>
            {selectedShipment && (
              <>
                <div style={{ marginTop: 18, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginBottom: 8 }}>SHIPMENT</div>
                <div style={{ padding: 14, background: D.paper, borderRadius: 8, border: `1px solid ${D.line}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{db.get('warehouses', selectedShipment.warehouse_id)?.name}</div>
                    <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: '#2d6a4f20', color: '#2d6a4f' }}>{selectedShipment.status?.replace('_', ' ').toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 6 }}>{selectedShipment.carrier?.replace('_', ' ').toUpperCase()} · {selectedShipment.tracking_number} · {selectedShipment.cartons} cartons · {selectedShipment.weight_lbs} lbs</div>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 0.8, color: D.plum, marginTop: 8 }}>EST. DELIVERY · {fmt.dateTime(selectedShipment.eta).toUpperCase()}</div>
                </div>
              </>
            )}

            <div style={{ marginTop: 18, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginBottom: 8 }}>EDIT</div>
            <div style={{ padding: 14, background: D.paper, borderRadius: 8, border: `1px solid ${D.line}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'block' }}>
                <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3, marginBottom: 4 }}>STATUS</div>
                <select value={selected.status || ''} onChange={(e) => updateOrderStatus(e.target.value)} style={editSelect}>
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </label>
              <label style={{ display: 'block' }}>
                <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3, marginBottom: 4 }}>PAYMENT</div>
                <select value={selected.payment_status || ''} onChange={(e) => updatePaymentStatus(e.target.value)} style={editSelect}>
                  {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label style={{ display: 'block' }}>
                <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3, marginBottom: 4 }}>CARRIER</div>
                <select value={selected.carrier || ''} onChange={(e) => updateCarrier(e.target.value)} style={editSelect}>
                  <option value="">—</option>
                  {CARRIERS.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                </select>
              </label>
              <label style={{ display: 'block' }}>
                <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3, marginBottom: 4 }}>TRACKING #</div>
                <input
                  defaultValue={selected.tracking_number || ''}
                  onBlur={(e) => updateTracking(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  style={{ ...editSelect, fontFamily: D.mono }}
                  placeholder="1Z..."
                />
              </label>
            </div>
            <button
              onClick={cancelOrder}
              disabled={selected.status === 'cancelled'}
              style={{ marginTop: 12, width: '100%', background: 'transparent', color: D.terra, border: `1px solid ${D.terra}`, padding: '10px 16px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: selected.status === 'cancelled' ? 'not-allowed' : 'pointer', opacity: selected.status === 'cancelled' ? 0.5 : 1, fontFamily: 'inherit' }}
            >
              {selected.status === 'cancelled' ? 'Order cancelled' : 'Cancel this order'}
            </button>
            <div style={{ marginTop: 18, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginBottom: 8 }}>ACTIVITY · {auditLog.length} EVENTS</div>
            {auditLog.slice(0, 6).map((e, i) => (
              <div key={e.id} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, display: 'grid', gridTemplateColumns: '90px 1fr 120px', gap: 10, fontSize: 12 }}>
                <div style={{ color: D.plum, fontWeight: 600, fontFamily: D.mono, fontSize: 11 }}>{e.kind}</div>
                <div style={{ color: D.ink2 }}>{e.payload?.total ? `Total ${fmt.money(e.payload.total)}` : ''}</div>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 0.6, color: D.ink3, textAlign: 'right' }}>{fmt.dateTime(e.created_at).toUpperCase()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

const editSelect = { width: '100%', padding: '8px 10px', background: D.paperAlt, border: `1px solid ${D.line}`, borderRadius: 6, fontSize: 12, color: D.ink, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
