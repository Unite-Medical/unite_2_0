/**
 * Admin · Compliance — PRD-07 Phase 4 (continuous recall monitoring).
 *
 * Sweeps the FDA enforcement database (openFDA — live, free, no key)
 * for every vendor/manufacturer we stock, mirrors hits into
 * `compliance_events`, and drafts customer notices for affected SKUs.
 *
 * The backend runs this nightly via cron once deployed; this page is
 * both the manual trigger and the review queue.
 */

import { useMemo, useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt, uid } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';
import { openfda, gmail } from '../../lib/services.js';
import { ai } from '../../lib/ai/client.js';

const CLASS_COLOR = {
  'Class I':   '#c3382d',
  'Class II':  D.terra,
  'Class III': '#9a7b1e',
};

const STATUS_CHIP = {
  new:      ['#c3382d', 'NEW'],
  reviewed: [D.terra, 'REVIEWED'],
  resolved: ['#2d6a4f', 'RESOLVED'],
};

export function AdminCompliance() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const events = db.useTable('compliance_events', { orderBy: 'created_at', dir: 'desc' });
  const vendors = db.useTable('vendors');
  const products = db.useTable('products');

  const [sweeping, setSweeping] = useState(false);
  const [progress, setProgress] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Monitored set: approved vendors + distinct product manufacturers.
  const monitored = useMemo(() => {
    const names = new Set();
    vendors.forEach((v) => v.name && names.add(v.name));
    products.forEach((p) => p.vendor && names.add(p.vendor));
    return [...names].sort();
  }, [vendors, products]);

  const recallEvents = events.filter((e) => e.kind === 'recall');
  const openEvents = recallEvents.filter((e) => e.status !== 'resolved');

  async function runSweep() {
    setSweeping(true); setNotice(null);
    let hits = 0;
    try {
      for (let i = 0; i < monitored.length; i++) {
        const name = monitored[i];
        setProgress(`${i + 1}/${monitored.length} · ${name}`);
        const resp = await openfda.recallHistory(name, 730);
        for (const r of resp?.results || []) {
          const recallNo = r.recall_number || `${name}-${r.event_id || uid('rc')}`;
          if (db.list('compliance_events', { where: { recall_number: recallNo } }).length) continue;
          // Map affected SKUs by vendor name match.
          const affected = products.filter((p) => p.vendor === name).map((p) => p.sku);
          db.insert('compliance_events', {
            id: uid('ce'),
            kind: 'recall',
            recall_number: recallNo,
            firm: r.recalling_firm || name,
            vendor_name: name,
            classification: r.classification || 'Class II',
            reason: r.reason_for_recall || 'See FDA enforcement record.',
            product_description: r.product_description || '',
            recall_initiation_date: r.recall_initiation_date || null,
            affected_skus: affected,
            status: 'new',
            source: 'openfda.enforcement',
          });
          hits += 1;
        }
      }
      db.insert('audit_log', { id: uid('aud'), kind: 'compliance.sweep_complete', ref_id: null, payload: { vendors: monitored.length, new_events: hits } });
      try { localStorage.setItem('um.compliance.last_sweep', new Date().toISOString()); } catch { /* private mode */ }
      setNotice(hits > 0
        ? `Sweep complete — ${hits} new enforcement event(s) across ${monitored.length} monitored manufacturers.`
        : `Sweep complete — no new FDA enforcement actions across ${monitored.length} monitored manufacturers.`);
    } finally {
      setSweeping(false);
      setProgress(null);
    }
  }

  async function draftNotice(ev) {
    setBusyId(ev.id); setNotice(null);
    try {
      const sku = ev.affected_skus?.[0];
      const product = sku ? db.get('products', sku) : null;
      const { data } = await ai.run('vendor/recall_notice', {
        input: {
          product_name: product?.name || ev.product_description || 'affected product',
          sku: sku || 'multiple',
          gtin: product?.gtin || 'see packaging',
          lot_numbers: 'per FDA notice',
          recall_class: ev.classification,
          recall_reason: ev.reason,
          fda_recall_id: ev.recall_number,
          recall_date: ev.recall_initiation_date || 'recent',
          customer_name: 'affected customers',
          qty_shipped: 'per order records',
          ship_date: 'per order records',
          order_id: 'multiple',
        },
        source: 'compliance',
      });
      await gmail.send({
        to: 'affected-customers@list.unitemedical.net',
        from: 'compliance@unitemedical.net',
        subject: data.subject || `Important product notice · ${ev.recall_number}`,
        body: data.body || data.content || '',
        template_key: 'recall_notice',
        drafted_by: 'ai-assist:vendor/recall_notice',
      });
      db.update('compliance_events', ev.id, { status: 'reviewed', notice_drafted_at: new Date().toISOString() });
      setNotice(`Customer notice for ${ev.recall_number} queued in the outbox for legal review before send.`);
    } finally { setBusyId(null); }
  }

  const lastSweep = (() => {
    try { return localStorage.getItem('um.compliance.last_sweep'); } catch { return null; }
  })();

  return (
    <AdminShell active="compliance">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>COMPLIANCE · FDA ENFORCEMENT</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>Recall monitoring</h1>
        <div style={{ marginTop: 10, fontSize: 13, color: D.ink2, maxWidth: 640 }}>
          Live sweep of the FDA enforcement database for all {monitored.length} manufacturers we stock or have approved. Runs nightly once the backend cron is deployed; runs on demand today.
        </div>
      </div>

      <div style={{ padding: isMobile ? 20 : 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 14 }}>
          {[
            ['MONITORED FIRMS', monitored.length, D.ink],
            ['OPEN EVENTS', openEvents.length, openEvents.length ? '#c3382d' : '#2d6a4f'],
            ['CLASS I (URGENT)', openEvents.filter((e) => e.classification === 'Class I').length, '#c3382d'],
            ['LAST SWEEP', lastSweep ? fmt.ago(lastSweep) : 'never', D.ink2],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{label}</div>
              <div style={{ fontFamily: D.display, fontSize: 34, letterSpacing: -0.5, marginTop: 6, color }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={runSweep} disabled={sweeping} style={{ padding: '12px 22px', borderRadius: 8, fontSize: 14, fontFamily: D.sans, cursor: 'pointer', background: D.plum, color: '#fff', border: 'none' }}>
            {sweeping ? 'Sweeping FDA records…' : 'Run sweep now'}
          </button>
          {progress && <span style={{ fontFamily: D.mono, fontSize: 12, color: D.ink2 }}>{progress}</span>}
        </div>

        {notice && (
          <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(29,92,77,.07)', border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 13 }}>{notice}</div>
        )}

        <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
          {recallEvents.length === 0 && (
            <div style={{ padding: 28, background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, color: D.ink3, fontSize: 14 }}>
              No enforcement events on file. Run a sweep — it queries the live FDA database for every monitored manufacturer.
            </div>
          )}
          {recallEvents.map((ev) => {
            const [sc, sl] = STATUS_CHIP[ev.status] || STATUS_CHIP.new;
            const cc = CLASS_COLOR[ev.classification] || D.ink3;
            return (
              <div key={ev.id} style={{ background: D.card, border: `1px solid ${D.line}`, borderLeft: `3px solid ${cc}`, borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{ev.firm}</div>
                    <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3, marginTop: 2 }}>{ev.recall_number} · initiated {ev.recall_initiation_date || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
                    <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '3px 8px', borderRadius: 4, background: `${cc}20`, color: cc }}>{(ev.classification || '').toUpperCase()}</span>
                    <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '3px 8px', borderRadius: 4, background: `${sc}20`, color: sc }}>{sl}</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: D.ink2, marginTop: 10 }}>{ev.reason}</div>
                {ev.product_description && <div style={{ fontSize: 12, color: D.ink3, marginTop: 6 }}>{ev.product_description}</div>}
                {ev.affected_skus?.length > 0 && (
                  <div style={{ fontFamily: D.mono, fontSize: 11, color: '#c3382d', marginTop: 8 }}>
                    AFFECTED SKUS: {ev.affected_skus.join(', ')}
                  </div>
                )}
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ev.status === 'new' && (
                    <button onClick={() => draftNotice(ev)} disabled={busyId === ev.id} style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: D.plum, color: '#fff', border: 'none', fontFamily: D.sans }}>
                      {busyId === ev.id ? 'Drafting…' : 'Draft customer notice'}
                    </button>
                  )}
                  {ev.status !== 'resolved' && (
                    <button onClick={() => db.update('compliance_events', ev.id, { status: 'resolved', resolved_at: new Date().toISOString() })} style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', color: D.ink, border: `1px solid ${D.line}`, fontFamily: D.sans }}>
                      Mark resolved
                    </button>
                  )}
                  {ev.notice_drafted_at && <span style={{ fontSize: 12, color: D.ink3, alignSelf: 'center' }}>notice drafted {fmt.ago(ev.notice_drafted_at)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminShell>
  );
}
