/**
 * Admin · Webhooks — PRD-20.
 *
 * Operator view over the durable webhook event bus: live counts by
 * status, the full event log (source, type, attempts, last error), and
 * one-click replay for dead-lettered / failed events. "Process due now"
 * forces the retry timer so ops don't have to wait for the poll.
 */

import { useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';
import { processDue, replayEvent, busStats } from '../../lib/webhookBus.js';

const STATUS_CHIP = {
  received:   [D.ink3, 'RECEIVED'],
  processing: ['#9a7b1e', 'PROCESSING'],
  processed:  ['#2d6a4f', 'PROCESSED'],
  failed:     [D.terra, 'FAILED'],
  dead:       ['#c3382d', 'DEAD-LETTER'],
};

export function AdminWebhooks() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const events = db.useTable('webhook_events', { orderBy: 'received_at', dir: 'desc' });
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const stats = busStats();

  async function handleProcessDue() {
    setBusy('due');
    const n = await processDue();
    setNotice(n > 0 ? `Processed ${n} due event(s).` : 'No events were due for retry.');
    setBusy(null);
  }

  async function handleReplay(id) {
    setBusy(id);
    await replayEvent(id);
    setNotice(`Replayed event ${id}.`);
    setBusy(null);
  }

  const btn = (primary) => ({
    padding: '9px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: primary ? 'none' : `1.5px solid ${D.ink}`,
    background: primary ? D.plum : 'transparent', color: primary ? D.paper : D.ink,
  });

  return (
    <AdminShell active="webhooks">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>INTEGRATIONS · EVENT BUS</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>Webhooks</h1>
        <div style={{ marginTop: 10, fontSize: 13, color: D.ink2, maxWidth: 680 }}>
          Idempotent delivery, exponential-backoff retries, and a dead-letter queue for every inbound provider event
          (Stripe, Flexport, ShipStation, Fathom, Calendly). Duplicates are recorded once and never re-applied.
        </div>
      </div>

      <div style={{ padding: isMobile ? 20 : 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 14 }}>
          {[
            ['TOTAL', stats.total, D.ink],
            ['PROCESSED', stats.processed, '#2d6a4f'],
            ['RECEIVED', stats.received, D.ink3],
            ['FAILED', stats.failed, D.terra],
            ['DEAD-LETTER', stats.dead, '#c3382d'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{label}</div>
              <div style={{ fontFamily: D.display, fontSize: 34, letterSpacing: -0.5, marginTop: 6, color }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={handleProcessDue} disabled={busy === 'due'} style={btn(true)}>
            {busy === 'due' ? 'Processing…' : 'Process due now'}
          </button>
          {notice && <span style={{ fontSize: 13, color: D.ink2 }}>{notice}</span>}
        </div>

        <div style={{ marginTop: 20, background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
            <thead>
              <tr style={{ textAlign: 'left', fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                {['SOURCE', 'TYPE', 'EVENT ID', 'STATUS', 'ATTEMPTS', 'LAST ERROR', 'RECEIVED', ''].map((h) => (
                  <th key={h} style={{ padding: '12px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const [color, label] = STATUS_CHIP[e.status] || STATUS_CHIP.received;
                const canReplay = e.status === 'dead' || e.status === 'failed';
                return (
                  <tr key={e.id} style={{ borderTop: `1px solid ${D.line}` }}>
                    <td style={{ padding: 12, fontWeight: 600 }}>{e.source}</td>
                    <td style={{ padding: 12, fontFamily: D.mono, fontSize: 12 }}>{e.type}</td>
                    <td style={{ padding: 12, fontFamily: D.mono, fontSize: 11, color: D.ink2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.event_id}</td>
                    <td style={{ padding: 12 }}>
                      <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: `${color}20`, color }}>{label}</span>
                    </td>
                    <td style={{ padding: 12 }}>{e.attempts}</td>
                    <td style={{ padding: 12, color: D.terra, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.last_error || '—'}</td>
                    <td style={{ padding: 12, color: D.ink3, fontSize: 12 }}>{fmt.ago(e.received_at)}</td>
                    <td style={{ padding: 12 }}>
                      {canReplay && (
                        <button type="button" onClick={() => handleReplay(e.id)} disabled={busy === e.id} style={{ ...btn(false), padding: '5px 12px', fontSize: 12 }}>
                          {busy === e.id ? '…' : 'Replay'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {events.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, color: D.ink3 }}>No webhook events yet. They land here as providers deliver them to <code>/api/hooks/*</code>.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
