import { useMemo, useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { db } from '../../lib/db.js';
import { useViewport } from '../../lib/viewport.js';
import { lots as lotsApi } from '../../lib/wms/lots.js';

const INPUT = { padding: '12px 14px', borderRadius: 10, border: `1px solid ${D.line}`, fontFamily: D.mono, fontSize: 14, color: D.ink, background: D.card, minWidth: 220 };

export function AdminLots() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const lots = db.useTable('lots');
  const [recallLot, setRecallLot] = useState('');
  const [recallResult, setRecallResult] = useState(null);
  const [recallMs, setRecallMs] = useState(null);

  // `lots` is the reactive trigger; the helper reads the same table.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const expiring = useMemo(() => lotsApi.expiringSoon(120), [lots]);

  function runRecall() {
    const lot = recallLot.trim();
    if (!lot) return;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const rows = lotsApi.genealogy(lot);
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    setRecallMs(Math.max(0, t1 - t0));
    setRecallResult(rows);
  }

  const live = useMemo(() => lots.filter((l) => Number(l.qty_remaining) > 0), [lots]);

  return (
    <AdminShell active="inventory">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px 64px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>OPS · LOTS & RECALL</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, margin: '0 0 22px' }}>Lots.</h1>

        <AdminCard title="Recall lookup — every customer who received a lot">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={recallLot} onChange={(e) => setRecallLot(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runRecall()} placeholder="Lot number…" style={INPUT} />
            <button onClick={runRecall} style={{ background: D.terra, color: D.paper, border: 'none', padding: '12px 20px', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Run recall</button>
            {recallMs != null && <span style={{ fontFamily: D.mono, fontSize: 12, color: recallMs < 1000 ? '#3b8760' : D.terra }}>{recallResult?.length || 0} customer(s) · {recallMs.toFixed(1)}ms {recallMs < 1000 ? '✓ < 1s SLA' : ''}</span>}
          </div>
          {recallResult && recallResult.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 14 }}>
              <thead><tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{['ORDER', 'CUSTOMER', 'SKU', 'QTY', 'SHIPPED'].map((h) => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${D.line}` }}>{h}</th>)}</tr></thead>
              <tbody>
                {recallResult.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${D.line}` }}>
                    <td style={{ padding: '8px 12px', fontFamily: D.mono, fontSize: 12 }}>{r.order_id}</td>
                    <td style={{ padding: '8px 12px' }}>{db.get('organizations', r.customer_id)?.name || r.customer_id || '—'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: D.mono, fontSize: 12 }}>{r.product_sku}</td>
                    <td style={{ padding: '8px 12px' }}>{r.qty}</td>
                    <td style={{ padding: '8px 12px', color: D.ink2 }}>{r.shipped_at ? new Date(r.shipped_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {recallResult && recallResult.length === 0 && <div style={{ marginTop: 12, color: D.ink3, fontSize: 13 }}>No shipments recorded for that lot.</div>}
        </AdminCard>

        <div style={{ height: 14 }} />

        <AdminCard title={`Expiring within 120 days (${expiring.length})`}>
          {expiring.length === 0 ? <div style={{ color: D.ink3, fontSize: 13 }}>Nothing expiring soon.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{['SKU', 'LOT', 'WAREHOUSE', 'EXPIRES', 'REMAINING'].map((h) => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${D.line}` }}>{h}</th>)}</tr></thead>
              <tbody>
                {expiring.map((l) => (
                  <tr key={l.id} style={{ borderTop: `1px solid ${D.line}` }}>
                    <td style={{ padding: '8px 12px', fontFamily: D.mono, fontSize: 12 }}>{l.product_sku}</td>
                    <td style={{ padding: '8px 12px', fontFamily: D.mono, fontSize: 12 }}>{l.lot_number}</td>
                    <td style={{ padding: '8px 12px' }}>{l.warehouse_id}</td>
                    <td style={{ padding: '8px 12px', color: D.terra }}>{l.expiration_date}</td>
                    <td style={{ padding: '8px 12px', fontFamily: D.mono }}>{l.qty_remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminCard>

        <div style={{ height: 14 }} />

        <AdminCard title={`Active lots (${live.length})`}>
          {live.length === 0 ? <div style={{ color: D.ink3, fontSize: 13 }}>No lots received yet — receive a PO with lot + expiry on the receiving workstation.</div> : (
            <div className="um-scroll-x">
              <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{['SKU', 'LOT', 'WH', 'EXPIRES', 'RECEIVED', 'REMAINING'].map((h) => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${D.line}` }}>{h}</th>)}</tr></thead>
                <tbody>
                  {live.map((l) => (
                    <tr key={l.id} style={{ borderTop: `1px solid ${D.line}` }}>
                      <td style={{ padding: '8px 12px', fontFamily: D.mono, fontSize: 12 }}>{l.product_sku}</td>
                      <td style={{ padding: '8px 12px', fontFamily: D.mono, fontSize: 12 }}>{l.lot_number}</td>
                      <td style={{ padding: '8px 12px' }}>{l.warehouse_id}</td>
                      <td style={{ padding: '8px 12px', color: D.ink2 }}>{l.expiration_date || '—'}</td>
                      <td style={{ padding: '8px 12px', fontFamily: D.mono }}>{l.qty_received}</td>
                      <td style={{ padding: '8px 12px', fontFamily: D.mono }}>{l.qty_remaining}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </div>
    </AdminShell>
  );
}
