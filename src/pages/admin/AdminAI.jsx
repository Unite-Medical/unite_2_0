/**
 * Admin · AI usage dashboard — PRD-11.
 *
 * Live view of every call through the prompt registry: cost by
 * prompt, latency p95, error rate, recent calls log.
 *
 * Reads from the `ai_usage` table (populated by `src/lib/ai/client.js`
 * on every call, including stubs).
 */

import { useMemo, useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';
import { PROMPT_REGISTRY } from '../../lib/ai/registry.js';

const STATUS_COLOR = { ok: '#2d6a4f', stub: '#8b968d', error: '#c3382d', rate_limited: D.terra, schema_violation: '#c3382d' };

export function AdminAI() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;

  const usage = db.useTable('ai_usage', { orderBy: 'created_at', dir: 'desc', limit: 500 });

  const byKey = useMemo(() => {
    const map = new Map();
    for (const u of usage) {
      if (!map.has(u.prompt_key)) {
        map.set(u.prompt_key, { count: 0, ok: 0, errors: 0, stubs: 0, cost: 0, latencies: [], lastAt: null });
      }
      const agg = map.get(u.prompt_key);
      agg.count += 1;
      if (u.status === 'ok') agg.ok += 1;
      else if (u.status === 'error' || u.status === 'schema_violation') agg.errors += 1;
      else if (u.status === 'stub') agg.stubs += 1;
      agg.cost += Number(u.usd_cost) || 0;
      if (u.duration_ms) agg.latencies.push(u.duration_ms);
      if (!agg.lastAt || u.created_at > agg.lastAt) agg.lastAt = u.created_at;
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [usage]);

  // Capture "now" once at mount so the eslint react-hooks/purity
  // rule is happy. Refreshing requires a re-mount, which is fine for
  // an admin dashboard.
  const [mountedAt] = useState(() => Date.now());

  const todayCost = useMemo(() => {
    const todayStr = new Date(mountedAt).toDateString();
    return usage
      .filter((u) => new Date(u.created_at).toDateString() === todayStr)
      .reduce((a, u) => a + (Number(u.usd_cost) || 0), 0);
  }, [usage, mountedAt]);

  const last24hCount = useMemo(() => {
    const cutoff = mountedAt - 86400000;
    return usage.filter((u) => new Date(u.created_at).getTime() >= cutoff).length;
  }, [usage, mountedAt]);

  function p95(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  }

  return (
    <AdminShell active="settings">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>AI · USAGE</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>AI usage.</h1>
        <p style={{ fontSize: 14, color: D.ink2, marginTop: 10, maxWidth: 720, lineHeight: 1.55 }}>
          Every call through <code>src/lib/ai/client.js</code> is logged here. Stub calls (no API key configured) are counted but have $0 cost.
        </p>
      </div>

      <div style={{ padding: isMobile ? 20 : 32 }}>
        {/* Topline */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
          {[
            ['Total calls', fmt.number(usage.length), 'all time'],
            ['Calls (24h)', fmt.number(last24hCount), 'rolling'],
            ['Spend today', fmt.money(todayCost), 'USD'],
            ['Prompts in use', `${byKey.length} / ${Object.keys(PROMPT_REGISTRY).length}`, 'registry'],
          ].map(([h, v, sub]) => (
            <div key={h} style={{ padding: 22, background: D.card, borderRadius: 14, border: `1px solid ${D.line}` }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{h.toUpperCase()}</div>
              <div style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 40, color: D.ink, marginTop: 8, letterSpacing: -0.6 }}>{v}</div>
              <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>

        <AdminCard title="By prompt">
          <div className="um-scroll-x">
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                  {['PROMPT', 'CALLS', 'OK / STUB / ERR', 'P95 LATENCY', 'TOTAL COST', 'LAST USED'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: `1px solid ${D.line}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byKey.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 24, color: D.ink3, fontSize: 13, textAlign: 'center' }}>No AI calls yet. Run the quoting engine or submit something on /surplus.</td></tr>
                )}
                {byKey.map(([key, agg]) => (
                  <tr key={key} style={{ borderTop: `1px solid ${D.line}` }}>
                    <td style={{ padding: '12px', fontFamily: D.mono, fontSize: 12 }}>{key}</td>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{agg.count}</td>
                    <td style={{ padding: '12px', fontFamily: D.mono, fontSize: 12 }}>
                      <span style={{ color: STATUS_COLOR.ok }}>{agg.ok}</span> / <span style={{ color: STATUS_COLOR.stub }}>{agg.stubs}</span> / <span style={{ color: STATUS_COLOR.error }}>{agg.errors}</span>
                    </td>
                    <td style={{ padding: '12px', fontFamily: D.mono, fontSize: 12 }}>{p95(agg.latencies)}ms</td>
                    <td style={{ padding: '12px', fontFamily: D.mono, fontWeight: 600, color: D.plum }}>${agg.cost.toFixed(4)}</td>
                    <td style={{ padding: '12px', color: D.ink2 }}>{fmt.ago(agg.lastAt) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>

        <div style={{ marginTop: 18 }}>
          <AdminCard title="Recent calls">
            <div className="um-scroll-x">
              <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                    {['WHEN', 'PROMPT', 'MODEL', 'STATUS', 'TOKENS (IN/OUT)', 'COST', 'SOURCE', 'LATENCY'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: `1px solid ${D.line}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usage.slice(0, 30).map((u) => (
                    <tr key={u.id} style={{ borderTop: `1px solid ${D.line}` }}>
                      <td style={{ padding: '10px 12px', color: D.ink2 }}>{fmt.ago(u.created_at)}</td>
                      <td style={{ padding: '10px 12px', fontFamily: D.mono, fontSize: 12 }}>{u.prompt_key} <span style={{ color: D.ink3 }}>v{u.prompt_version}</span></td>
                      <td style={{ padding: '10px 12px', fontFamily: D.mono, fontSize: 11, color: D.ink2 }}>{u.model}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, padding: '3px 8px', borderRadius: 4, background: `${STATUS_COLOR[u.status] || D.ink3}20`, color: STATUS_COLOR[u.status] || D.ink3 }}>{u.status?.toUpperCase()}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: D.mono, fontSize: 11 }}>{u.input_tokens} / {u.output_tokens}</td>
                      <td style={{ padding: '10px 12px', fontFamily: D.mono, fontSize: 11 }}>${(Number(u.usd_cost) || 0).toFixed(4)}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: D.ink2 }}>{u.source}</td>
                      <td style={{ padding: '10px 12px', fontFamily: D.mono, fontSize: 11 }}>{u.duration_ms}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminCard>
        </div>
      </div>
    </AdminShell>
  );
}
