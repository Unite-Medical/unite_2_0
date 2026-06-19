import { useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { db } from '../../lib/db.js';
import { useViewport } from '../../lib/viewport.js';
import { transfers } from '../../lib/wms/transfers.js';

const INPUT = { padding: '10px 12px', borderRadius: 8, border: `1px solid ${D.line}`, fontFamily: D.sans, fontSize: 14, color: D.ink, background: D.card };
const STATUS_COLOR = { draft: D.ink3, in_transit: '#b8a04a', received: '#3b8760' };

export function AdminTransfers() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const rows = db.useTable('transfers', { orderBy: 'created_at', dir: 'desc' });
  const [form, setForm] = useState({ from_wh: 'wh_atl', to_wh: 'wh_reno', sku: '', qty: '' });
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  function create() {
    const qty = Number(form.qty);
    if (!form.sku || !(qty > 0)) { setMsg({ kind: 'err', text: 'SKU and a positive qty required.' }); return; }
    const res = transfers.createTransfer({ from_wh: form.from_wh, to_wh: form.to_wh, lines: [{ sku: form.sku, qty }] });
    setMsg(res.ok ? { kind: 'ok', text: `Created transfer ${res.transfer.id}.` } : { kind: 'err', text: res.reason });
    if (res.ok) setForm({ ...form, sku: '', qty: '' });
  }
  function act(id, fn) { setBusy(id); try { const r = fn(); if (!r.ok) setMsg({ kind: 'err', text: r.reason }); } finally { setBusy(null); } }

  return (
    <AdminShell active="inventory">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px 64px`, maxWidth: 980, margin: '0 auto' }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>OPS · TRANSFERS</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, margin: '0 0 22px' }}>Transfers.</h1>

        <AdminCard title="New inter-warehouse transfer">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={form.from_wh} onChange={(e) => setForm({ ...form, from_wh: e.target.value })} style={INPUT}>
              <option value="wh_atl">From: Atlanta</option><option value="wh_reno">From: Reno</option>
            </select>
            <select value={form.to_wh} onChange={(e) => setForm({ ...form, to_wh: e.target.value })} style={INPUT}>
              <option value="wh_reno">To: Reno</option><option value="wh_atl">To: Atlanta</option>
            </select>
            <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.trim() })} placeholder="SKU" style={{ ...INPUT, fontFamily: D.mono }} />
            <input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="Qty" style={{ ...INPUT, width: 100 }} />
            <button onClick={create} style={{ background: D.plum, color: D.paper, border: 'none', padding: '11px 18px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Create</button>
          </div>
          {msg && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, fontSize: 13, background: msg.kind === 'ok' ? '#e8f3ec' : '#fbeaea', color: msg.kind === 'ok' ? '#2c6647' : '#9a2b2b' }}>{msg.text}</div>}
        </AdminCard>

        <div style={{ height: 14 }} />
        <AdminCard title={`Transfers (${rows.length})`}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{['ID', 'ROUTE', 'LINES', 'STATUS', 'ACTIONS'].map((h) => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${D.line}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((t) => {
                const lineCount = db.list('transfer_lines', { where: { transfer_id: t.id } }).length;
                return (
                  <tr key={t.id} style={{ borderTop: `1px solid ${D.line}` }}>
                    <td style={{ padding: '8px 12px', fontFamily: D.mono, fontSize: 12 }}>{t.id}</td>
                    <td style={{ padding: '8px 12px' }}>{t.from_wh} → {t.to_wh}</td>
                    <td style={{ padding: '8px 12px' }}>{lineCount}</td>
                    <td style={{ padding: '8px 12px', color: STATUS_COLOR[t.status] || D.ink2 }}>● {t.status}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {t.status === 'draft' && <button disabled={busy === t.id} onClick={() => act(t.id, () => transfers.shipTransfer(t.id))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum }}>SHIP</button>}
                      {t.status === 'in_transit' && <button disabled={busy === t.id} onClick={() => act(t.id, () => transfers.receiveTransfer(t.id))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: '#3b8760' }}>RECEIVE</button>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={5} style={{ padding: '24px 12px', textAlign: 'center', color: D.ink3 }}>No transfers yet.</td></tr>}
            </tbody>
          </table>
        </AdminCard>
      </div>
    </AdminShell>
  );
}
