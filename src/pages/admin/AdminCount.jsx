import { useMemo, useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { db } from '../../lib/db.js';
import { useViewport } from '../../lib/viewport.js';
import { auth } from '../../lib/auth.js';
import { counts } from '../../lib/wms/counts.js';
import { adjustments } from '../../lib/wms/adjustments.js';
import { wmsCan } from '../../lib/wms/access.js';

const INPUT = { padding: '10px 12px', borderRadius: 8, border: `1px solid ${D.line}`, fontFamily: D.sans, fontSize: 14, color: D.ink, background: D.card };

export function AdminCount() {
  const { isMobile } = useViewport();
  const session = auth.use();
  const canAdjust = wmsCan('adjust', session);
  const padX = isMobile ? 18 : 40;
  const sessions = db.useTable('count_sessions', { orderBy: 'started_at', dir: 'desc' });
  const [warehouse, setWarehouse] = useState('wh_atl');
  const [sessionId, setSessionId] = useState('');
  const [msg, setMsg] = useState(null);
  const [adj, setAdj] = useState({ sku: '', qty: '', reason: 'adjust_damage' });

  const lines = db.useTable('count_lines', sessionId ? { where: { session_id: sessionId } } : { where: { session_id: '__none__' } });
  const openSessions = useMemo(() => sessions.filter((s) => s.status === 'open'), [sessions]);

  function open() {
    const skuCount = 12; // demo: count the first N skus in the warehouse
    const skus = db.list('inventory', { where: { warehouse_id: warehouse } }).slice(0, skuCount).map((r) => r.sku);
    const res = counts.openCount({ warehouse_id: warehouse, skus });
    if (res.ok) { setSessionId(res.session_id); setMsg({ kind: 'ok', text: `Opened count ${res.session_id} (${res.lines} lines).` }); }
  }
  function setCounted(sku, v) { counts.recordCount(sessionId, sku, Number(v)); }
  function post() {
    const res = counts.postCount(sessionId);
    setMsg({ kind: 'ok', text: `Posted ${res.posted} variance movement(s), net ${res.net_variance >= 0 ? '+' : ''}${res.net_variance} units.` });
    setSessionId('');
  }
  function postAdjustment() {
    if (!canAdjust) { setMsg({ kind: 'err', text: 'Your role cannot post adjustments (manager+).' }); return; }
    const qty = Number(adj.qty);
    if (!adj.sku || !(qty > 0)) { setMsg({ kind: 'err', text: 'SKU and a positive qty required.' }); return; }
    const res = adjustments.adjust({ sku: adj.sku, warehouse_id: warehouse, qty_delta: qty, reason: adj.reason, note: 'Admin adjustment' });
    setMsg(res.ok ? { kind: 'ok', text: `Adjusted ${adj.sku} (${adj.reason}).` } : { kind: 'err', text: res.reason });
    setAdj({ sku: '', qty: '', reason: 'adjust_damage' });
  }

  return (
    <AdminShell active="inventory">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px 64px`, maxWidth: 920, margin: '0 auto' }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>OPS · CYCLE COUNT</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, margin: '0 0 22px' }}>Count.</h1>

        <AdminCard title="Start / resume a count">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} style={INPUT}>
              <option value="wh_atl">Atlanta (wh_atl)</option>
              <option value="wh_reno">Reno (wh_reno)</option>
            </select>
            <button onClick={open} style={{ background: D.plum, color: D.paper, border: 'none', padding: '11px 18px', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Open new count</button>
            {openSessions.length > 0 && (
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} style={INPUT}>
                <option value="">— resume open session —</option>
                {openSessions.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.warehouse_id}</option>)}
              </select>
            )}
          </div>
          {msg && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, fontSize: 13, background: msg.kind === 'ok' ? '#e8f3ec' : '#fbeaea', color: msg.kind === 'ok' ? '#2c6647' : '#9a2b2b' }}>{msg.text}</div>}
        </AdminCard>

        {sessionId && lines.length > 0 && (
          <>
            <div style={{ height: 14 }} />
            <AdminCard title={`Count sheet · ${sessionId}`}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{['SKU', 'SYSTEM', 'COUNTED', 'VARIANCE'].map((h) => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${D.line}` }}>{h}</th>)}</tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} style={{ borderTop: `1px solid ${D.line}` }}>
                      <td style={{ padding: '8px 12px', fontFamily: D.mono, fontSize: 12 }}>{l.sku}</td>
                      <td style={{ padding: '8px 12px', fontFamily: D.mono }}>{l.system_qty}</td>
                      <td style={{ padding: '8px 12px' }}><input type="number" defaultValue={l.counted_qty ?? ''} onBlur={(e) => setCounted(l.sku, e.target.value)} placeholder="—" style={{ ...INPUT, width: 90, padding: '6px 8px' }} /></td>
                      <td style={{ padding: '8px 12px', fontFamily: D.mono, color: (l.variance || 0) === 0 ? D.ink3 : (l.variance || 0) > 0 ? '#3b8760' : D.terra }}>{l.variance == null ? '—' : (l.variance > 0 ? `+${l.variance}` : l.variance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={post} style={{ marginTop: 16, background: D.plum, color: D.paper, border: 'none', padding: '12px 20px', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Post variances → ledger</button>
            </AdminCard>
          </>
        )}

        <div style={{ height: 14 }} />
        <AdminCard title="Quick adjustment (damage / loss / found)">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={adj.sku} onChange={(e) => setAdj({ ...adj, sku: e.target.value.trim() })} placeholder="SKU" style={{ ...INPUT, fontFamily: D.mono }} />
            <input type="number" value={adj.qty} onChange={(e) => setAdj({ ...adj, qty: e.target.value })} placeholder="Qty" style={{ ...INPUT, width: 100 }} />
            <select value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} style={INPUT}>
              <option value="adjust_damage">Damage (−)</option>
              <option value="adjust_loss">Loss (−)</option>
              <option value="found">Found (+)</option>
            </select>
            <button onClick={postAdjustment} disabled={!canAdjust} title={canAdjust ? '' : 'Manager role required'} style={{ background: canAdjust ? D.ink : D.ink3, color: D.paper, border: 'none', padding: '11px 18px', borderRadius: 4, cursor: canAdjust ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>Post adjustment</button>
          </div>
        </AdminCard>
      </div>
    </AdminShell>
  );
}
