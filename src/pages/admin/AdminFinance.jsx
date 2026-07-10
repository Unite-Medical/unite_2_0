/**
 * Admin · Finance — the CFO's structured dashboard (CTO brief §5).
 *
 * Replaces "order notifications in an inbox" with a live AR view:
 * aging buckets, overdue list, one-click payment recording (synced to
 * the accounting system), and one-click reminder emails.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt, uid } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';
import { qbo, gmail } from '../../lib/services.js';

const BUCKETS = [
  ['Current', 0, 0],
  ['1–30', 1, 30],
  ['31–60', 31, 60],
  ['61–90', 61, 90],
  ['90+', 91, Infinity],
];

function daysOverdue(inv) {
  if (!inv.due_date) return 0;
  return Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000);
}

export function AdminFinance() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const invoices = db.useTable('invoices', { orderBy: 'due_date', dir: 'asc' });
  const [tab, setTab] = useState('open');
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const open = invoices.filter((i) => i.status === 'open');
  const overdue = open.filter((i) => daysOverdue(i) > 0);
  const paid = invoices.filter((i) => i.status === 'paid');

  const aging = BUCKETS.map(([label, lo, hi]) => {
    const rows = open.filter((i) => { const d = daysOverdue(i); return d >= lo && d <= hi; });
    return { label, count: rows.length, total: rows.reduce((a, i) => a + (i.amount || 0), 0) };
  });

  const visible = tab === 'open' ? open : tab === 'overdue' ? overdue : tab === 'paid' ? paid : invoices;
  const maxBucket = Math.max(1, ...aging.map((b) => b.total));

  async function recordPayment(inv) {
    setBusyId(inv.id); setNotice(null);
    try {
      await qbo.recordPayment({ qbo_invoice_id: inv.qbo_id, amount: inv.amount, method: 'ach' });
      db.update('invoices', inv.id, { status: 'paid', paid_at: new Date().toISOString() });
      db.insert('payments', { id: uid('pay'), invoice_id: inv.id, order_id: inv.order_id, amount: inv.amount, method: 'ach', received_at: new Date().toISOString() });
      if (inv.order_id) {
        const order = db.get('orders', inv.order_id);
        if (order) db.update('orders', inv.order_id, { payment_status: 'paid' });
      }
      db.insert('audit_log', { id: uid('aud'), kind: 'finance.payment_recorded', ref_id: inv.id, payload: { amount: inv.amount } });
      setNotice(`Payment of ${fmt.money(inv.amount)} recorded on ${inv.id} and synced to the books.`);
    } finally { setBusyId(null); }
  }

  async function sendReminder(inv) {
    setBusyId(inv.id); setNotice(null);
    try {
      const org = db.get('organizations', inv.customer_id);
      const d = daysOverdue(inv);
      await gmail.send({
        to: org?.billing_email || `ap@${(org?.name || 'customer').toLowerCase().replace(/[^a-z]+/g, '')}.example.com`,
        from: 'accounting@unitemedical.net',
        subject: `Invoice ${inv.id} — ${d > 0 ? `${d} days past due` : 'payment reminder'}`,
        body: `Hi —\n\nFriendly nudge on invoice ${inv.id} for ${fmt.money(inv.amount)} (terms ${inv.terms?.toUpperCase() || 'NET30'}, due ${fmt.date(inv.due_date, { year: true })}).\n\nRemit via ACH on file, or reply here if anything on the invoice needs correcting and we'll turn it around same day.\n\n— Unite Medical billing`,
        template_key: 'ar_reminder',
        drafted_by: 'finance-dashboard',
      });
      db.update('invoices', inv.id, { last_reminder_at: new Date().toISOString() });
      db.insert('audit_log', { id: uid('aud'), kind: 'finance.reminder_sent', ref_id: inv.id, payload: { days_overdue: d } });
      setNotice(`Reminder for ${inv.id} queued in the outbox.`);
    } finally { setBusyId(null); }
  }

  const openAr = open.reduce((a, i) => a + (i.amount || 0), 0);
  const overdueAr = overdue.reduce((a, i) => a + (i.amount || 0), 0);
  const paidThisMonth = paid
    .filter((i) => i.paid_at && new Date(i.paid_at).getMonth() === new Date().getMonth())
    .reduce((a, i) => a + (i.amount || 0), 0);

  return (
    <AdminShell active="finance">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>FINANCE · ACCOUNTS RECEIVABLE</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>Finance</h1>
        <div style={{ marginTop: 10, fontSize: 13, color: D.ink2, maxWidth: 620 }}>
          Invoices auto-create when orders are placed — nothing arrives by inbox. This is the collect-and-reconcile view.
        </div>
      </div>

      <div style={{ padding: isMobile ? 20 : 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 14 }}>
          {[
            ['OPEN AR', fmt.short(openAr), D.ink],
            ['PAST DUE', fmt.short(overdueAr), overdueAr > 0 ? '#c3382d' : '#2d6a4f'],
            ['OVERDUE INVOICES', overdue.length, overdue.length ? D.terra : '#2d6a4f'],
            ['COLLECTED THIS MONTH', fmt.short(paidThisMonth), '#2d6a4f'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{label}</div>
              <div style={{ fontFamily: D.display, fontSize: 34, letterSpacing: -0.5, marginTop: 6, color }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginBottom: 14 }}>AGING BUCKETS · OPEN AR</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${BUCKETS.length}, 1fr)`, gap: 10, alignItems: 'end', height: 120 }}>
            {aging.map((b) => (
              <div key={b.label} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ fontSize: 11, color: D.ink2, marginBottom: 4, textAlign: 'center' }}>{b.total > 0 ? fmt.short(b.total) : ''}</div>
                <div style={{ height: `${Math.max(3, (b.total / maxBucket) * 80)}%`, background: b.label === 'Current' ? '#2d6a4f' : b.label === '90+' ? '#c3382d' : D.plum, borderRadius: '6px 6px 0 0', opacity: b.total > 0 ? 1 : 0.15 }} />
                <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3, textAlign: 'center', marginTop: 6 }}>{b.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
          {[['open', `Open (${open.length})`], ['overdue', `Overdue (${overdue.length})`], ['paid', `Paid (${paid.length})`]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 16px', borderRadius: 4, fontSize: 13, fontFamily: D.sans, cursor: 'pointer', border: `1px solid ${tab === k ? D.plum : D.line}`, background: tab === k ? D.plum : 'transparent', color: tab === k ? '#fff' : D.ink }}>
              {label}
            </button>
          ))}
        </div>

        {notice && (
          <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(29,92,77,.07)', border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 13 }}>{notice}</div>
        )}

        <div style={{ marginTop: 14, background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: 'left', fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                {['INVOICE', 'CUSTOMER', 'AMOUNT', 'TERMS', 'DUE', 'AGE', 'STATUS', 'ACTIONS'].map((h) => <th key={h} style={{ padding: 12 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.map((inv) => {
                const org = db.get('organizations', inv.customer_id);
                const d = daysOverdue(inv);
                const isPaid = inv.status === 'paid';
                return (
                  <tr key={inv.id} style={{ borderTop: `1px solid ${D.line}` }}>
                    <td style={{ padding: 12, fontFamily: D.mono, fontSize: 12 }}>{inv.id}</td>
                    <td style={{ padding: 12, fontWeight: 500 }}>{org?.name || inv.customer_id}</td>
                    <td style={{ padding: 12 }}>{fmt.money(inv.amount)}</td>
                    <td style={{ padding: 12, fontFamily: D.mono, fontSize: 11 }}>{(inv.terms || 'net30').toUpperCase()}</td>
                    <td style={{ padding: 12, color: D.ink2 }}>{fmt.date(inv.due_date)}</td>
                    <td style={{ padding: 12, color: !isPaid && d > 0 ? '#c3382d' : D.ink2, fontWeight: !isPaid && d > 0 ? 600 : 400 }}>
                      {isPaid ? '—' : d > 0 ? `${d}d late` : `due in ${-d}d`}
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '3px 8px', borderRadius: 4, background: isPaid ? '#2d6a4f20' : d > 0 ? '#c3382d20' : `${D.terra}20`, color: isPaid ? '#2d6a4f' : d > 0 ? '#c3382d' : D.terra }}>
                        {isPaid ? 'PAID' : d > 0 ? 'OVERDUE' : 'OPEN'}
                      </span>
                    </td>
                    <td style={{ padding: 12, whiteSpace: 'nowrap' }}>
                      {!isPaid && (
                        <>
                          <button onClick={() => recordPayment(inv)} disabled={busyId === inv.id} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: D.plum, color: '#fff', border: 'none', fontFamily: D.sans }}>
                            {busyId === inv.id ? '…' : 'Record payment'}
                          </button>
                          <button onClick={() => sendReminder(inv)} disabled={busyId === inv.id} style={{ marginLeft: 8, padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', color: D.ink, border: `1px solid ${D.line}`, fontFamily: D.sans }}>
                            {inv.last_reminder_at ? `Remind again (${fmt.ago(inv.last_reminder_at)})` : 'Send reminder'}
                          </button>
                        </>
                      )}
                      {isPaid && <span style={{ fontSize: 12, color: D.ink3 }}>{inv.paid_at ? `paid ${fmt.ago(inv.paid_at)}` : 'paid'}</span>}
                      <Link to={`/invoices/${inv.id}/print`} style={{ marginLeft: 8, padding: '6px 12px', borderRadius: 6, fontSize: 12, background: 'transparent', color: D.plum, border: `1px solid ${D.line}`, textDecoration: 'none', fontFamily: D.sans }}>PDF</Link>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && <tr><td colSpan={8} style={{ padding: 24, color: D.ink3 }}>Nothing here.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
