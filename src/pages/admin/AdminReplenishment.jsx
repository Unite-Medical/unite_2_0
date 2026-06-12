/**
 * Admin · Replenishment — PRD-12 (run-rate model UI).
 *
 * Shows the live run-rate table per SKU (demand, cover, reorder
 * point), drafts vendor POs in one click, and lets ops simulate an
 * inbound container clearing customs to demo the full
 * "cleared → inventory → landed cost → reorder recalc" chain
 * (CTO brief success criterion #2).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';
import { computeReplenishment, draftPurchaseOrders, recalcReorderPoints, DEFAULTS } from '../../lib/replenishment.js';
import { forecast } from '../../lib/external/forecast.js';
import { simulateInboundShipment } from '../../lib/receiving.js';

const STATUS_CHIP = {
  stockout: ['#c3382d', 'STOCKOUT'],
  reorder:  [D.terra, 'REORDER'],
  watch:    ['#9a7b1e', 'WATCH'],
  ok:       ['#2d6a4f', 'OK'],
};

export function AdminReplenishment() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;

  // Recompute when inventory or orders change.
  const inventory = db.useTable('inventory');
  const orders = db.useTable('orders');
  const pos = db.useTable('purchase_orders', { orderBy: 'created_at', dir: 'desc' });

  const [onlyAction, setOnlyAction] = useState(true);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [forecasts, setForecasts] = useState(null);

  // Try the Prophet sidecar on mount; null = pure run-rate math.
  useEffect(() => {
    let alive = true;
    const skus = db.list('products').map((p) => p.sku);
    forecast.getForecastMap(skus)
      .then((map) => { if (alive && Object.keys(map).length > 0) setForecasts(map); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const rows = useMemo(
    () => computeReplenishment({ forecasts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inventory, orders, forecasts],
  );
  const prophetCount = rows.filter((r) => r.model === 'prophet').length;
  const actionable = rows.filter((r) => r.status === 'stockout' || r.status === 'reorder');
  const visible = onlyAction ? rows.filter((r) => r.status !== 'ok') : rows;
  const suggestedSpend = actionable.reduce((a, r) => a + r.suggested_qty * (r.cogs || 0), 0);

  async function handleDraftPOs() {
    setBusy('po'); setNotice(null);
    try {
      const created = await draftPurchaseOrders();
      setNotice(created.length ? `${created.length} draft PO(s) created and pushed to the WMS.` : 'Nothing to reorder right now.');
    } finally { setBusy(null); }
  }

  async function handleSimulate() {
    setBusy('sim'); setNotice(null);
    try {
      const { result } = await simulateInboundShipment();
      setNotice(`Inbound container received: ${result.received} units into inventory, landed-cost bill ${result.bill?.id || 'skipped'}, ${result.reorder_rows} reorder points recalculated.`);
    } finally { setBusy(null); }
  }

  function handleRecalc() {
    const n = recalcReorderPoints();
    setNotice(`${n} warehouse reorder points recalculated from the trailing ${DEFAULTS.window_days}-day run rate.`);
  }

  async function handleProphetRun() {
    setBusy('prophet'); setNotice(null);
    try {
      const resp = await forecast.runAll();
      if (resp.stub) {
        setNotice('Forecasting sidecar not deployed (FORECAST_API_URL unset) — table stays on the run-rate model. Deploy forecasting/ and set the env var to switch to Prophet.');
      } else {
        setNotice(`Prophet run ${resp.run_id} queued on the sidecar. Horizons refresh on the next page load.`);
      }
    } finally { setBusy(null); }
  }

  const btn = (primary) => ({
    padding: '10px 18px', borderRadius: 8, fontSize: 13, fontFamily: D.sans, cursor: 'pointer',
    background: primary ? D.plum : 'transparent', color: primary ? '#fff' : D.ink,
    border: primary ? 'none' : `1px solid ${D.line}`,
  });

  return (
    <AdminShell active="replenish">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>INVENTORY · RUN-RATE MODEL</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>Replenishment</h1>
        <div style={{ marginTop: 10, fontSize: 13, color: D.ink2, maxWidth: 640 }}>
          {prophetCount > 0
            ? <>Prophet seasonal forecasts active on {prophetCount} SKU(s) via the forecasting sidecar; remaining SKUs use the trailing {DEFAULTS.window_days}-day run rate.</>
            : <>Trailing {DEFAULTS.window_days}-day demand → reorder point at {DEFAULTS.lead_time_days}d lead time + {DEFAULTS.safety_days}d safety stock. Prophet horizons take over per-SKU as the sidecar publishes them.</>}
        </div>
      </div>

      <div style={{ padding: isMobile ? 20 : 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 14 }}>
          {[
            ['STOCKOUTS', rows.filter((r) => r.status === 'stockout').length, '#c3382d'],
            ['AT REORDER POINT', rows.filter((r) => r.status === 'reorder').length, D.terra],
            ['WATCHLIST', rows.filter((r) => r.status === 'watch').length, '#9a7b1e'],
            ['SUGGESTED PO SPEND', fmt.short(suggestedSpend), D.plum],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{label}</div>
              <div style={{ fontFamily: D.display, fontSize: 34, letterSpacing: -0.5, marginTop: 6, color }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={handleDraftPOs} disabled={busy} style={btn(true)}>{busy === 'po' ? 'Drafting…' : `Draft POs (${actionable.length} SKUs)`}</button>
          <button onClick={handleRecalc} disabled={busy} style={btn(false)}>Recalculate reorder points</button>
          <button onClick={handleSimulate} disabled={busy} style={btn(false)}>{busy === 'sim' ? 'Receiving…' : 'Simulate inbound container clearing'}</button>
          <button onClick={handleProphetRun} disabled={busy} style={btn(false)}>{busy === 'prophet' ? 'Queuing…' : 'Run Prophet forecast'}</button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: D.ink2, marginLeft: 'auto', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyAction} onChange={(e) => setOnlyAction(e.target.checked)} />
            Needs attention only
          </label>
        </div>

        {notice && (
          <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(94,41,99,.07)', border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 13 }}>{notice}</div>
        )}

        <div style={{ marginTop: 20, background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: 'left', fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                {['SKU', 'PRODUCT', 'VENDOR', 'RUN RATE /DAY', 'ON HAND', 'REORDER PT', 'DAYS COVER', 'STATUS', 'SUGGESTED QTY'].map((h) => (
                  <th key={h} style={{ padding: '12px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const [color, label] = STATUS_CHIP[r.status];
                return (
                  <tr key={r.sku} style={{ borderTop: `1px solid ${D.line}` }}>
                    <td style={{ padding: 12, fontFamily: D.mono, fontSize: 12 }}>{r.sku}</td>
                    <td style={{ padding: 12, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</td>
                    <td style={{ padding: 12, color: D.ink2 }}>{r.vendor || '—'}</td>
                    <td style={{ padding: 12 }}>
                      {r.run_rate > 0 ? r.run_rate.toFixed(2) : '—'}
                      {r.model === 'prophet' && (
                        <span title="Prophet seasonal forecast" style={{ marginLeft: 6, fontFamily: D.mono, fontSize: 8, letterSpacing: 1, padding: '2px 6px', borderRadius: 999, background: `${D.plum}18`, color: D.plum }}>PROPHET</span>
                      )}
                    </td>
                    <td style={{ padding: 12 }}>{fmt.number(r.on_hand)}</td>
                    <td style={{ padding: 12 }}>{fmt.number(r.reorder_point)}</td>
                    <td style={{ padding: 12 }}>{r.days_cover == null ? '∞' : `${r.days_cover}d`}</td>
                    <td style={{ padding: 12 }}>
                      <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: `${color}20`, color }}>{label}</span>
                    </td>
                    <td style={{ padding: 12, fontWeight: r.suggested_qty > 0 ? 600 : 400 }}>{r.suggested_qty > 0 ? fmt.number(r.suggested_qty) : '—'}</td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 24, color: D.ink3 }}>Every SKU is above its reorder point. Untick the filter to see the full table.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: D.display, fontSize: 22, letterSpacing: -0.4 }}>Draft purchase orders</div>
          <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
            {pos.length === 0 && <div style={{ fontSize: 13, color: D.ink3 }}>No draft POs yet — the model drafts one per vendor when SKUs cross their reorder point.</div>}
            {pos.map((po) => (
              <div key={po.id} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{po.vendor_name}</div>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>
                    {(po.line_items || []).length} lines · expected {fmt.date(po.expected_delivery)} · WMS ref <span style={{ fontFamily: D.mono }}>{po.wms_po_id || '—'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: D.ink3, marginTop: 4 }}>
                    {(po.line_items || []).slice(0, 4).map((l) => `${l.qty}× ${l.sku}`).join(' · ')}{(po.line_items || []).length > 4 ? ' · …' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: D.display, fontSize: 26, color: D.plum }}>{fmt.money(po.total_cost)}</div>
                  <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3, marginTop: 4 }}>{(po.status || 'draft').toUpperCase()} · {fmt.ago(po.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 24, fontSize: 12, color: D.ink3 }}>
          Inbound receiving chain runs automatically when a freight webhook reports customs clearance — see <Link to="/admin/integrations" style={{ color: D.plum }}>integrations</Link>.
        </div>
      </div>
    </AdminShell>
  );
}
