import { useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';

export function AdminQuotes() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const quotes = db.useTable('quotes', { orderBy: 'created_at', dir: 'desc' });
  const [activeId, setActiveId] = useState(quotes[0]?.id);
  const active = db.useRow('quotes', activeId);
  const items = db.useTable('quote_items', { where: { quote_id: activeId } });

  function setStatus(s) {
    if (active) db.update('quotes', active.id, { status: s });
  }

  return (
    <AdminShell active="quotes">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>SALES · QUOTES</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>Quotes · {quotes.length}</h1>
      </div>
      <div style={{ padding: isMobile ? 20 : 32, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '360px 1fr', gap: 20 }}>
        <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${D.line}`, fontFamily: D.display, fontSize: 18 }}>Recent</div>
          {quotes.length === 0 && <div style={{ padding: 16, color: D.ink3, fontSize: 13 }}>No quotes yet. Run the engine on /quote.</div>}
          {quotes.map((q) => (
            <button key={q.id} onClick={() => setActiveId(q.id)} style={{ width: '100%', textAlign: 'left', padding: '14px 16px', borderTop: `1px solid ${D.line}`, background: activeId === q.id ? 'rgba(29,92,77,.06)' : 'transparent', cursor: 'pointer', fontFamily: D.sans, color: D.ink, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
              <div>
                <div style={{ fontFamily: D.mono, fontSize: 11, color: D.plum }}>{q.id}</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>{q.customer_name}</div>
                <div style={{ fontSize: 12, color: D.ink2 }}>{q.vendor} · {q.line_count} lines</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: D.display, fontSize: 18, color: D.plum }}>{fmt.short(q.total)}</div>
                <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>{(q.status || '').toUpperCase()}</div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, padding: isMobile ? 22 : 28 }}>
          {!active && <div style={{ color: D.ink3 }}>Select a quote.</div>}
          {active && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{active.id}</div>
                  <div style={{ fontFamily: D.display, fontSize: 36, letterSpacing: -0.7, lineHeight: 1.05, marginTop: 6 }}>{active.customer_name}</div>
                  <div style={{ fontSize: 13, color: D.ink2, marginTop: 6 }}>{active.vendor} · {active.contact_name} · ETA {fmt.date(active.eta, { year: true })}</div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setStatus('sent')} style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '10px 18px', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>Mark sent</button>
                  <button onClick={() => setStatus('accepted')} style={{ background: D.plum, color: D.paper, border: 'none', padding: '10px 18px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Mark accepted</button>
                </div>
              </div>

              <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12 }}>
                {[
                  [fmt.money(active.total), 'Total quoted'],
                  [fmt.money(active.freight_total), 'Ocean freight'],
                  [`${(active.margin_target * 100).toFixed(0)}%`, 'Target margin'],
                  [active.status?.toUpperCase(), 'Status'],
                ].map(([b, s]) => (
                  <div key={s} style={{ padding: 16, background: D.paper, borderRadius: 10, border: `1px solid ${D.line}` }}>
                    <div style={{ fontFamily: D.display, fontSize: 22, color: D.ink, letterSpacing: -0.4 }}>{b}</div>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginTop: 4 }}>{s.toUpperCase()}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 24, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>LINES</div>
              <div className="um-scroll-x">
              <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
                <thead>
                  <tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                    {['PRODUCT', 'HTS', 'QTY', 'FOB', 'LANDED', 'SELL', 'EXT'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={it.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{it.name}</td>
                      <td style={{ padding: '10px 12px', fontFamily: D.mono, fontSize: 11 }}>{it.hts}</td>
                      <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{it.target_qty?.toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', fontFamily: D.mono }}>${it.fob?.toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', fontFamily: D.mono, color: D.plum }}>${it.landed_per_unit?.toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', fontFamily: D.mono, fontWeight: 600 }}>${it.sell_per_unit?.toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', fontFamily: D.mono, fontWeight: 600, color: D.plum }}>{fmt.money(it.ext_sell)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              <div style={{ marginTop: 24, padding: 20, background: D.paperAlt, borderRadius: 10 }}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum, marginBottom: 10 }}>CLAUDE COVER LETTER (DRAFT)</div>
                <div style={{ fontSize: 13, color: D.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{active.cover_letter}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
