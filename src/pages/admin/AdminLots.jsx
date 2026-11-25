import { useMemo, useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { db } from '../../lib/db.js';
import { useViewport } from '../../lib/viewport.js';
import { lots as lotsApi } from '../../lib/wms/lots.js';
import { DataTable } from '../../components/ui/data-table.jsx';
import '../../styles/ui.css';

const INPUT = { padding: '12px 14px', borderRadius: 10, border: `1px solid ${D.line}`, fontFamily: 'inherit', fontSize: 14, color: D.ink, background: D.card, minWidth: 220 };

const warehouseName = (id) => db.get('warehouses', id)?.name || id || '—';

export function AdminLots() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const lots = db.useTable('lots');
  const [recallLotId, setRecallLotId] = useState('');
  const [recallResult, setRecallResult] = useState(null);
  const [recallMs, setRecallMs] = useState(null);

  // `lots` is the reactive trigger; the helper reads the same table.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const expiring = useMemo(() => lotsApi.expiringSoon(120), [lots]);

  function runRecall() {
    const lot = lots.find((row) => row.id === recallLotId);
    if (!lot) return;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const rows = lotsApi.genealogy({
      lot_id: lot.id, product_sku: lot.product_sku, lot_number: lot.lot_number,
      expiration_date: lot.expiration_date || null, owner_org_id: lot.owner_org_id || null,
    });
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    setRecallMs(Math.max(0, t1 - t0));
    setRecallResult(rows);
  }

  const live = useMemo(() => lots.filter((l) => Number(l.qty_remaining) > 0), [lots]);

  return (
    <AdminShell active="lots">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px 64px` }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: D.ink2, marginBottom: 12 }}>Operations</div>
        <h1 style={{ fontFamily: D.display, fontSize: 28, fontWeight: 600, letterSpacing: -0.4, margin: '0 0 22px' }}>Lots</h1>

        <AdminCard title="Trace a lot">
          <div style={{ color: D.ink2, fontSize: 13, marginBottom: 12 }}>See every order and customer that received a lot. Recall cases are managed outside this app.</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={recallLotId} onChange={(e) => setRecallLotId(e.target.value)} style={INPUT}>
              <option value="">Choose a lot…</option>
              {lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.product_sku} · {lot.lot_number} · {lot.expiration_date || 'N/A'} · {lot.owner_org_id || 'Unite'}</option>)}
            </select>
            <button onClick={runRecall} style={{ background: D.terra, color: D.paper, border: 'none', padding: '12px 20px', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Trace lot</button>
            {recallMs != null && <span style={{ fontFamily: D.mono, fontSize: 12, color: recallMs < 1000 ? '#3b8760' : D.terra }}>{recallResult?.length || 0} customer(s) · {recallMs.toFixed(1)}ms</span>}
          </div>
          {recallResult && recallResult.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 14 }}>
              <thead><tr style={{ fontSize: 12, fontWeight: 600, color: D.ink2 }}>{['Order', 'Customer', 'SKU', 'Quantity', 'Shipped'].map((h) => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${D.line}` }}>{h}</th>)}</tr></thead>
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
          <div className="ui-root font-sans text-sm text-ink"><DataTable label="Expiring lots" rows={expiring} searchPlaceholder="Search SKU or lot" defaultSort={{ id: 'exp', dir: 'asc' }}
            filters={[{ id: 'wh', label: 'Warehouse', value: (l) => warehouseName(l.warehouse_id) }]}
            empty={<p className="p-6 text-ink-3">Nothing expiring soon.</p>}
            columns={[
              { id: 'sku', header: 'SKU', accessor: 'product_sku', className: 'font-mono text-xs' },
              { id: 'lot', header: 'Lot', accessor: 'lot_number', className: 'font-mono text-xs' },
              { id: 'wh', header: 'Warehouse', sortValue: (l) => warehouseName(l.warehouse_id), cell: (l) => warehouseName(l.warehouse_id) },
              { id: 'exp', header: 'Expires', accessor: 'expiration_date', cell: (l) => <span className="text-warn">{l.expiration_date}</span> },
              { id: 'left', header: 'Remaining', align: 'right', sortValue: (l) => Number(l.qty_remaining) },
            ]} /></div>
        </AdminCard>

        <div style={{ height: 14 }} />

        <AdminCard title={`Active lots (${live.length})`}>
          <div className="ui-root font-sans text-sm text-ink"><DataTable label="Lots" rows={live} searchPlaceholder="Search SKU or lot" defaultSort={{ id: 'exp', dir: 'asc' }}
            tabs={[{ id: 'all', label: 'All' }, { id: 'exp', label: 'Has expiry', filter: (l) => Boolean(l.expiration_date) }, { id: 'noexp', label: 'No expiry recorded', filter: (l) => !l.expiration_date }]}
            filters={[{ id: 'wh', label: 'Warehouse', value: (l) => warehouseName(l.warehouse_id) }]}
            empty={<p className="p-6 text-ink-3">No lots yet. Lots appear here after a purchase order is received with lot numbers and expiry dates.</p>}
            columns={[
              { id: 'sku', header: 'SKU', accessor: 'product_sku', className: 'font-mono text-xs' },
              { id: 'lot', header: 'Lot', accessor: 'lot_number', className: 'font-mono text-xs' },
              { id: 'wh', header: 'Warehouse', sortValue: (l) => warehouseName(l.warehouse_id), cell: (l) => warehouseName(l.warehouse_id) },
              { id: 'exp', header: 'Expires', accessor: 'expiration_date', cell: (l) => l.expiration_date || '—' },
              { id: 'recv', header: 'Received', align: 'right', sortValue: (l) => Number(l.qty_received) },
              { id: 'left', header: 'Remaining', align: 'right', sortValue: (l) => Number(l.qty_remaining) },
            ]} /></div>
        </AdminCard>
      </div>
    </AdminShell>
  );
}
