/**
 * Admin · 1099 Rep Network — brief §2 priority #5.
 *
 * Roster, attributed revenue, commission accruals, and activity for
 * every 1099 rep — the "full visibility from home office" view.
 * Commission statements email through the Gmail client (real API when
 * the Google grant is configured); booking links come from Calendly.
 */

import { useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { networkRollup, repActivity, sendCommissionStatement, bookingLinkFor, payCommission } from '../../lib/reps.js';
import { useViewport } from '../../lib/viewport.js';

const WINDOWS = [30, 60, 90];

export function AdminReps() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const [windowDays, setWindowDays] = useState(30);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  // Subscriptions: the rollup recomputes on every render, and these
  // hooks re-render the page whenever the underlying tables change.
  db.useTable('reps');
  db.useTable('orders');
  db.useTable('activities', { orderBy: 'created_at', dir: 'desc', limit: 1 });
  const meetings = db.useTable('calendar_events', { orderBy: 'start_at', dir: 'desc', limit: 50 });
  const payouts = db.useTable('rep_payouts', { orderBy: 'paid_at', dir: 'desc', limit: 20 });

  const rollup = networkRollup({ sinceDays: windowDays });
  const { statements, totals } = rollup;
  const activeReps = statements.filter((s) => s.rep.status === 'active' || s.rep.status === 'ramping');

  async function emailStatement(rep) {
    setBusy(`stmt_${rep.id}`);
    try {
      const { statement } = await sendCommissionStatement(rep, { sinceDays: windowDays });
      setToast(`Statement sent to ${rep.email} — $${statement.commission_usd.toLocaleString()} owed.`);
    } catch (err) {
      setToast(`Statement failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function payRep(rep) {
    setBusy(`pay_${rep.id}`);
    try {
      const result = await payCommission(rep, { sinceDays: windowDays });
      if (!result.ok) {
        setToast(`Nothing to pay for ${rep.name} in the ${windowDays}-day window.`);
      } else {
        const simulated = result.payout.status === 'simulated';
        setToast(
          `${simulated ? 'Simulated' : 'Sent'} Stripe transfer ${result.transfer.id} — $${result.payout.amount_usd.toLocaleString()} to ${rep.name}.`
          + (result.onboarding_url ? ' Connect onboarding link logged for the rep.' : ''),
        );
      }
    } catch (err) {
      setToast(`Payout failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function copyBookingLink(rep) {
    setBusy(`link_${rep.id}`);
    try {
      const url = await bookingLinkFor(rep);
      await navigator.clipboard?.writeText(url);
      setToast(`Booking link copied — ${url}`);
    } catch (err) {
      setToast(`Couldn't fetch link: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell active="reps">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 48 : 64}px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>SALES · 1099 REP NETWORK</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', marginBottom: 22, flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>Rep network.</h1>
          <div style={{ display: 'flex', gap: 6 }}>
            {WINDOWS.map((w) => (
              <button key={w} onClick={() => setWindowDays(w)} style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, padding: '6px 14px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${windowDays === w ? D.plum : D.line}`, background: windowDays === w ? D.plum : 'transparent', color: windowDays === w ? D.paper : D.ink2 }}>
                {w}D
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 14 }}>
          {[
            [String(activeReps.length), 'Reps in field', `${statements.length} total roster`],
            [fmt.short(totals.gross_usd), `Attributed revenue · ${windowDays}d`, `${totals.order_count} orders`],
            [fmt.short(totals.commission_usd), 'Commissions accrued', 'paid via Stripe on the 5th'],
            [String(meetings.length), 'Meetings on calendar', 'Calendly + Google Calendar'],
          ].map(([b, s, sub]) => (
            <div key={s} style={{ padding: isMobile ? 16 : 22, background: D.card, borderRadius: 14, border: `1px solid ${D.line}` }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{s.toUpperCase()}</div>
              <div style={{ fontFamily: D.display, fontSize: isMobile ? 24 : 36, color: D.ink, letterSpacing: -0.6, marginTop: 8 }}>{b}</div>
              <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>

        {toast && (
          <div style={{ padding: '10px 14px', background: '#e8f5ed', color: '#1d4731', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
            {toast}
            <button onClick={() => setToast(null)} style={{ marginLeft: 12, background: 'transparent', border: 'none', color: '#1d4731', cursor: 'pointer', fontFamily: D.mono, fontSize: 11 }}>DISMISS</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
          {statements.map(({ rep, order_count, gross_usd, commission_usd, accounts }) => {
            const recent = repActivity(rep, { limit: 3 });
            return (
              <AdminCard key={rep.id} title={`${rep.name} · ${rep.territory}`}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr 1fr auto', gap: 18, alignItems: 'start' }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, padding: '3px 10px', borderRadius: 999, background: rep.status === 'active' ? '#e8f5ed' : rep.status === 'ramping' ? '#fdf3e3' : `${D.plum}15`, color: rep.status === 'active' ? '#1d4731' : rep.status === 'ramping' ? '#7a5210' : D.plum }}>
                        {rep.status.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 12, color: D.ink3, fontFamily: D.mono }}>{rep.email}</span>
                    </div>
                    <div style={{ fontSize: 12, color: D.ink2, marginTop: 10 }}>
                      {accounts.length} accounts · focus: {rep.segment_focus} · {rep.commission_pct}% commission
                    </div>
                    <div style={{ fontSize: 12, color: D.ink3, marginTop: 4 }}>
                      {accounts.slice(0, 3).map((a) => a.name).join(' · ')}{accounts.length > 3 ? ` · +${accounts.length - 3} more` : ''}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>ATTRIBUTED · {windowDays}D</div>
                    <div style={{ fontFamily: D.display, fontSize: 26, color: D.ink, marginTop: 6 }}>{fmt.short(gross_usd)}</div>
                    <div style={{ fontSize: 12, color: D.ink2 }}>{order_count} orders</div>
                  </div>

                  <div>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>COMMISSION OWED</div>
                    <div style={{ fontFamily: D.display, fontSize: 26, color: D.plum, marginTop: 6 }}>${commission_usd.toLocaleString()}</div>
                    {recent[0] && <div style={{ fontSize: 11, color: D.ink3, marginTop: 4 }}>last activity: {recent[0].subject} · {fmt.ago(recent[0].created_at)}</div>}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 170 }}>
                    <button onClick={() => payRep(rep)} disabled={busy === `pay_${rep.id}` || commission_usd <= 0} style={{ fontSize: 12, fontFamily: D.mono, letterSpacing: 0.8, padding: '9px 14px', background: commission_usd > 0 ? '#1d4731' : D.line, color: D.paper, border: 'none', borderRadius: 999, cursor: commission_usd > 0 ? 'pointer' : 'default', opacity: busy === `pay_${rep.id}` ? 0.6 : 1 }}>
                      {busy === `pay_${rep.id}` ? 'PAYING…' : 'PAY VIA STRIPE'}
                    </button>
                    <button onClick={() => emailStatement(rep)} disabled={busy === `stmt_${rep.id}`} style={{ fontSize: 12, fontFamily: D.mono, letterSpacing: 0.8, padding: '9px 14px', background: D.plum, color: D.paper, border: 'none', borderRadius: 999, cursor: 'pointer', opacity: busy === `stmt_${rep.id}` ? 0.6 : 1 }}>
                      {busy === `stmt_${rep.id}` ? 'SENDING…' : 'EMAIL STATEMENT'}
                    </button>
                    <button onClick={() => copyBookingLink(rep)} disabled={busy === `link_${rep.id}`} style={{ fontSize: 12, fontFamily: D.mono, letterSpacing: 0.8, padding: '9px 14px', background: 'transparent', color: D.plum, border: `1px solid ${D.plum}`, borderRadius: 999, cursor: 'pointer', opacity: busy === `link_${rep.id}` ? 0.6 : 1 }}>
                      {busy === `link_${rep.id}` ? 'FETCHING…' : 'BOOKING LINK'}
                    </button>
                  </div>
                </div>
              </AdminCard>
            );
          })}
        </div>

        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: D.display, fontSize: 22, letterSpacing: -0.4 }}>Payout history</div>
          <div style={{ fontSize: 12, color: D.ink3, marginTop: 4 }}>
            Stripe Connect transfers — Express accounts are provisioned on first payout; rows marked SIMULATED ran without STRIPE_SECRET_KEY.
          </div>
          <div style={{ marginTop: 12, background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr style={{ textAlign: 'left', fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                  {['REP', 'TRANSFER', 'AMOUNT', 'WINDOW', 'STATUS', 'PAID'].map((h) => <th key={h} style={{ padding: '12px' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} style={{ borderTop: `1px solid ${D.line}` }}>
                    <td style={{ padding: 12 }}>{p.rep_name}</td>
                    <td style={{ padding: 12, fontFamily: D.mono, fontSize: 11 }}>{p.stripe_transfer_id}</td>
                    <td style={{ padding: 12, fontWeight: 600 }}>${(p.amount_usd || 0).toLocaleString()}</td>
                    <td style={{ padding: 12, color: D.ink2 }}>{p.window_days}d · {p.order_count} orders</td>
                    <td style={{ padding: 12 }}>
                      <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: p.status === 'paid' ? '#e8f5ed' : '#fdf3e3', color: p.status === 'paid' ? '#1d4731' : '#7a5210' }}>
                        {(p.status || 'paid').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: 12, color: D.ink2 }}>{fmt.ago(p.paid_at)}</td>
                  </tr>
                ))}
                {payouts.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 24, color: D.ink3 }}>No payouts yet — hit "Pay via Stripe" on a rep with accrued commission.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
