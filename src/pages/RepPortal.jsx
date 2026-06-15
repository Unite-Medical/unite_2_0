/**
 * Rep portal — PRD-14 / PRD-06.
 *
 * The 1099 rep's home-office view of their own book: attributed revenue
 * + commission for a chosen window, accounts they own, recent orders and
 * open quotes for those accounts, activity, and payout history. Resolves
 * the rep from the signed-in email; a selector lets the home office (or
 * the demo) view any rep.
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { auth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { commissionFor, repOrders, repActivity, payoutHistory, bookingLinkFor } from '../lib/reps.js';

const WINDOWS = [[30, '30d'], [90, '90d'], [365, '1y']];

export function RepPortal() {
  const navigate = useNavigate();
  const session = auth.use();
  const { isMobile } = useViewport();
  const pad = isMobile ? 20 : 40;
  const reps = db.useTable('reps', { orderBy: 'name' });

  useSEO({ title: 'Rep portal', description: 'Your book of business + commissions.', canonical: '/rep', noindex: true });

  const resolved = useMemo(() => reps.find((r) => r.email === session?.email) || reps[0] || null, [reps, session]);
  const [repId, setRepId] = useState(null);
  const [days, setDays] = useState(90);
  const [bookingMsg, setBookingMsg] = useState(null);
  const rep = reps.find((r) => r.id === repId) || resolved;

  const stmt = useMemo(() => (rep ? commissionFor(rep, { sinceDays: days }) : null), [rep, days]);
  const orders = useMemo(() => (rep ? repOrders(rep.name, { sinceDays: days }) : []), [rep, days]);
  const activity = useMemo(() => (rep ? repActivity(rep, { limit: 6 }) : []), [rep]);
  const payouts = useMemo(() => (rep ? payoutHistory(rep, { limit: 6 }) : []), [rep]);

  const orgIds = useMemo(() => new Set((stmt?.accounts || []).map((a) => a.id)), [stmt]);
  const allQuotes = db.useTable('quotes', { orderBy: 'created_at', dir: 'desc' });
  const openQuotes = useMemo(() => allQuotes.filter((q) => orgIds.has(q.customer_id) && (q.status === 'sent' || q.status === 'draft')), [allQuotes, orgIds]);

  if (!session) {
    return (
      <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
        <Nav />
        <main id="main" style={{ maxWidth: 640, margin: '0 auto', padding: '80px 24px' }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>REP PORTAL</div>
          <h1 style={{ fontFamily: D.display, fontSize: 44, letterSpacing: -1, marginTop: 10 }}>Sign in to continue</h1>
          <p style={{ color: D.ink2, marginTop: 12 }}>The rep portal is for Unite Medical field reps.</p>
          <button type="button" onClick={() => navigate('/login')} style={{ marginTop: 18, background: D.plum, color: D.paper, border: 'none', padding: '12px 22px', borderRadius: 999, cursor: 'pointer', fontWeight: 600 }}>Sign in</button>
        </main>
      </div>
    );
  }

  if (!rep) {
    return (
      <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
        <Nav />
        <main id="main" style={{ maxWidth: 640, margin: '0 auto', padding: '80px 24px' }}>
          <h1 style={{ fontFamily: D.display, fontSize: 40 }}>No rep roster found.</h1>
        </main>
      </div>
    );
  }

  async function getBooking() {
    setBookingMsg('Generating…');
    try { const url = await bookingLinkFor(rep); setBookingMsg(url); } catch { setBookingMsg(rep.calendly_url); }
  }

  const card = { background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, padding: 20 };

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <div style={{ padding: `${isMobile ? 32 : 56}px ${pad}px 24px`, maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>REP PORTAL · {rep.territory?.toUpperCase()}</div>
              <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 6vw, 64px)', fontWeight: 400, letterSpacing: -1.2, margin: '12px 0 0' }}>{rep.name}</h1>
              <div style={{ fontSize: 14, color: D.ink2, marginTop: 8 }}>{rep.commission_pct}% commission · {rep.status} · since {fmt.date(rep.started_at)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {reps.length > 1 && (
                <select value={rep.id} onChange={(e) => setRepId(e.target.value)} style={{ padding: '10px 12px', borderRadius: 999, border: `1.5px solid ${D.line}`, background: D.card, color: D.ink, fontSize: 13 }}>
                  {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              <div style={{ display: 'inline-flex', border: `1.5px solid ${D.line}`, borderRadius: 999, overflow: 'hidden' }}>
                {WINDOWS.map(([d, label]) => (
                  <button key={d} type="button" onClick={() => setDays(d)} style={{ padding: '9px 14px', border: 'none', background: days === d ? D.plum : 'transparent', color: days === d ? D.paper : D.ink2, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1280, margin: '0 auto', padding: `8px ${pad}px 80px` }}>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 14 }}>
            {[
              [fmt.short(stmt.gross_usd), 'Attributed revenue', `${stmt.order_count} orders`],
              [fmt.short(stmt.commission_usd), 'Commission accrued', `@ ${rep.commission_pct}%`],
              [String(stmt.accounts.length), 'Accounts', 'in your book'],
              [String(openQuotes.length), 'Open quotes', 'awaiting acceptance'],
            ].map(([big, small, sub], i) => (
              <div key={i} style={card}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{small.toUpperCase()}</div>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 34, color: D.ink, letterSpacing: -0.6, marginTop: 8 }}>{big}</div>
                <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: 18, marginTop: 18 }}>
            {/* Book of business */}
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.line}`, fontFamily: D.display, fontSize: 20 }}>Book of business</div>
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, textAlign: 'left' }}>
                      {['ACCOUNT', 'SEGMENT', 'TIER', 'TERMS', 'LIFETIME'].map((h) => <th key={h} style={{ padding: '10px 16px' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {stmt.accounts.map((a) => (
                      <tr key={a.id} style={{ borderTop: `1px solid ${D.line}` }}>
                        <td style={{ padding: '12px 16px', fontWeight: 500 }}>{a.name}</td>
                        <td style={{ padding: '12px 16px', color: D.ink2 }}>{(a.segment || '').toUpperCase()}</td>
                        <td style={{ padding: '12px 16px' }}>{a.tier}</td>
                        <td style={{ padding: '12px 16px', color: D.ink2 }}>{(a.terms || '').toUpperCase()}</td>
                        <td style={{ padding: '12px 16px', fontFamily: D.mono }}>{fmt.short(a.total_spend || 0)}</td>
                      </tr>
                    ))}
                    {stmt.accounts.length === 0 && <tr><td colSpan={5} style={{ padding: 24, color: D.ink3 }}>No accounts assigned yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Side column */}
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={card}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>OPEN QUOTES</div>
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  {openQuotes.slice(0, 6).map((q) => (
                    <Link key={q.id} to={`/quotes/${q.id}/print?view=internal`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, textDecoration: 'none', color: D.ink, fontSize: 13 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.customer_name}</span>
                      <span style={{ fontFamily: D.mono, color: D.plum }}>{fmt.money(q.total || 0)}</span>
                    </Link>
                  ))}
                  {openQuotes.length === 0 && <div style={{ color: D.ink3, fontSize: 13 }}>No open quotes.</div>}
                </div>
              </div>

              <div style={card}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>RECENT ORDERS</div>
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  {orders.slice(0, 6).map((o) => (
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name}</span>
                      <span style={{ fontFamily: D.mono, color: D.plum }}>{fmt.money(o.total || 0)}</span>
                    </div>
                  ))}
                  {orders.length === 0 && <div style={{ color: D.ink3, fontSize: 13 }}>No orders in this window.</div>}
                </div>
              </div>

              <div style={card}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>PAYOUT HISTORY</div>
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  {payouts.map((p) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                      <span style={{ color: D.ink2 }}>{fmt.date(p.paid_at)} · {p.status}</span>
                      <span style={{ fontFamily: D.mono, color: '#3b8760' }}>{fmt.money(p.amount_usd || 0)}</span>
                    </div>
                  ))}
                  {payouts.length === 0 && <div style={{ color: D.ink3, fontSize: 13 }}>No payouts yet.</div>}
                </div>
              </div>

              <div style={card}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>BOOKING LINK</div>
                <button type="button" onClick={getBooking} style={{ marginTop: 10, background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '9px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Generate intro link</button>
                {bookingMsg && <div style={{ marginTop: 10, fontSize: 12, color: D.ink2, wordBreak: 'break-all' }}>{bookingMsg}</div>}
              </div>
            </div>
          </div>

          {/* Activity */}
          {activity.length > 0 && (
            <div style={{ ...card, marginTop: 18 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>RECENT ACTIVITY</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {activity.map((a) => (
                  <div key={a.id} style={{ fontSize: 13, color: D.ink2, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>{a.summary || a.kind || a.type || 'Activity'}</span>
                    <span style={{ color: D.ink3, fontFamily: D.mono, fontSize: 11 }}>{fmt.ago(a.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
