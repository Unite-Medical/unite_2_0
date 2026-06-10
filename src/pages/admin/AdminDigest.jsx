/**
 * Admin · Morning brief — PRD-05 Phase 5 (CEO daily digest).
 *
 * One button, five bullets, each with a deep link. Heuristic ranking
 * today; Claude writes it once the Anthropic key is wired (the page
 * doesn't change).
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';
import { generateDigest } from '../../lib/digest.js';

const SEVERITY = {
  urgent:    ['#c3382d', 'URGENT'],
  attention: [D.terra, 'ATTENTION'],
  info:      ['#2d6a4f', 'INFO'],
};

export function AdminDigest() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const digests = db.useTable('daily_digests', { orderBy: 'generated_at', dir: 'desc' });
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const active = activeId ? digests.find((d) => d.id === activeId) : digests[0];

  async function handleGenerate() {
    setBusy(true);
    try {
      const row = await generateDigest({ source: 'manual' });
      setActiveId(row.id);
    } finally { setBusy(false); }
  }

  return (
    <AdminShell active="digest">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>DAILY · 7AM</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>Morning brief</h1>
        <div style={{ marginTop: 10, fontSize: 13, color: D.ink2, maxWidth: 620 }}>
          Five bullets, ranked by what needs Damon first. Pulled from live orders, AR, inventory cover, inbound freight, CRM, and compliance events — before email gets opened.
        </div>
      </div>

      <div style={{ padding: isMobile ? 20 : 32, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 280px', gap: 20 }}>
        <div>
          <button onClick={handleGenerate} disabled={busy} style={{ padding: '12px 22px', borderRadius: 8, fontSize: 14, fontFamily: D.sans, cursor: 'pointer', background: D.plum, color: '#fff', border: 'none' }}>
            {busy ? 'Reading the business…' : 'Generate today\u2019s brief'}
          </button>

          {!active && (
            <div style={{ marginTop: 20, padding: 28, background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, color: D.ink3, fontSize: 14 }}>
              No briefs yet. Generate one — it reads every table in the system and ranks what matters.
            </div>
          )}

          {active && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontFamily: D.display, fontSize: 24, letterSpacing: -0.4 }}>
                  {new Date(active.generated_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                  WRITTEN BY {active.generated_by === 'claude' ? 'CLAUDE' : 'RULE ENGINE (no API key yet)'} · {fmt.ago(active.generated_at)}
                </div>
              </div>

              <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
                {(active.bullets || []).map((b, i) => {
                  const [color, label] = SEVERITY[b.severity] || SEVERITY.info;
                  return (
                    <div key={i} style={{ background: D.card, border: `1px solid ${D.line}`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{b.priority}. {b.headline}</div>
                        <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: `${color}20`, color, alignSelf: 'start' }}>{label}</span>
                      </div>
                      <div style={{ fontSize: 13, color: D.ink2, marginTop: 8 }}>{b.summary}</div>
                      <div style={{ fontSize: 12, color: D.ink3, marginTop: 6, fontStyle: 'italic' }}>{b.why_it_matters}</div>
                      {b.deep_link && (
                        <Link to={b.deep_link} style={{ display: 'inline-block', marginTop: 10, fontSize: 12, fontFamily: D.mono, letterSpacing: 0.5, color: D.plum }}>
                          {b.deep_link} →
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>

              {active.signal_counts && (
                <div style={{ marginTop: 16, fontSize: 11, color: D.ink3, fontFamily: D.mono }}>
                  SIGNALS · orders {active.signal_counts.orders} · overdue {active.signal_counts.overdue_invoices} · low stock {active.signal_counts.low_stock} · freight exceptions {active.signal_counts.exceptions} · leads {active.signal_counts.hot_leads} · recalls {active.signal_counts.recalls}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden', alignSelf: 'start' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${D.line}`, fontFamily: D.display, fontSize: 18 }}>History</div>
          {digests.length === 0 && <div style={{ padding: 16, fontSize: 13, color: D.ink3 }}>Empty.</div>}
          {digests.slice(0, 14).map((d) => (
            <button key={d.id} onClick={() => setActiveId(d.id)} style={{ width: '100%', textAlign: 'left', display: 'block', padding: '12px 16px', borderTop: `1px solid ${D.line}`, background: active?.id === d.id ? 'rgba(94,41,99,.06)' : 'transparent', cursor: 'pointer', fontFamily: D.sans, color: D.ink }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{fmt.date(d.generated_at, { year: true })}</div>
              <div style={{ fontSize: 11, color: D.ink3, marginTop: 2 }}>{(d.bullets || []).length} bullets · {d.generated_by}</div>
            </button>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
