/**
 * Admin quote desk — PRD-16 Phase 5 + 7.
 *
 * The rep's working surface for every quote the engine produces:
 *   - Pipeline tabs (all / draft / sent / countered / accepted / declined
 *     / expired) with open-value, win-rate, and average-margin KPIs.
 *   - Per-line 6-component landed-cost breakdown + compliance flags.
 *   - Margin override with the 10% floor enforced and a manager-approval
 *     gate for anything below the tier default (audit-logged).
 *   - Freight-mode switcher repricing from the stored LCL/FCL/AIR options.
 *   - Counter-offer review: apply the customer's numbers (floor holds)
 *     or decline the counter.
 *   - Expired-quote refresh (fresh freight + validity window).
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';
import { repriceQuote, approveQuoteMargin, refreshQuote, applyCounterOffers, MARGIN_FLOOR } from '../../lib/quoting.js';
import { quoteIsExpired } from '../../lib/quoteAcceptance.js';
import { loadMarginPolicy, marginForTier } from '../../lib/marginPolicy.js';

const TABS = ['all', 'draft', 'sent', 'countered', 'accepted', 'declined', 'expired'];

const STATUS_TONE = {
  draft: { color: '#57635a', bg: 'rgba(87,99,90,.1)' },
  sent: { color: '#1d5c4d', bg: 'rgba(29,92,77,.1)' },
  countered: { color: '#7c5b1d', bg: '#fdf6e3' },
  accepted: { color: '#1f7a4d', bg: '#e3f5ec' },
  declined: { color: '#c3382d', bg: 'rgba(195,56,45,.08)' },
  expired: { color: '#8b968d', bg: 'rgba(139,150,141,.12)' },
};

function effectiveStatus(q) {
  if (['accepted', 'declined'].includes(q.status)) return q.status;
  if (quoteIsExpired(q)) return 'expired';
  return q.status || 'draft';
}

const COMPONENT_LABELS = {
  fob: 'FOB',
  duty: 'Duty',
  ocean_freight: 'Freight',
  customs_brokerage: 'Brokerage',
  drayage: 'Drayage',
  warehouse_receiving: 'Receiving',
};

export function AdminQuotes() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const quotes = db.useTable('quotes', { orderBy: 'created_at', dir: 'desc' });
  const [tab, setTab] = useState('all');
  const [activeId, setActiveId] = useState(quotes[0]?.id);
  const active = db.useRow('quotes', activeId);
  const items = db.useTable('quote_items', { where: { quote_id: activeId } });

  const [marginInput, setMarginInput] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  const policy = loadMarginPolicy();
  const tierDefault = active ? marginForTier(active.customer_tier, policy) : null;

  const filtered = useMemo(
    () => (tab === 'all' ? quotes : quotes.filter((q) => effectiveStatus(q) === tab)),
    [quotes, tab],
  );

  const kpis = useMemo(() => {
    const open = quotes.filter((q) => ['draft', 'sent', 'countered'].includes(effectiveStatus(q)));
    const won = quotes.filter((q) => q.status === 'accepted');
    const closed = quotes.filter((q) => ['accepted', 'declined'].includes(q.status)).length
      + quotes.filter((q) => effectiveStatus(q) === 'expired').length;
    const margins = quotes.map((q) => Number(q.margin_target)).filter((m) => Number.isFinite(m));
    return {
      openValue: open.reduce((a, q) => a + (Number(q.total) || 0), 0),
      openCount: open.length,
      winRate: closed > 0 ? Math.round((won.length / closed) * 100) : null,
      avgMargin: margins.length ? Math.round((margins.reduce((a, m) => a + m, 0) / margins.length) * 100) : null,
      needsAction: quotes.filter((q) => q.status === 'countered' || q.refresh_requested_at || q.needs_approval).length,
    };
  }, [quotes]);

  function notify(msg) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3500);
  }

  function handleStatus(s) {
    if (active) db.update('quotes', active.id, { status: s });
  }

  function handleMarginOverride() {
    const pct = Number(marginInput) / 100;
    if (!Number.isFinite(pct) || pct <= 0) return;
    if (pct < MARGIN_FLOOR) { notify(`Rejected — the ${MARGIN_FLOOR * 100}% floor is non-negotiable.`); return; }
    const res = repriceQuote(active.id, { margin_pct: pct, actor: 'admin', reason: overrideReason || 'margin override' });
    if (res.ok) {
      notify(res.quote.needs_approval ? `Repriced at ${Math.round(pct * 100)}% — below tier default, manager approval required.` : `Repriced at ${Math.round(pct * 100)}%.`);
      setMarginInput(''); setOverrideReason('');
    } else notify(`Could not reprice (${res.reason}).`);
  }

  function handleFreightSwitch(mode) {
    if (!active || mode === active.freight_mode) return;
    const res = repriceQuote(active.id, { freight_mode: mode, actor: 'admin', reason: 'freight mode switch' });
    notify(res.ok ? `Switched to ${mode} — repriced.` : `Could not switch (${res.reason}).`);
  }

  async function handleRefresh() {
    setBusy(true);
    const res = await refreshQuote(active.id, { actor: 'admin' });
    setBusy(false);
    notify(res.ok ? `Refreshed — rev ${res.quote.revision}, valid until ${fmt.date(res.quote.valid_until, { year: true })}.` : `Could not refresh (${res.reason}).`);
  }

  function handleApplyCounters() {
    const res = applyCounterOffers(active.id, { actor: 'admin' });
    if (res.ok) notify(res.floored > 0 ? `Counter applied — ${res.floored} line(s) held at the margin floor.` : 'Counter applied — quote returned to sent.');
    else notify(`Could not apply (${res.reason}).`);
  }

  function handleDeclineCounter() {
    for (const it of items.filter((i) => Number(i.counter_price) > 0)) {
      db.update('quote_items', it.id, { counter_price: null });
    }
    db.update('quotes', active.id, { status: 'sent', counter_note: null });
    notify('Counter declined — original pricing stands.');
  }

  const counteredItems = items.filter((it) => Number(it.counter_price) > 0);
  const activeStatus = active ? effectiveStatus(active) : null;

  return (
    <AdminShell active="quotes">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>SALES · QUOTE DESK</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>Quotes · {quotes.length}</h1>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0,1fr))', gap: 12, marginTop: 20, maxWidth: 900 }}>
          {[
            [fmt.money(kpis.openValue), `Open pipeline · ${kpis.openCount}`],
            [kpis.winRate == null ? '—' : `${kpis.winRate}%`, 'Win rate (closed)'],
            [kpis.avgMargin == null ? '—' : `${kpis.avgMargin}%`, 'Avg target margin'],
            [String(kpis.needsAction), 'Needs action'],
          ].map(([b, s]) => (
            <div key={s} style={{ padding: '14px 16px', background: D.card, borderRadius: 10, border: `1px solid ${D.line}` }}>
              <div style={{ fontFamily: D.display, fontSize: 24, letterSpacing: -0.4 }}>{b}</div>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginTop: 4 }}>{s.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* Pipeline tabs */}
        <div style={{ display: 'flex', gap: 6, marginTop: 20, flexWrap: 'wrap' }}>
          {TABS.map((t) => {
            const n = t === 'all' ? quotes.length : quotes.filter((q) => effectiveStatus(q) === t).length;
            return (
              <button key={t} type="button" onClick={() => setTab(t)} style={{
                fontFamily: D.mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
                padding: '7px 13px', borderRadius: 4, cursor: 'pointer',
                border: `1px solid ${tab === t ? D.ink : D.line}`,
                background: tab === t ? D.ink : 'transparent',
                color: tab === t ? D.paper : D.ink2,
              }}>
                {t} · {n}
              </button>
            );
          })}
        </div>
      </div>

      {flash && (
        <div style={{ margin: `16px ${padX}px 0`, padding: '12px 16px', background: '#e8f3ec', border: '1px solid #c8ddd2', borderRadius: 8, fontSize: 13, color: '#1d5c4d' }}>{flash}</div>
      )}

      <div style={{ padding: isMobile ? 20 : 32, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '360px 1fr', gap: 20 }}>
        {/* LIST */}
        <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, overflow: 'hidden', alignSelf: 'start' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${D.line}`, fontFamily: D.display, fontSize: 18 }}>{tab === 'all' ? 'Recent' : tab[0].toUpperCase() + tab.slice(1)}</div>
          {filtered.length === 0 && <div style={{ padding: 16, color: D.ink3, fontSize: 13 }}>Nothing here. Run the engine on /quote/new.</div>}
          {filtered.map((q) => {
            const st = effectiveStatus(q);
            const tone = STATUS_TONE[st] || STATUS_TONE.draft;
            return (
              <button key={q.id} onClick={() => setActiveId(q.id)} style={{ width: '100%', textAlign: 'left', padding: '14px 16px', borderTop: `1px solid ${D.line}`, border: 'none', borderTopStyle: 'solid', borderTopWidth: 1, borderTopColor: D.line, background: activeId === q.id ? 'rgba(29,92,77,.06)' : 'transparent', cursor: 'pointer', fontFamily: D.sans, color: D.ink, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: D.mono, fontSize: 11, color: D.plum }}>{q.id}</span>
                    {q.needs_approval && <span title="Below tier default — needs manager approval" style={{ fontFamily: D.mono, fontSize: 8, letterSpacing: 0.5, color: '#7c5b1d', background: '#fdf6e3', borderRadius: 3, padding: '2px 5px' }}>APPROVAL</span>}
                    {q.refresh_requested_at && <span title="Customer requested refreshed pricing" style={{ fontFamily: D.mono, fontSize: 8, letterSpacing: 0.5, color: '#1d5c4d', background: '#e8f3ec', borderRadius: 3, padding: '2px 5px' }}>REFRESH</span>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>{q.customer_name}</div>
                  <div style={{ fontSize: 12, color: D.ink2 }}>{q.vendor} · {q.line_count} lines{q.revision > 1 ? ` · rev ${q.revision}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: D.display, fontSize: 18, color: D.plum }}>{fmt.short(q.total)}</div>
                  <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 0.5, color: tone.color, background: tone.bg, borderRadius: 3, padding: '2px 6px', display: 'inline-block', marginTop: 4 }}>{st.toUpperCase()}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* DETAIL */}
        <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, padding: isMobile ? 22 : 28 }}>
          {!active && <div style={{ color: D.ink3 }}>Select a quote.</div>}
          {active && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{active.id}</span>
                    {active.revision > 1 && <span style={{ fontFamily: D.mono, fontSize: 9, color: D.ink3, border: `1px solid ${D.line}`, borderRadius: 3, padding: '2px 6px' }}>REV {active.revision}</span>}
                    {active.tier_resolved && <span title="Tier auto-resolved from the customer record" style={{ fontFamily: D.mono, fontSize: 9, color: '#1d5c4d', background: '#e8f3ec', borderRadius: 3, padding: '2px 6px' }}>TIER {active.customer_tier} · AUTO</span>}
                    {!active.tier_resolved && active.customer_tier && <span style={{ fontFamily: D.mono, fontSize: 9, color: D.ink3, border: `1px solid ${D.line}`, borderRadius: 3, padding: '2px 6px' }}>TIER {active.customer_tier}</span>}
                  </div>
                  <div style={{ fontFamily: D.display, fontSize: 36, letterSpacing: -0.7, lineHeight: 1.05, marginTop: 6 }}>{active.customer_name}</div>
                  <div style={{ fontSize: 13, color: D.ink2, marginTop: 6 }}>{active.vendor} · {active.contact_name} · ETA {fmt.date(active.eta, { year: true })} · valid until {fmt.date(active.valid_until, { year: true })}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link to={`/quotes/${active.id}/print?view=internal`} style={{ color: D.ink, border: `1px solid ${D.line}`, padding: '10px 16px', borderRadius: 4, fontSize: 13, textDecoration: 'none' }}>Print view</Link>
                  {activeStatus === 'draft' && <button onClick={() => handleStatus('sent')} style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '10px 18px', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>Mark sent</button>}
                  {['draft', 'sent'].includes(activeStatus) && <button onClick={() => handleStatus('accepted')} style={{ background: D.plum, color: D.paper, border: 'none', padding: '10px 18px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Mark accepted</button>}
                </div>
              </div>

              {/* Action banners */}
              {active.needs_approval && (
                <div style={{ marginTop: 18, padding: 16, background: '#fdf6e3', border: '1px solid #ecd9a8', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, color: '#7c5b1d', flex: 1, minWidth: 220 }}>
                    Margin set below the tier {active.customer_tier} default ({Math.round((tierDefault || 0) * 100)}%). Manager approval required before sending.
                  </div>
                  <button onClick={() => { approveQuoteMargin(active.id, { approver: 'admin' }); notify('Margin override approved.'); }} style={{ background: '#7c5b1d', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Approve override</button>
                </div>
              )}
              {active.refresh_requested_at && (
                <div style={{ marginTop: 18, padding: 16, background: '#e8f3ec', border: '1px solid #c8ddd2', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, color: '#1d5c4d', flex: 1, minWidth: 220 }}>
                    Customer requested refreshed pricing on {fmt.date(active.refresh_requested_at, { year: true })}.
                  </div>
                  <button disabled={busy} onClick={handleRefresh} style={{ background: D.plum, color: D.paper, border: 'none', padding: '9px 16px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Refreshing…' : 'Refresh pricing'}</button>
                </div>
              )}
              {activeStatus === 'countered' && (
                <div style={{ marginTop: 18, padding: 16, background: '#fdf6e3', border: '1px solid #ecd9a8', borderRadius: 8 }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: '#7c5b1d' }}>COUNTER-OFFER · {counteredItems.length} LINE(S)</div>
                  {active.counter_note && <div style={{ fontSize: 13, color: '#7c5b1d', marginTop: 8, fontStyle: 'italic' }}>&ldquo;{active.counter_note}&rdquo;</div>}
                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={handleApplyCounters} style={{ background: '#7c5b1d', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Apply counter (floor holds)</button>
                    <button onClick={handleDeclineCounter} style={{ background: 'transparent', color: '#7c5b1d', border: '1px solid #ecd9a8', padding: '9px 16px', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>Decline counter</button>
                  </div>
                </div>
              )}
              {activeStatus === 'expired' && !active.refresh_requested_at && (
                <div style={{ marginTop: 18, padding: 16, background: 'rgba(139,150,141,.1)', border: `1px solid ${D.line}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, color: D.ink2, flex: 1, minWidth: 220 }}>Expired {fmt.date(active.valid_until, { year: true })}. Refresh to re-run freight and restart the validity window.</div>
                  <button disabled={busy} onClick={handleRefresh} style={{ background: D.ink, color: D.paper, border: 'none', padding: '9px 16px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Refreshing…' : 'Refresh quote'}</button>
                </div>
              )}

              {/* Headline numbers */}
              <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12 }}>
                {[
                  [fmt.money(active.total), 'Total quoted'],
                  [fmt.money(active.total_landed), 'Total landed'],
                  [`${((active.margin_target || 0) * 100).toFixed(0)}%`, `Target margin (tier ${active.customer_tier || '—'})`],
                  [activeStatus?.toUpperCase(), 'Status'],
                ].map(([b, s]) => (
                  <div key={s} style={{ padding: 16, background: D.paper, borderRadius: 10, border: `1px solid ${D.line}` }}>
                    <div style={{ fontFamily: D.display, fontSize: 22, color: D.ink, letterSpacing: -0.4 }}>{b}</div>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginTop: 4 }}>{s.toUpperCase()}</div>
                  </div>
                ))}
              </div>

              {/* Freight modes */}
              {(active.freight_options || []).length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>FREIGHT — SWITCH MODE TO REPRICE</div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    {active.freight_options.map((o) => {
                      const selected = o.mode === active.freight_mode;
                      const locked = ['accepted', 'declined'].includes(active.status);
                      return (
                        <button key={o.mode} type="button" disabled={selected || locked} onClick={() => handleFreightSwitch(o.mode)} style={{
                          padding: '12px 16px', borderRadius: 8, cursor: selected || locked ? 'default' : 'pointer', textAlign: 'left', minWidth: 150,
                          border: `1.5px solid ${selected ? D.plum : D.line}`,
                          background: selected ? 'rgba(29,92,77,.07)' : D.paper,
                          color: D.ink, opacity: locked && !selected ? 0.5 : 1,
                        }}>
                          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: selected ? D.plum : D.ink2 }}>{o.mode}{selected ? ' · SELECTED' : ''}</div>
                          <div style={{ fontFamily: D.display, fontSize: 20, marginTop: 4 }}>{fmt.money(o.total_usd)}</div>
                          <div style={{ fontSize: 11, color: D.ink3, marginTop: 2 }}>{o.transit_days} days transit</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Margin override */}
              {!['accepted', 'declined'].includes(active.status) && (
                <div style={{ marginTop: 24, padding: 18, background: D.paper, borderRadius: 10, border: `1px solid ${D.line}` }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>MARGIN OVERRIDE — FLOOR {MARGIN_FLOOR * 100}% · TIER DEFAULT {Math.round((tierDefault || 0) * 100)}% · AUDIT-LOGGED</div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="number" min={MARGIN_FLOOR * 100} max="95" step="1" value={marginInput}
                      onChange={(e) => setMarginInput(e.target.value)}
                      placeholder={`${Math.round((active.margin_target || 0) * 100)}`}
                      style={{ width: 90, padding: '10px 12px', border: `1px solid ${D.line}`, borderRadius: 6, fontFamily: D.mono, fontSize: 13, background: D.card, color: D.ink }}
                    />
                    <span style={{ fontFamily: D.mono, fontSize: 12, color: D.ink3 }}>%</span>
                    <input
                      value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Reason (goes to the audit log)"
                      style={{ flex: 1, minWidth: 180, padding: '10px 12px', border: `1px solid ${D.line}`, borderRadius: 6, fontSize: 13, background: D.card, color: D.ink, fontFamily: 'inherit' }}
                    />
                    <button type="button" onClick={handleMarginOverride} disabled={!marginInput} style={{ background: D.ink, color: D.paper, border: 'none', padding: '10px 18px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: marginInput ? 1 : 0.5 }}>Reprice</button>
                  </div>
                </div>
              )}

              {/* Lines with full cost breakdown */}
              <div style={{ marginTop: 24, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>LINES — 6-COMPONENT LANDED COST</div>
              <div className="um-scroll-x">
                <table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
                  <thead>
                    <tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                      {['PRODUCT', 'QTY', ...Object.values(COMPONENT_LABELS).map((l) => l.toUpperCase()), 'LANDED', 'SELL', 'EXT', 'FLAGS'].map((h) => (
                        <th key={h} style={{ padding: '9px 10px', textAlign: h === 'PRODUCT' ? 'left' : 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => {
                      const c = it.cost_components || {};
                      return (
                        <tr key={it.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                          <td style={{ padding: '9px 10px', fontWeight: 500, minWidth: 180 }}>
                            {it.name}
                            <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3, marginTop: 2 }}>{it.hts || '—'} · {it.fda_product_code || '—'}</div>
                          </td>
                          <td style={{ padding: '9px 10px', fontFamily: D.mono, textAlign: 'right' }}>{(it.target_qty || it.moq || 0).toLocaleString()}</td>
                          {Object.keys(COMPONENT_LABELS).map((k) => (
                            <td key={k} style={{ padding: '9px 10px', fontFamily: D.mono, textAlign: 'right', color: D.ink2 }}>{c[k] != null ? `$${Number(c[k]).toFixed(2)}` : '—'}</td>
                          ))}
                          <td style={{ padding: '9px 10px', fontFamily: D.mono, textAlign: 'right', color: D.plum }}>${(Number(it.landed_per_unit) || 0).toFixed(2)}</td>
                          <td style={{ padding: '9px 10px', fontFamily: D.mono, textAlign: 'right', fontWeight: 600 }}>
                            ${(Number(it.sell_per_unit) || 0).toFixed(2)}
                            {Number(it.counter_price) > 0 && <div style={{ fontSize: 10, color: '#7c5b1d' }}>ask ${Number(it.counter_price).toFixed(2)}</div>}
                          </td>
                          <td style={{ padding: '9px 10px', fontFamily: D.mono, textAlign: 'right', fontWeight: 600, color: D.plum }}>{fmt.money(it.ext_sell)}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {it.fda_validated && <Flag ok title={`FDA verified${it.device_class ? ` · Class ${it.device_class}` : ''}`}>FDA</Flag>}
                            {it.fda_validated === false && <Flag title="FDA product code not verified">FDA?</Flag>}
                            {it.gtin_validated === true && <Flag ok title="GTIN check digit valid">GTIN</Flag>}
                            {it.gtin_validated === false && <Flag title="GTIN check digit invalid">GTIN?</Flag>}
                            {it.margin_floored && <Flag warn title="Priced at the 10% margin floor">FLOOR</Flag>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 24, padding: 20, background: D.paperAlt, borderRadius: 10 }}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum, marginBottom: 10 }}>CLAUDE COVER LETTER (DRAFT)</div>
                <div style={{ fontSize: 13, color: D.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{active.cover_letter}</div>
              </div>

              {active.acceptance_token && !['accepted', 'declined'].includes(active.status) && (
                <div style={{ marginTop: 16, fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>
                  Acceptance link: <Link to={`/q/${active.acceptance_token}`} style={{ color: D.plum }}>/q/{active.acceptance_token.slice(0, 18)}…</Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function Flag({ children, ok = false, warn = false, title }) {
  const color = ok ? '#1f7a4d' : warn ? '#7c5b1d' : '#c3382d';
  const bg = ok ? '#e3f5ec' : warn ? '#fdf6e3' : 'rgba(195,56,45,.08)';
  return (
    <span title={title} style={{ display: 'inline-block', fontFamily: D.mono, fontSize: 8, letterSpacing: 0.5, color, background: bg, borderRadius: 3, padding: '2px 5px', marginLeft: 4 }}>
      {children}
    </span>
  );
}
