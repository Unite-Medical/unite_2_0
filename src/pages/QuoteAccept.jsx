/**
 * Public quote acceptance — PRD-16 / PRD-19.
 *
 * The page a customer lands on from the acceptance link in their quote
 * email (`/q/:token`). No login: the token is the credential.
 *
 * PRD-16 Phase 7 — the customer has all four verbs here:
 *   Accept   → converts to an order via acceptQuote()
 *   Counter  → per-line counter prices routed to the desk
 *   Decline  → with reason capture
 *   Refresh  → expired quotes get a "request updated pricing" path
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useSEO } from '../lib/seo.js';
import {
  findQuoteByToken, quoteIsExpired, acceptQuote,
  counterQuote, declineQuote, requestRefresh,
  requestSignerVerification, verifySignerCode,
} from '../lib/quoteAcceptance.js';

const SHEET = {
  maxWidth: 820, margin: '0 auto', padding: '48px 24px 80px',
};

const DECLINE_REASONS = [
  'Price too high',
  'Found another supplier',
  'Timeline too long',
  'Requirements changed',
  'Other',
];

const signerLabel = { display: 'block', fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3, marginBottom: 5 };
const signerInput = { width: '100%', boxSizing: 'border-box', padding: '10px 11px', border: `1px solid ${D.line}`, borderRadius: 7, background: D.paper, color: D.ink };

export function QuoteAccept() {
  const { token } = useParams();
  const [nonce, setNonce] = useState(0); // re-read after counter/decline/refresh
  const localQuote = useMemo(() => findQuoteByToken(token), [token, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const localItems = useMemo(() => (localQuote ? db.list('quote_items', { where: { quote_id: localQuote.id } }) : []), [localQuote]);
  const [remoteView, setRemoteView] = useState(null);
  const [viewStatus, setViewStatus] = useState('loading');
  const quote = remoteView?.quote || localQuote;
  const items = remoteView?.items || localItems;
  const [state, setState] = useState({ status: localQuote?.status === 'accepted' ? 'accepted' : 'idle', order: localQuote?.order_id ? db.get('orders', localQuote.order_id) : null });

  // Counter-offer drawer state.
  const [countering, setCountering] = useState(false);
  const [counters, setCounters] = useState({});
  const [counterNote, setCounterNote] = useState('');
  // Decline drawer state.
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState(DECLINE_REASONS[0]);
  const [declineDetail, setDeclineDetail] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [signerEmail, setSignerEmail] = useState(quote?.contact_email || '');
  const [poNumber, setPoNumber] = useState('');
  const [challengeId, setChallengeId] = useState(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [signerVerified, setSignerVerified] = useState(false);
  const [bindingAcknowledged, setBindingAcknowledged] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/quotes/acceptance?token=${encodeURIComponent(token)}`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((view) => {
        if (!active) return;
        setRemoteView(view);
        setSignerEmail((current) => current || view.quote?.contact_email || '');
        setViewStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setRemoteView(null);
        setViewStatus(localQuote ? 'ready' : 'not_found');
      });
    return () => { active = false; };
  }, [token, nonce, localQuote]);


  useSEO({ title: 'Accept your quote', description: 'Review and accept your Unite Medical quote.', canonical: `/q/${token}`, noindex: true });

  async function handleAccept() {
    setState((s) => ({ ...s, status: 'accepting' }));
    const res = await acceptQuote(token, {
      runPipeline: false,
      challengeId,
      bindingAcknowledged,
      signerName,
      signerTitle,
      signerEmail,
      poNumber,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
    if (res.ok) setState({ status: 'accepted', order: res.order });
    else setState({ status: 'error', reason: res.reason });
  }

  async function sendSignerCode() {
    setVerificationMessage(null);
    const result = await requestSignerVerification(token, signerEmail);
    if (result.ok) {
      setChallengeId(result.challenge_id);
      setSignerVerified(false);
      setVerificationMessage('Verification code sent. It expires in 10 minutes.');
    } else {
      setVerificationMessage(result.reason === 'unauthorized_signer_email'
        ? 'Use the authorized signer email on this quote or contact your Unite representative.'
        : 'Could not send a verification code.');
    }
  }

  async function confirmSignerCode() {
    const result = await verifySignerCode(challengeId, verificationCode, { token, email: signerEmail });
    setSignerVerified(result.ok);
    setVerificationMessage(result.ok ? 'Signer email verified.' : 'That code is invalid or expired.');
  }

  async function handleCounterSubmit() {
    const list = Object.entries(counters)
      .filter(([, v]) => Number(v) > 0)
      .map(([item_id, price]) => ({ item_id, price: Number(price) }));
    const res = await counterQuote(token, { counters: list, note: counterNote });
    if (res.ok) { setCountering(false); setNonce((n) => n + 1); }
    else setState({ status: 'error', reason: res.reason });
  }

  async function handleDeclineSubmit() {
    const reason = declineReason === 'Other' ? (declineDetail || 'Other') : [declineReason, declineDetail].filter(Boolean).join(' — ');
    const res = await declineQuote(token, { reason });
    if (res.ok) { setDeclining(false); setNonce((n) => n + 1); }
    else setState({ status: 'error', reason: res.reason });
  }

  async function handleRefreshRequest() {
    const res = await requestRefresh(token);
    if (res.ok) setNonce((n) => n + 1);
  }

  const wrap = (child) => (
    <div style={{ background: D.paper, color: D.ink, fontFamily: D.sans, minHeight: '100vh' }}>
      <div style={SHEET}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>UNITE MEDICAL · QUOTE</div>
        {child}
      </div>
    </div>
  );

  if (viewStatus === 'loading') {
    return wrap(<p style={{ color: D.ink2, marginTop: 20 }}>Loading secure quote…</p>);
  }

  if (!quote || viewStatus === 'not_found') {
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
  const complianceCleared = items.filter((it) => it.fda_validated).length;
  const canAccept = quote.acceptance_available !== false && signerVerified && bindingAcknowledged && signerName.trim() && signerTitle.trim() && poNumber.trim();

  if (state.status === 'accepted' && state.order) {
    return wrap(
      <>
        <h1 style={{ fontFamily: D.display, fontSize: 40, letterSpacing: -1, marginTop: 10 }}>Quote accepted — thank you.</h1>
        <p style={{ color: D.ink2, marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
          We&apos;ve converted quote <strong>{quote.id}</strong> into order <strong>{state.order.id}</strong>. Our team will confirm
          inventory and send tracking as soon as your shipment clears. A confirmation email is on its way.
        </p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to={`/orders/${state.order.id}/track`} style={{ background: D.plum, color: D.paper, padding: '12px 22px', borderRadius: 4, textDecoration: 'none', fontWeight: 600 }}>Track order</Link>
          <Link to={`/quotes/${quote.id}/print`} style={{ border: `1.5px solid ${D.ink}`, color: D.ink, padding: '12px 22px', borderRadius: 4, textDecoration: 'none', fontWeight: 600 }}>View quote</Link>
        </div>
      </>,
    );
  }

  if (quote.status === 'declined') {
    return wrap(
      <>
        <h1 style={{ fontFamily: D.display, fontSize: 40, letterSpacing: -1, marginTop: 10 }}>Quote declined</h1>
        <p style={{ color: D.ink2, marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
          You declined quote <strong>{quote.id}</strong>{quote.decline_reason ? <> ({quote.decline_reason})</> : null}. If circumstances change, your rep can issue a fresh quote any time.
        </p>
        <Link to="/" style={{ color: D.plum, marginTop: 20, display: 'inline-block' }}>← unitemedical.net</Link>
      </>,
    );
  }

  return wrap(
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: D.display, fontSize: 40, letterSpacing: -1, marginTop: 10, marginBottom: 0 }}>{quote.id}</h1>
        {quote.revision > 1 && (
          <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, border: `1px solid ${D.line}`, borderRadius: 3, padding: '3px 8px' }}>REV {quote.revision}</span>
        )}
        {quote.status === 'countered' && (
          <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: '#7c5b1d', background: '#fdf6e3', border: '1px solid #ecd9a8', borderRadius: 3, padding: '3px 8px' }}>COUNTER UNDER REVIEW</span>
        )}
      </div>
      <div style={{ color: D.ink2, marginTop: 8 }}>Prepared for <strong>{quote.customer_name}</strong> · valid until {fmt.date(quote.valid_until, { year: true })}{quote.eta ? <> · ETA {fmt.date(quote.eta, { year: true })}</> : null}</div>

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
            {countering && <th style={{ padding: '10px 8px', textAlign: 'right' }}>YOUR PRICE</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} style={{ borderBottom: `1px solid ${D.line}` }}>
              <td style={{ padding: '10px 8px' }}>
                {it.name}
                {Number(it.counter_price) > 0 && !countering && (
                  <span style={{ marginLeft: 8, fontFamily: D.mono, fontSize: 9, color: '#7c5b1d', background: '#fdf6e3', borderRadius: 3, padding: '2px 6px' }}>countered ${Number(it.counter_price).toFixed(2)}</span>
                )}
              </td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: D.mono }}>{(it.target_qty || it.moq || 0).toLocaleString()}</td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: D.mono }}>${(Number(it.sell_per_unit) || 0).toFixed(2)}</td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: D.mono, fontWeight: 600 }}>{fmt.money(Number(it.ext_sell) || 0)}</td>
              {countering && (
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={counters[it.id] ?? ''}
                    onChange={(e) => setCounters((c) => ({ ...c, [it.id]: e.target.value }))}
                    placeholder={`$${(Number(it.sell_per_unit) || 0).toFixed(2)}`}
                    style={{ width: 96, padding: '7px 8px', border: `1px solid ${D.line}`, borderRadius: 6, fontFamily: D.mono, fontSize: 12, textAlign: 'right', background: D.card, color: D.ink }}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={countering ? 4 : 3} style={{ padding: '14px 8px', fontWeight: 600 }}>Total (FOB Georgia)</td>
            <td style={{ padding: '14px 8px', textAlign: 'right', fontFamily: D.display, fontSize: 22, color: D.plum }}>{fmt.money(total)}</td>
          </tr>
        </tfoot>
      </table>

      {items.length > 0 && (
        <div style={{ marginTop: 18, display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>
          <span>FDA: {complianceCleared}/{items.length} lines verified</span>
          {quote.freight_mode && <span>Freight: {quote.freight_mode}</span>}
          {quote.eta && <span>ETA: {fmt.date(quote.eta, { year: true })}</span>}
        </div>
      )}

      {quote.account_completion_required ? (
        <div style={{ marginTop: 28, padding: 20, background: D.card, border: `1px solid ${D.line}`, borderRadius: 10 }}>
          <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>ACCOUNT SETUP REQUIRED</div>
          <p style={{ color: D.ink2, fontSize: 14, lineHeight: 1.6, margin: '10px 0 0' }}>
            Your company and work email are verified, so this pricing is available to review. Finish the company account setup before a signer can accept the quote or create an order.
          </p>
          <Link to={`/register?quote_token=${encodeURIComponent(token)}&email=${encodeURIComponent(quote.contact_email || '')}`} style={{ display: 'inline-block', marginTop: 14, background: D.plum, color: D.paper, padding: '12px 22px', borderRadius: 4, textDecoration: 'none', fontWeight: 600 }}>
            Finish account setup →
          </Link>
        </div>
      ) : expired ? (
        <div style={{ marginTop: 28, padding: 18, background: 'rgba(195,56,45,.08)', border: '1px solid rgba(195,56,45,.3)', borderRadius: 10 }}>
          <div style={{ color: '#c3382d' }}>
            This quote expired on {fmt.date(quote.valid_until, { year: true })}. FX and freight rates move — request refreshed pricing and we&apos;ll re-run the numbers.
          </div>
          <div style={{ marginTop: 14 }}>
            {quote.refresh_requested_at ? (
              <div style={{ fontSize: 13, color: D.ink2 }}>Refresh requested {fmt.date(quote.refresh_requested_at, { year: true })} — your rep is on it. This link will update automatically.</div>
            ) : (
              <button type="button" onClick={handleRefreshRequest} style={{ background: D.ink, color: D.paper, padding: '12px 22px', borderRadius: 4, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Request refreshed pricing
              </button>
            )}
          </div>
        </div>
      ) : quote.status === 'countered' ? (
        <div style={{ marginTop: 28, padding: 18, background: '#fdf6e3', border: '1px solid #ecd9a8', borderRadius: 10, color: '#7c5b1d', fontSize: 14, lineHeight: 1.6 }}>
          Your counter-offer is with our team. We&apos;ll respond by email — this link will update with the revised pricing.
        </div>
      ) : countering ? (
        <div style={{ marginTop: 24, padding: 20, border: `1px solid ${D.line}`, borderRadius: 10, background: D.card }}>
          <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>COUNTER-OFFER</div>
          <p style={{ fontSize: 13, color: D.ink2, margin: '10px 0 0', lineHeight: 1.6 }}>
            Enter your target unit price on the lines above (leave others blank), add any context, and submit. Our team reviews every counter within one business day.
          </p>
          <textarea
            value={counterNote}
            onChange={(e) => setCounterNote(e.target.value)}
            placeholder="Optional context — target budget, competing offer, volume flexibility…"
            rows={3}
            style={{ width: '100%', marginTop: 12, padding: 10, border: `1px solid ${D.line}`, borderRadius: 8, fontFamily: 'inherit', fontSize: 13, color: D.ink, background: D.paper, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleCounterSubmit}
              disabled={!Object.values(counters).some((v) => Number(v) > 0)}
              style={{ background: D.plum, color: D.paper, padding: '12px 22px', borderRadius: 4, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: Object.values(counters).some((v) => Number(v) > 0) ? 1 : 0.5 }}
            >
              Submit counter-offer
            </button>
            <button type="button" onClick={() => { setCountering(false); setCounters({}); }} style={{ background: 'transparent', color: D.ink2, padding: '12px 22px', borderRadius: 4, border: `1px solid ${D.line}`, fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : declining ? (
        <div style={{ marginTop: 24, padding: 20, border: `1px solid ${D.line}`, borderRadius: 10, background: D.card }}>
          <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>DECLINE QUOTE</div>
          <label style={{ display: 'block', marginTop: 12 }}>
            <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>REASON</div>
            <select value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} style={{ width: '100%', marginTop: 6, padding: '10px 12px', border: `1px solid ${D.line}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: D.paper, color: D.ink, cursor: 'pointer' }}>
              {DECLINE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <textarea
            value={declineDetail}
            onChange={(e) => setDeclineDetail(e.target.value)}
            placeholder="Anything else we should know? (optional)"
            rows={2}
            style={{ width: '100%', marginTop: 12, padding: 10, border: `1px solid ${D.line}`, borderRadius: 8, fontFamily: 'inherit', fontSize: 13, color: D.ink, background: D.paper, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={handleDeclineSubmit} style={{ background: '#c3382d', color: '#fff', padding: '12px 22px', borderRadius: 4, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Decline quote
            </button>
            <button type="button" onClick={() => setDeclining(false)} style={{ background: 'transparent', color: D.ink2, padding: '12px 22px', borderRadius: 4, border: `1px solid ${D.line}`, fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 32 }}>
          <div style={{ padding: 20, border: `1px solid ${D.line}`, borderRadius: 10, background: D.card }}>
            <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>AUTHORIZED SIGNER</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10, marginTop: 12 }}>
              <label><span style={signerLabel}>LEGAL NAME</span><input value={signerName} onChange={(event) => setSignerName(event.target.value)} style={signerInput} /></label>
              <label><span style={signerLabel}>TITLE</span><input value={signerTitle} onChange={(event) => setSignerTitle(event.target.value)} style={signerInput} /></label>
              <label><span style={signerLabel}>SIGNER EMAIL</span><input type="email" value={signerEmail} onChange={(event) => { setSignerEmail(event.target.value); setSignerVerified(false); setChallengeId(null); }} style={signerInput} /></label>
              <label><span style={signerLabel}>CUSTOMER PO NUMBER</span><input value={poNumber} onChange={(event) => setPoNumber(event.target.value)} style={signerInput} /></label>
            </div>
            {!challengeId ? (
              <button type="button" onClick={sendSignerCode} disabled={!signerEmail.trim()} style={{ marginTop: 12, background: D.ink, color: D.paper, border: 'none', borderRadius: 4, padding: '10px 15px', cursor: 'pointer' }}>Send verification code</button>
            ) : !signerVerified ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <input inputMode="numeric" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ''))} placeholder="6-digit code" style={{ ...signerInput, width: 160 }} />
                <button type="button" onClick={confirmSignerCode} disabled={verificationCode.length !== 6} style={{ background: D.ink, color: D.paper, border: 'none', borderRadius: 4, padding: '10px 15px', cursor: 'pointer' }}>Verify signer</button>
                <button type="button" onClick={sendSignerCode} style={{ background: 'transparent', border: `1px solid ${D.line}`, borderRadius: 4, padding: '10px 15px', cursor: 'pointer' }}>Send again</button>
              </div>
            ) : <div style={{ marginTop: 12, color: '#2d6a4f', fontSize: 13 }}>Verified signer email ✓</div>}
            {verificationMessage && <div style={{ marginTop: 8, color: D.ink2, fontSize: 12 }}>{verificationMessage}</div>}

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 18, fontSize: 13, color: D.ink2, lineHeight: 1.55 }}>
              <input type="checkbox" checked={bindingAcknowledged} onChange={(event) => setBindingAcknowledged(event.target.checked)} style={{ marginTop: 3 }} />
              <span>I am authorized to bind the customer. Accepted sourced and backordered lines are binding, Unite may issue supplier purchase orders in reliance on this acceptance, and committed lines cannot be cancelled.</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
            <button type="button" onClick={handleAccept} disabled={state.status === 'accepting' || !canAccept} style={{ background: D.plum, color: D.paper, padding: '14px 28px', borderRadius: 4, border: 'none', fontSize: 16, fontWeight: 600, cursor: canAccept ? 'pointer' : 'not-allowed', opacity: canAccept ? 1 : 0.5 }}>
              {state.status === 'accepting' ? 'Accepting…' : `Accept quote — ${fmt.money(total)}`}
            </button>
            <button type="button" onClick={() => setCountering(true)} style={{ background: 'transparent', color: D.ink, padding: '14px 24px', borderRadius: 4, border: `1.5px solid ${D.ink}`, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              Counter-offer
            </button>
            <button type="button" onClick={() => setDeclining(true)} style={{ background: 'transparent', color: D.ink3, padding: '14px 18px', borderRadius: 4, border: 'none', fontSize: 14, cursor: 'pointer', textDecoration: 'underline' }}>
              Decline
            </button>
          </div>
          {state.status === 'error' && (
            <div style={{ marginTop: 14, color: '#c3382d', fontSize: 14 }}>
              {state.reason === 'expired' ? 'This quote has expired.' : state.reason === 'no_items' ? 'This quote has no line items.' : state.reason === 'po_required' ? 'Customer PO number is required.' : state.reason === 'signer_verification_required' ? 'Verify the authorized signer email.' : 'We couldn\'t process this action. Please contact your rep.'}
            </div>
          )}
          <div style={{ marginTop: 14, fontSize: 13, color: D.ink3 }}>
            Acceptance stores signer identity, verified email event, customer PO, quote revision, immutable line hash, terms version, timestamp, and device record.
          </div>
        </div>
      )}
    </>,
  );
}
