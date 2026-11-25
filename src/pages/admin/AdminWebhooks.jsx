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
import { DataTable } from '../../components/ui/data-table.jsx';
import { Button } from '../../components/ui/button.jsx';
import { StatusBadge } from '../../components/ui/status-badge.jsx';
import '../../styles/ui.css';

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
    padding: '9px 16px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: primary ? 'none' : `1.5px solid ${D.ink}`,
    background: primary ? D.plum : 'transparent', color: primary ? D.paper : D.ink,
  });

  return (
    <AdminShell active="webhooks">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: D.ink2, marginBottom: 12 }}>Integrations</div>
        <h1 style={{ fontFamily: D.display, fontSize: 28, fontWeight: 600, letterSpacing: -0.4, lineHeight: 1.02, margin: 0 }}>Webhooks</h1>
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

        <div className="ui-root mt-5 font-sans text-sm text-ink">
          <DataTable
            label="Webhook events"
            rows={events}
            searchPlaceholder="Search source, type, event ID or error"
            searchText={(e) => `${e.source} ${e.type} ${e.event_id} ${e.last_error || ''}`}
            tabs={[{ id: 'all', label: 'All' }, { id: 'problems', label: 'Needs replay', filter: (e) => e.status === 'failed' || e.status === 'dead' }, { id: 'processing', label: 'In progress', filter: (e) => e.status === 'received' || e.status === 'processing' }, { id: 'processed', label: 'Processed', filter: (e) => e.status === 'processed' }]}
            filters={[{ id: 'source', label: 'Source', value: (e) => e.source }, { id: 'type', label: 'Type', value: (e) => e.type }]}
            defaultSort={{ id: 'received', dir: 'desc' }}
            empty={<p className="p-6 text-ink-3">No webhook events yet. They land here as providers deliver them to <code>/api/hooks/*</code>.</p>}
            columns={[
              { id: 'source', header: 'Source', accessor: 'source', className: 'font-semibold' },
              { id: 'type', header: 'Type', accessor: 'type', className: 'font-mono text-xs' },
              { id: 'event', header: 'Event ID', accessor: 'event_id', className: 'max-w-44 truncate font-mono text-xs text-ink-2' },
              { id: 'status', header: 'Status', accessor: 'status', cell: (e) => <StatusBadge value={e.status === 'dead' ? 'dead_letter' : e.status} /> },
              { id: 'attempts', header: 'Attempts', align: 'right', accessor: 'attempts' },
              { id: 'error', header: 'Last error', accessor: 'last_error', className: 'max-w-52 truncate text-warn' },
              { id: 'received', header: 'Received', accessor: 'received_at', cell: (e) => <span className="text-xs text-ink-3">{fmt.ago(e.received_at)}</span> },
              { id: 'actions', header: '', sortable: false, cell: (e) => (e.status === 'dead' || e.status === 'failed') && <Button size="sm" onClick={() => handleReplay(e.id)} disabled={busy === e.id}>{busy === e.id ? 'Replaying…' : 'Replay'}</Button> },
            ]}
          />
        </div>
      </div>
    </AdminShell>
  );
}
