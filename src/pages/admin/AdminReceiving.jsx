import { useMemo, useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { db } from '../../lib/db.js';
import { useViewport } from '../../lib/viewport.js';
import { auth } from '../../lib/auth.js';
import { purchaseOrders } from '../../lib/wms/purchaseOrders.js';
import { lots as lotsApi } from '../../lib/wms/lots.js';
import { wmsCan } from '../../lib/wms/access.js';

const INPUT = { padding: '12px 14px', borderRadius: 10, border: `1px solid ${D.line}`, fontFamily: D.sans, fontSize: 15, color: D.ink, background: D.card, width: '100%', boxSizing: 'border-box' };
const LABEL = { fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginBottom: 6, display: 'block' };

/** Receiving workstation — mobile/tablet, barcode-first (camera or USB wedge). */
export function AdminReceiving() {
  const { isMobile } = useViewport();
  const session = auth.use();
  const canReceive = wmsCan('receive', session);
  const padX = isMobile ? 16 : 40;
  const pos = db.useTable('purchase_orders');
  const openPos = useMemo(() => pos.filter((p) => p.status === 'sent' || p.status === 'partial'), [pos]);

  const [poId, setPoId] = useState('');
  const [scan, setScan] = useState({ sku: '', lot_number: '', expiration_date: '', qty: '' });
  const [warehouse, setWarehouse] = useState('wh_atl');
  const [queue, setQueue] = useState([]); // staged receipts
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const po = poId ? db.get('purchase_orders', poId) : null;

  function addToQueue() {
    const qty = Number(scan.qty);
    if (!scan.sku || !(qty > 0)) { setMsg({ kind: 'err', text: 'SKU and a positive qty are required.' }); return; }
    if (po && !po.line_items?.some((l) => l.sku === scan.sku)) { setMsg({ kind: 'err', text: `${scan.sku} is not on PO ${po.id} (use blind receipt).` }); return; }
    setQueue((q) => [...q, { ...scan, qty }]);
    setScan({ sku: '', lot_number: '', expiration_date: '', qty: '' });
    setMsg(null);
  }

  async function post() {
    if (queue.length === 0) return;
    if (!canReceive) { setMsg({ kind: 'err', text: 'Your role cannot post receipts.' }); return; }
    setBusy(true);
    try {
      if (po) {
        const res = await purchaseOrders.receive(po.id, queue, { warehouse_id: warehouse, received_by: 'workstation' });
        setMsg({ kind: 'ok', text: `Received ${res.received} unit(s) against ${po.id}. PO is now ${res.status}.` });
      } else {
        let units = 0;
        for (const r of queue) {
          lotsApi.receiveLot({ sku: r.sku, lot_number: r.lot_number, expiration_date: r.expiration_date || null, warehouse_id: warehouse, qty: Number(r.qty), received_by: 'workstation', ref_type: 'manual', ref_id: 'blind_receipt' });
          units += Number(r.qty);
        }
        setMsg({ kind: 'ok', text: `Blind receipt complete — ${units} unit(s) into ${warehouse}.` });
      }
      setQueue([]);
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Receive failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell active="inventory">
      <div style={{ padding: `${isMobile ? 24 : 40}px ${padX}px 64px`, maxWidth: 880, margin: '0 auto' }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>OPS · RECEIVING WORKSTATION</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 400, letterSpacing: -1.2, margin: '0 0 20px' }}>Receive.</h1>

        <AdminCard title="01 · Against which order?">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 200px', gap: 12 }}>
            <div>
              <label style={LABEL}>OPEN PURCHASE ORDER</label>
              <select value={poId} onChange={(e) => setPoId(e.target.value)} style={INPUT}>
                <option value="">— Blind receipt (no PO) —</option>
                {openPos.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vendor_name} ({p.status})</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>WAREHOUSE</label>
              <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} style={INPUT}>
                <option value="wh_atl">Atlanta (wh_atl)</option>
                <option value="wh_reno">Reno (wh_reno)</option>
              </select>
            </div>
          </div>
          {po && (
            <div style={{ marginTop: 14, fontSize: 13, color: D.ink2 }}>
              {po.line_items?.map((l) => (
                <div key={l.sku} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${D.line}` }}>
                  <span style={{ fontFamily: D.mono, fontSize: 12 }}>{l.sku}</span>
                  <span>{(Number(l.received_qty) || 0)}/{l.qty} received</span>
                </div>
              ))}
            </div>
          )}
        </AdminCard>

        <div style={{ height: 14 }} />

        <AdminCard title="02 · Scan items">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
            <div><label style={LABEL}>SKU / SCAN</label><input autoFocus value={scan.sku} onChange={(e) => setScan({ ...scan, sku: e.target.value.trim() })} placeholder="SKU…" style={INPUT} /></div>
            <div><label style={LABEL}>LOT #</label><input value={scan.lot_number} onChange={(e) => setScan({ ...scan, lot_number: e.target.value.trim() })} placeholder="Lot…" style={INPUT} /></div>
            <div><label style={LABEL}>EXPIRES</label><input type="date" value={scan.expiration_date} onChange={(e) => setScan({ ...scan, expiration_date: e.target.value })} style={INPUT} /></div>
            <div><label style={LABEL}>QTY</label><input type="number" inputMode="numeric" value={scan.qty} onChange={(e) => setScan({ ...scan, qty: e.target.value })} placeholder="0" style={INPUT} /></div>
          </div>
          <button onClick={addToQueue} style={{ marginTop: 14, background: D.ink, color: D.paper, border: 'none', padding: '12px 20px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Add to receipt</button>
          {msg && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, fontSize: 13, background: msg.kind === 'ok' ? '#e8f3ec' : '#fbeaea', color: msg.kind === 'ok' ? '#2c6647' : '#9a2b2b' }}>{msg.text}</div>}
        </AdminCard>

        {queue.length > 0 && (
          <>
            <div style={{ height: 14 }} />
            <AdminCard title={`03 · Staged (${queue.length})`}>
              {queue.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, fontSize: 13 }}>
                  <span style={{ fontFamily: D.mono, fontSize: 12 }}>{r.sku}{r.lot_number ? ` · lot ${r.lot_number}` : ''}{r.expiration_date ? ` · exp ${r.expiration_date}` : ''}</span>
                  <span>× {r.qty}</span>
                </div>
              ))}
              <button onClick={post} disabled={busy || !canReceive} title={canReceive ? '' : 'Insufficient role'} style={{ marginTop: 16, width: '100%', background: canReceive ? D.plum : D.ink3, color: D.paper, border: 'none', padding: 14, borderRadius: 999, cursor: busy ? 'wait' : canReceive ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: 600 }}>
                {busy ? 'Posting…' : `Post receipt → ledger (${queue.reduce((a, r) => a + Number(r.qty), 0)} units)`}
              </button>
            </AdminCard>
          </>
        )}
      </div>
    </AdminShell>
  );
}
