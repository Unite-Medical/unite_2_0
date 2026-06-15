/**
 * Public quote acceptance — PRD-16 / PRD-19.
 *
 * The page a customer lands on from the acceptance link in their quote
 * email (`/q/:token`). No login: the token is the credential. Shows the
 * quote summary and a single Accept button that converts it to an order
 * via `acceptQuote()`.
 */

import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useSEO } from '../lib/seo.js';
import { findQuoteByToken, quoteIsExpired, acceptQuote } from '../lib/quoteAcceptance.js';

const SHEET = {
  maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px',
};

export function QuoteAccept() {
  const { token } = useParams();
  const quote = useMemo(() => findQuoteByToken(token), [token]);
  const items = useMemo(() => (quote ? db.list('quote_items', { where: { quote_id: quote.id } }) : []), [quote]);
  const [state, setState] = useState({ status: quote?.status === 'accepted' ? 'accepted' : 'idle', order: quote?.order_id ? db.get('orders', quote.order_id) : null });

  useSEO({ title: 'Accept your quote', description: 'Review and accept your Unite Medical quote.', canonical: `/q/${token}`, noindex: true });

  async function handleAccept() {
    setState((s) => ({ ...s, status: 'accepting' }));
    const res = await acceptQuote(token, { runPipeline: false });
    if (res.ok) setState({ status: 'accepted', order: res.order });
    else setState({ status: 'error', reason: res.reason });
  }

  const wrap = (child) => (
    <div style={{ background: D.paper, color: D.ink, fontFamily: D.sans, minHeight: '100vh' }}>
      <div style={SHEET}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>UNITE MEDICAL · QUOTE</div>
        {child}
      </div>
    </div>
  );

  if (!quote) {
    return wrap(
      <>
        <h1 style={{ fontFamily: D.display, fontSize: 40, letterSpacing: -1, marginTop: 10 }}>Quote link not found</h1>
        <p style={{ color: D.ink2, marginTop: 12 }}>This acceptance link is invalid or has been revoked. Please contact your Unite Medical rep for a fresh quote.</p>
        <Link to="/" style={{ color: D.plum, marginTop: 20, display: 'inline-block' }}>← unitemedical.net</Link>
      </>,
    );
  }

  const expired = quoteIsExpired(quote);
  const total = quote.total || items.reduce((a, b) => a + (Number(b.ext_sell) || 0), 0);

  if (state.status === 'accepted' && state.order) {
    return wrap(
      <>
        <h1 style={{ fontFamily: D.display, fontSize: 40, letterSpacing: -1, marginTop: 10 }}>Quote accepted — thank you.</h1>
        <p style={{ color: D.ink2, marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
          We&apos;ve converted quote <strong>{quote.id}</strong> into order <strong>{state.order.id}</strong>. Our team will confirm
          inventory and send tracking as soon as your shipment clears. A confirmation email is on its way.
        </p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to={`/orders/${state.order.id}/track`} style={{ background: D.plum, color: D.paper, padding: '12px 22px', borderRadius: 999, textDecoration: 'none', fontWeight: 600 }}>Track order</Link>
          <Link to={`/quotes/${quote.id}/print`} style={{ border: `1.5px solid ${D.ink}`, color: D.ink, padding: '12px 22px', borderRadius: 999, textDecoration: 'none', fontWeight: 600 }}>View quote</Link>
        </div>
      </>,
    );
  }

  return wrap(
    <>
      <h1 style={{ fontFamily: D.display, fontSize: 40, letterSpacing: -1, marginTop: 10 }}>{quote.id}</h1>
      <div style={{ color: D.ink2, marginTop: 8 }}>Prepared for <strong>{quote.customer_name}</strong> · valid until {fmt.date(quote.valid_until, { year: true })}</div>

      {quote.cover_letter && (
        <div style={{ marginTop: 24, padding: 20, background: D.paperAlt, borderRadius: 10, border: `1px solid ${D.line}`, whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 14 }}>{quote.cover_letter}</div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 28, fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: `2px solid ${D.ink}`, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
            <th style={{ padding: '10px 8px' }}>PRODUCT</th>
            <th style={{ padding: '10px 8px', textAlign: 'right' }}>QTY</th>
            <th style={{ padding: '10px 8px', textAlign: 'right' }}>UNIT</th>
            <th style={{ padding: '10px 8px', textAlign: 'right' }}>EXTENDED</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} style={{ borderBottom: `1px solid ${D.line}` }}>
              <td style={{ padding: '10px 8px' }}>{it.name}</td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: D.mono }}>{(it.target_qty || it.moq || 0).toLocaleString()}</td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: D.mono }}>${(Number(it.sell_per_unit) || 0).toFixed(2)}</td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: D.mono, fontWeight: 600 }}>{fmt.money(Number(it.ext_sell) || 0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} style={{ padding: '14px 8px', fontWeight: 600 }}>Total (FOB Georgia)</td>
            <td style={{ padding: '14px 8px', textAlign: 'right', fontFamily: D.display, fontSize: 22, color: D.plum }}>{fmt.money(total)}</td>
          </tr>
        </tfoot>
      </table>

      {expired ? (
        <div style={{ marginTop: 28, padding: 18, background: 'rgba(195,56,45,.08)', border: '1px solid rgba(195,56,45,.3)', borderRadius: 10, color: '#c3382d' }}>
          This quote expired on {fmt.date(quote.valid_until, { year: true })}. Contact your rep for refreshed pricing — FX and freight rates move.
        </div>
      ) : (
        <div style={{ marginTop: 32 }}>
          <button type="button" onClick={handleAccept} disabled={state.status === 'accepting'} style={{ background: D.plum, color: D.paper, padding: '14px 28px', borderRadius: 999, border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
            {state.status === 'accepting' ? 'Accepting…' : `Accept quote — ${fmt.money(total)}`}
          </button>
          {state.status === 'error' && (
            <div style={{ marginTop: 14, color: '#c3382d', fontSize: 14 }}>
              {state.reason === 'expired' ? 'This quote has expired.' : state.reason === 'no_items' ? 'This quote has no line items.' : 'We couldn\'t process this acceptance. Please contact your rep.'}
            </div>
          )}
          <div style={{ marginTop: 14, fontSize: 13, color: D.ink3 }}>
            By accepting you authorize Unite Medical to convert this quote into a confirmed order under the stated terms. Pricing is FOB Georgia.
          </div>
        </div>
      )}
    </>,
  );
}
