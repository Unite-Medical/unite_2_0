/**
 * Account · Quotes — PRD-14 / PRD-19.
 *
 * The customer's quote history: every quote for their org, with status,
 * validity, and one-click links to accept (if still open) or view the
 * branded print/PDF version.
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

const STATUS_COLOR = {
  draft: D.ink3, sent: '#1d5c4d', accepted: '#3b8760', expired: '#b3592b', declined: '#c3382d',
};

export function AccountQuotes() {
  const navigate = useNavigate();
  const session = auth.use();
  const { isMobile } = useViewport();
  const orgId = session?.org_id || 'org_atlsurgical';
  const pad = isMobile ? 20 : 40;

  const all = db.useTable('quotes', { orderBy: 'created_at', dir: 'desc' });
  const quotes = useMemo(() => all.filter((q) => q.customer_id === orgId), [all, orgId]);

  useSEO({ title: 'Your quotes', description: 'Quote history and acceptance.', canonical: '/account/quotes', noindex: true });

  const [mountedAt] = useState(() => Date.now());
  const isExpired = (q) => q.valid_until && new Date(q.valid_until).getTime() < mountedAt;

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <div style={{ padding: `${isMobile ? 32 : 56}px ${pad}px 24px`, maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>YOUR ACCOUNT</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 6vw, 60px)', fontWeight: 400, letterSpacing: -1.2, margin: '12px 0 0' }}>Quotes</h1>
            <button type="button" onClick={() => navigate('/portal/quote')} style={{ background: D.plum, color: D.paper, border: 'none', padding: '12px 20px', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Build a new quote</button>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: `8px ${pad}px 80px` }}>
          <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, overflow: 'auto' }}>
            <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, textAlign: 'left' }}>
                  {['QUOTE', 'CREATED', 'ITEMS', 'TOTAL', 'VALID UNTIL', 'STATUS', ''].map((h) => <th key={h} style={{ padding: '12px 16px' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {quotes.map((q, i) => {
                  const status = isExpired(q) && q.status !== 'accepted' ? 'expired' : (q.status || 'draft');
                  const color = STATUS_COLOR[status] || D.ink3;
                  const canAccept = status === 'sent' || status === 'draft';
                  return (
                    <tr key={q.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                      <td style={{ padding: '14px 16px', fontFamily: D.mono, fontSize: 12 }}>{q.id}</td>
                      <td style={{ padding: '14px 16px', color: D.ink2 }}>{fmt.date(q.created_at)}</td>
                      <td style={{ padding: '14px 16px' }}>{q.line_count ?? '—'}</td>
                      <td style={{ padding: '14px 16px', fontFamily: D.display, fontSize: 16, color: D.plum }}>{fmt.money(q.total || 0)}</td>
                      <td style={{ padding: '14px 16px', color: D.ink2 }}>{fmt.date(q.valid_until)}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '3px 8px', borderRadius: 4, background: `${color}20`, color }}>{status.toUpperCase()}</span>
                      </td>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        {canAccept && q.acceptance_token && (
                          <Link to={`/q/${q.acceptance_token}`} style={{ color: D.plum, fontWeight: 600, marginRight: 14, textDecoration: 'none' }}>Accept</Link>
                        )}
                        <Link to={`/quotes/${q.id}/print`} style={{ color: D.ink2, textDecoration: 'none' }}>View</Link>
                      </td>
                    </tr>
                  );
                })}
                {quotes.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: D.ink3 }}>No quotes yet. <Link to="/portal/quote" style={{ color: D.plum }}>Build your first quote →</Link></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
