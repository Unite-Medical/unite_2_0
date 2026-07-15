import { useMemo, useRef, useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { db } from '../../lib/db.js';
import { useViewport } from '../../lib/viewport.js';
import { auth } from '../../lib/auth.js';
import { receiving } from '../../lib/wms/receiving.js';
import { wmsCan } from '../../lib/wms/access.js';

const INPUT = { padding: '12px 14px', borderRadius: 10, border: `1px solid ${D.line}`, fontFamily: D.sans, fontSize: 15, color: D.ink, background: D.card, width: '100%', boxSizing: 'border-box' };
const LABEL = { fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginBottom: 6, display: 'block' };

const STATE_COLOR = { exact: '#3b8760', short: D.terra || '#b8553a', over: '#b8a04a', unexpected: '#9a2b2b' };

/** Receiving workstation — scan a carton UPC/GTIN, it resolves to a product and
 *  posts the receipt to the ledger. Live PO reconciliation (ordered vs received). */
export function AdminReceiving() {
  const { isMobile } = useViewport();
  const session = auth.use();
  const canReceive = wmsCan('receive', session);
  const padX = isMobile ? 16 : 40;
  const pos = db.useTable('purchase_orders');
  // Subscribe to the ledger so the reconciliation panel re-renders on every receipt.
  const movements = db.useTable('stock_movements');
  const openPos = useMemo(() => pos.filter((p) => p.status === 'sent' || p.status === 'partial'), [pos]);

  const [poId, setPoId] = useState('');
  const [scanText, setScanText] = useState('');
  const [scanQty, setScanQty] = useState('1');
  const [pending, setPending] = useState(null); // resolved-but-unconfirmed scan
  const [warehouse, setWarehouse] = useState('wh_atl');
  const [queue, setQueue] = useState([]); // staged, resolved receipts
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const scanRef = useRef(null);

  const po = poId ? db.get('purchase_orders', poId) : null;

  // Live reconciliation for the selected PO. Recomputes whenever the ledger
  // (stock_movements) changes — reconcilePO reads the ledger for received truth.
  const recon = useMemo(() => {
    void movements.length; // ledger dependency: re-run when a receipt posts
    return poId ? receiving.reconcilePO(poId) : null;
  }, [poId, movements]);

  /** A scan landed (Enter from the wedge, or the Resolve button). */
  function handleScan() {
    const raw = scanText.trim();
    if (!raw) return;
    const r = receiving.resolveScan(raw);
    if (!r.matched && r.capture_method !== 'sku') {
      setMsg({ kind: 'err', text: `No product matches ${r.capture_method === 'upc' ? 'UPC' : 'barcode'} ${raw} (${r.reason}). Check the catalog UPC or use a blind SKU.` });
      setPending(null);
      return;
    }
    if (po && r.sku && !po.line_items?.some((l) => l.sku === r.sku)) {
      setMsg({ kind: 'err', text: `${r.sku}${r.product ? ` (${r.product.name})` : ''} is not on PO ${po.id}. Switch to blind receipt to take it in.` });
      setPending(null);
      return;
    }
    setPending(r);
    setMsg(r.matched
      ? { kind: 'ok', text: `Matched ${r.sku} · ${r.product?.name || ''}${r.lot_number ? ` · lot ${r.lot_number}` : ''}${r.expiration_date ? ` · exp ${r.expiration_date}` : ''} — set qty and add.` }
      : { kind: 'warn', text: `Unknown code — will receive as raw SKU "${r.sku}" (blind).` });
  }

  function addToQueue() {
    if (!pending) { handleScan(); return; }
    const qty = Number(scanQty);
    if (!(qty > 0)) { setMsg({ kind: 'err', text: 'Enter a positive quantity.' }); return; }
    setQueue((q) => [...q, {
      sku: pending.sku,
      name: pending.product?.name || pending.sku,
      qty,
      lot_number: pending.lot_number || '',
      expiration_date: pending.expiration_date || '',
      capture_method: pending.capture_method,
      resolution: pending,
    }]);
    setPending(null);
    setScanText('');
    setScanQty('1');
    setMsg(null);
    if (scanRef.current) scanRef.current.focus();
  }

  function removeLine(i) { setQueue((q) => q.filter((_, idx) => idx !== i)); }

  async function post() {
    if (queue.length === 0) return;
    if (!canReceive) { setMsg({ kind: 'err', text: 'Your role cannot post receipts.' }); return; }
    setBusy(true);
    try {
      const res = await receiving.receiveScans(queue, { po_id: poId || null, warehouse_id: warehouse, received_by: session?.email || 'workstation' });
      if (!res.ok) { setMsg({ kind: 'err', text: `Receive failed: ${res.reason}` }); return; }
      setMsg({ kind: 'ok', text: res.mode === 'po'
        ? `Received ${res.received} unit(s) against ${poId}. PO is now ${res.po_status}. ${res.events} scan(s) logged.`
        : `Blind receipt complete — ${res.received} unit(s) into ${warehouse}. ${res.events} scan(s) logged.` });
      setQueue([]);
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Receive failed.' });
    } finally {
      setBusy(false);
    }
  }

  const msgBg = { ok: '#e8f3ec', warn: '#fbf3e2', err: '#fbeaea' };
  const msgFg = { ok: '#2c6647', warn: '#8a6d1f', err: '#9a2b2b' };

  return (
    <AdminShell active="receiving">
      <div style={{ padding: `${isMobile ? 24 : 40}px ${padX}px 64px`, maxWidth: 940, margin: '0 auto' }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>OPS · RECEIVING WORKSTATION</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 400, letterSpacing: -1.2, margin: '0 0 20px' }}>Receive.</h1>

        <AdminCard title="01 · Against which order?">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 200px', gap: 12 }}>
            <div>
              <label style={LABEL}>OPEN PURCHASE ORDER</label>
              <select value={poId} onChange={(e) => { setPoId(e.target.value); setPending(null); }} style={INPUT}>
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
        </AdminCard>

        <div style={{ height: 14 }} />

        <AdminCard title="02 · Scan a carton">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 120px 120px', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={LABEL}>SCAN UPC / GTIN / BARCODE</label>
              <input
                ref={scanRef}
                autoFocus
                value={scanText}
                onChange={(e) => { setScanText(e.target.value); setPending(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleScan(); } }}
                placeholder="Scan or type a UPC / barcode…"
                style={INPUT}
              />
            </div>
            <div>
              <label style={LABEL}>QTY</label>
              <input type="number" inputMode="numeric" value={scanQty} onChange={(e) => setScanQty(e.target.value)} placeholder="0" style={INPUT} />
            </div>
            <button onClick={addToQueue} style={{ background: D.ink, color: D.paper, border: 'none', padding: '12px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              {pending ? 'Add to receipt' : 'Resolve'}
            </button>
          </div>
          {pending && (
            <div style={{ marginTop: 12, fontSize: 13, color: D.ink2, fontFamily: D.mono }}>
              → {pending.capture_method.toUpperCase()} · {pending.sku}{pending.gtin ? ` · GTIN ${pending.gtin}` : ''}
            </div>
          )}
          {msg && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, fontSize: 13, background: msgBg[msg.kind], color: msgFg[msg.kind] }}>{msg.text}</div>}
          <div style={{ marginTop: 10, fontSize: 12, color: D.ink3, lineHeight: 1.5 }}>
            A USB barcode scanner types the code and hits Enter automatically. GS1/UDI 2D codes also fill lot + expiration.
          </div>
        </AdminCard>

        {queue.length > 0 && (
          <>
            <div style={{ height: 14 }} />
            <AdminCard title={`03 · Staged (${queue.length})`}>
              {queue.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, fontSize: 13 }}>
                  <span style={{ fontFamily: D.mono, fontSize: 12 }}>{r.sku}{r.name && r.name !== r.sku ? ` · ${r.name}` : ''}{r.lot_number ? ` · lot ${r.lot_number}` : ''}{r.expiration_date ? ` · exp ${r.expiration_date}` : ''}</span>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span>× {r.qty}</span>
                    <button onClick={() => removeLine(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: D.ink3, fontFamily: D.mono, fontSize: 11 }}>REMOVE</button>
                  </span>
                </div>
              ))}
              <button onClick={post} disabled={busy || !canReceive} title={canReceive ? '' : 'Insufficient role'} style={{ marginTop: 16, width: '100%', background: canReceive ? D.plum : D.ink3, color: D.paper, border: 'none', padding: 14, borderRadius: 4, cursor: busy ? 'wait' : canReceive ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: 600 }}>
                {busy ? 'Posting…' : `Post receipt → ledger (${queue.reduce((a, r) => a + Number(r.qty), 0)} units)`}
              </button>
            </AdminCard>
          </>
        )}

        {po && recon && recon.ok && (
          <>
            <div style={{ height: 14 }} />
            <AdminCard title={`04 · Reconcile ${po.id}`}>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
                <Stat label="ORDERED" value={recon.totals.ordered} />
                <Stat label="RECEIVED" value={recon.totals.received} />
                <Stat label="VARIANCE" value={recon.totals.variance > 0 ? `+${recon.totals.variance}` : recon.totals.variance} color={recon.totals.variance === 0 ? '#3b8760' : D.terra} />
                <div style={{ marginLeft: 'auto', alignSelf: 'center', fontFamily: D.mono, fontSize: 12, letterSpacing: 1, padding: '6px 12px', borderRadius: 4, background: recon.balanced ? '#e8f3ec' : '#fbf3e2', color: recon.balanced ? '#2c6647' : '#8a6d1f' }}>
                  {recon.balanced ? 'BALANCED ✓' : 'OPEN VARIANCE'}
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                      <th style={{ padding: '8px 12px' }}>SKU</th>
                      <th style={{ padding: '8px 12px' }}>ITEM</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>ORDERED</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>RECEIVED</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>VARIANCE</th>
                      <th style={{ padding: '8px 12px' }}>STATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recon.lines.map((l, i) => (
                      <tr key={l.sku} style={{ borderTop: i === 0 ? `1px solid ${D.line}` : `1px solid ${D.line}` }}>
                        <td style={{ padding: '10px 12px', fontFamily: D.mono, fontSize: 12 }}>{l.sku}</td>
                        <td style={{ padding: '10px 12px', color: D.ink2 }}>{l.name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: D.mono }}>{l.ordered}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: D.mono }}>{l.received}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: D.mono, color: l.variance === 0 ? D.ink2 : STATE_COLOR[l.state] }}>{l.variance > 0 ? `+${l.variance}` : l.variance}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 0.8, padding: '3px 8px', borderRadius: 3, background: `${STATE_COLOR[l.state]}22`, color: STATE_COLOR[l.state] }}>{l.state.toUpperCase()}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: D.ink3, lineHeight: 1.5 }}>
                Received counts come from the append-only stock ledger (SUM of receipt movements for this PO), not a trusted counter — this is the goods-receipt reconciliation.
              </div>
            </AdminCard>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{label}</div>
      <div style={{ fontFamily: D.display, fontSize: 28, fontWeight: 400, color: color || D.ink, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}
