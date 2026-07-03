/**
 * Admin · Fulfillment — PRD-24.
 *
 * The zero-touch order orchestrator made observable. Pick an order, run
 * the full pipeline (validate → reserve → payment → invoice → shipping →
 * packing slip → notify → delivered), and watch each step resolve with
 * its retry/circuit-breaker state. Backorders + the live circuit-breaker
 * panel surface where the chain is degraded.
 */

import { useMemo, useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { useViewport } from '../../lib/viewport.js';
import { runFulfillment, PIPELINE_STEPS, breakerStatus } from '../../lib/fulfillment.js';

const STEP_CHIP = {
  pending:    [D.ink3, '○'],
  processing: ['#9a7b1e', '◐'],
  completed:  ['#2d6a4f', '●'],
  failed:     ['#c3382d', '✕'],
};

export function AdminFulfillment() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const orders = db.useTable('orders', { orderBy: 'placed_at', dir: 'desc' });
  const pipeline = db.useTable('fulfillment_pipeline');
  const backorders = db.useTable('backorders', { orderBy: 'created_at', dir: 'desc' });
  const [busy, setBusy] = useState(null);
  const [selected, setSelected] = useState(null);
  const [log, setLog] = useState([]);

  const breakers = breakerStatus();

  const stepsByOrder = useMemo(() => {
    const m = new Map();
    for (const s of pipeline) {
      if (!m.has(s.order_id)) m.set(s.order_id, {});
      m.get(s.order_id)[s.step] = s;
    }
    return m;
  }, [pipeline]);

  async function handleRun(orderId) {
    setBusy(orderId);
    setSelected(orderId);
    setLog([]);
    try {
      await runFulfillment(orderId, { onProgress: (p) => setLog((l) => [...l, p]) });
    } catch (err) {
      setLog((l) => [...l, { step: 'error', status: 'failed', label: err.message }]);
    }
    setBusy(null);
  }

  const btn = (primary) => ({
    padding: '7px 14px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: primary ? 'none' : `1.5px solid ${D.ink}`,
    background: primary ? D.plum : 'transparent', color: primary ? D.paper : D.ink,
  });

  function progress(orderId) {
    const steps = stepsByOrder.get(orderId) || {};
    const done = PIPELINE_STEPS.filter((s) => steps[s]?.status === 'completed').length;
    return { done, total: PIPELINE_STEPS.length };
  }

  return (
    <AdminShell active="fulfillment">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>ORDERS · ORCHESTRATOR</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>Fulfillment</h1>
        <div style={{ marginTop: 10, fontSize: 13, color: D.ink2, maxWidth: 680 }}>
          Enter data once, sync everywhere — made resilient. Each step retries with backoff and trips a circuit breaker
          if an integration is unhealthy, so one bad dependency never kills the order.
        </div>
      </div>

      <div style={{ padding: isMobile ? 20 : 32 }}>
        {/* Circuit breakers */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {breakers.length === 0 && <div style={{ fontSize: 12, color: D.ink3 }}>All integration circuits closed (healthy).</div>}
          {breakers.map((b) => (
            <span key={b.integration} style={{ fontFamily: D.mono, fontSize: 11, padding: '4px 10px', borderRadius: 4, background: b.open ? 'rgba(195,56,45,.12)' : 'rgba(45,106,79,.12)', color: b.open ? '#c3382d' : '#2d6a4f' }}>
              {b.integration}: {b.open ? 'OPEN' : 'closed'} ({b.recent_failures})
            </span>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 20 }}>
          {/* Orders + pipeline */}
          <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                  {['ORDER', 'CUSTOMER', 'STATUS', 'PIPELINE', ''].map((h) => <th key={h} style={{ padding: 12 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 40).map((o) => {
                  const { done, total } = progress(o.id);
                  const steps = stepsByOrder.get(o.id) || {};
                  return (
                    <tr key={o.id} style={{ borderTop: `1px solid ${D.line}`, background: selected === o.id ? 'rgba(29,92,77,.05)' : 'transparent', cursor: 'pointer' }} onClick={() => setSelected(o.id)}>
                      <td style={{ padding: 12, fontFamily: D.mono, fontSize: 12 }}>{o.id}</td>
                      <td style={{ padding: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name}</td>
                      <td style={{ padding: 12, color: D.ink2 }}>{o.status}</td>
                      <td style={{ padding: 12 }}>
                        <span style={{ display: 'inline-flex', gap: 3 }}>
                          {PIPELINE_STEPS.map((s) => {
                            const [color, glyph] = STEP_CHIP[steps[s]?.status || 'pending'];
                            return <span key={s} title={`${s}: ${steps[s]?.status || 'pending'}`} style={{ color, fontSize: 13 }}>{glyph}</span>;
                          })}
                        </span>
                        <span style={{ marginLeft: 8, fontSize: 11, color: D.ink3 }}>{done}/{total}</span>
                      </td>
                      <td style={{ padding: 12 }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleRun(o.id); }} disabled={busy === o.id} style={btn(true)}>
                          {busy === o.id ? 'Running…' : (done > 0 ? 'Re-run' : 'Run')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 && <tr><td colSpan={5} style={{ padding: 24, color: D.ink3 }}>No orders yet.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Detail / live log */}
          <div>
            <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>PIPELINE DETAIL</div>
              {!selected && <div style={{ fontSize: 13, color: D.ink3, marginTop: 10 }}>Select an order to inspect its steps.</div>}
              {selected && (
                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                  {PIPELINE_STEPS.map((s) => {
                    const row = (stepsByOrder.get(selected) || {})[s];
                    const [color, glyph] = STEP_CHIP[row?.status || 'pending'];
                    return (
                      <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                        <span style={{ color, width: 16 }}>{glyph}</span>
                        <span style={{ fontFamily: D.mono, fontSize: 12, width: 110 }}>{s}</span>
                        <span style={{ color: D.ink3, fontSize: 12 }}>
                          {row ? `${row.status}${row.attempt_count ? ` · ${row.attempt_count} try` : ''}` : 'pending'}
                          {row?.error_message ? ` · ${row.error_message}` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {log.length > 0 && (
                <div style={{ marginTop: 14, padding: 12, background: D.paperAlt, borderRadius: 8, fontFamily: D.mono, fontSize: 11, color: D.ink2, maxHeight: 160, overflow: 'auto' }}>
                  {log.map((l, i) => <div key={i}>{l.label}</div>)}
                </div>
              )}
            </div>

            {/* Backorders */}
            <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18, marginTop: 20 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>BACKORDERS</div>
              {backorders.length === 0 && <div style={{ fontSize: 13, color: D.ink3, marginTop: 10 }}>No backorders — all lines reserved from stock.</div>}
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {backorders.slice(0, 12).map((bo) => (
                  <div key={bo.id} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{bo.product_name || bo.sku} ×{bo.quantity}</span>
                    <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '2px 8px', borderRadius: 4, background: bo.status === 'shipped' ? 'rgba(45,106,79,.12)' : 'rgba(154,123,30,.14)', color: bo.status === 'shipped' ? '#2d6a4f' : '#9a7b1e' }}>{(bo.status || 'pending').toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
