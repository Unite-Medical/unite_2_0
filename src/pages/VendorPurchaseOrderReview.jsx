import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { D } from '../tokens.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { verifyVendorReviewToken } from '../lib/vendorPoTokens.js';
import { useSEO } from '../lib/seo.js';

function localView(po) {
  return {
    id: po.id,
    vendor_name: po.vendor_name,
    status: po.status,
    revision: po.revision || 1,
    expected_delivery: po.expected_delivery || null,
    line_items: (po.line_items || []).map((line) => ({
      sku: line.sku, name: line.name || line.sku,
      qty: Number(line.qty || 0), cost: Number(line.cost || 0),
    })),
    total_cost: Number(po.total_cost || 0),
    currency: po.currency || po.settlement_currency || 'USD',
    vendor_response: po.vendor_response || 'pending',
    vendor_response_note: po.vendor_response_note || null,
    vendor_responded_at: po.vendor_responded_at || null,
    sent_at: po.sent_at || null,
  };
}

export function VendorPurchaseOrderReview() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [po, setPo] = useState(null);
  const [status, setStatus] = useState('loading');
  const [responder, setResponder] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useSEO({ title: `Review purchase order ${id || ''}`, description: 'Secure supplier purchase-order review.', noindex: true });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/vendor/purchase-orders/review?po_id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`);
        if (response.ok) {
          const body = await response.json();
          if (active) { setPo(body.purchase_order); setStatus('ready'); }
          return;
        }
        if (!import.meta.env.DEV) {
          if (active) setStatus('not_found');
          return;
        }
      } catch {
        if (!import.meta.env.DEV) {
          if (active) setStatus('not_found');
          return;
        }
      }
      const local = db.get('purchase_orders', id);
      if (local && ((local.vendor_review_token && local.vendor_review_token === token) || await verifyVendorReviewToken(local, token))) {
        if (active) { setPo(localView(local)); setStatus('ready'); }
      } else if (active) setStatus('not_found');
    }
    load();
    return () => { active = false; };
  }, [id, token]);

  async function respond(action) {
    if (!responder.trim()) { setError('Enter your name before responding.'); return; }
    if (action !== 'acknowledge' && !note.trim()) { setError('Add a note describing the requested change or fulfillment issue.'); return; }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/vendor/purchase-orders/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ po_id: id, token, action, responder: responder.trim(), note: note.trim() }),
      });
      if (response.ok) {
        const body = await response.json();
        setPo(body.purchase_order);
        return;
      }
      if (!import.meta.env.DEV && response.status === 409) {
        const latest = await fetch(`/api/vendor/purchase-orders/review?po_id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`);
        if (latest.ok) setPo((await latest.json()).purchase_order);
        setError('A final supplier response was already recorded. The authoritative response is shown.');
        return;
      }
      throw new Error('server_response_failed');
    } catch {
      if (!import.meta.env.DEV) {
        setError('The server did not record this response. Reload to see the authoritative purchase-order state.');
        return;
      }
      const current = db.get('purchase_orders', id);
      const authorized = current && ((current.vendor_review_token && current.vendor_review_token === token) || await verifyVendorReviewToken(current, token));
      const responseMap = { acknowledge: 'acknowledged', request_changes: 'changes_requested', cannot_fulfill: 'cannot_fulfill' };
      const response = responseMap[action];
      if (authorized && response && (!current.vendor_response || current.vendor_response === 'pending')) {
        const respondedAt = new Date().toISOString();
        const updated = db.update('purchase_orders', current.id, {
          vendor_response: response,
          vendor_response_note: note.trim() || null,
          vendor_responded_by: responder.trim(),
          vendor_responded_at: respondedAt,
          vendor_acknowledged_at: response === 'acknowledged' ? respondedAt : null,
        });
        setPo(localView(updated));
      } else if (authorized && current.vendor_response === response) {
        setPo(localView(current));
      } else {
        setError(authorized ? 'A final response has already been recorded.' : 'This secure link is invalid or expired. Ask Unite for a new link.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') return <Shell><div style={{ color: D.ink2 }}>Loading secure purchase order…</div></Shell>;
  if (status === 'not_found' || !po) return <Shell><h1 style={title}>Purchase order link not found</h1><p style={{ color: D.ink2 }}>The link is invalid or has been revoked. Contact <a href="mailto:suppliers@unitemedical.net">suppliers@unitemedical.net</a>.</p></Shell>;

  const responded = po.vendor_response && po.vendor_response !== 'pending';
  return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1.2, color: D.plum }}>SUPPLIER PURCHASE ORDER · REV {po.revision}</div>
          <h1 style={title}>{po.id}</h1>
          <div style={{ color: D.ink2 }}>{po.vendor_name}{po.expected_delivery ? ` · requested delivery ${fmt.date(po.expected_delivery, { year: true })}` : ''}</div>
        </div>
        <div style={{ padding: '7px 11px', border: `1px solid ${D.line}`, borderRadius: 6, fontFamily: D.mono, fontSize: 10 }}>{String(po.vendor_response || po.status).replaceAll('_', ' ').toUpperCase()}</div>
      </div>

      <div style={{ marginTop: 28, border: `1px solid ${D.line}`, borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>{['SKU', 'PRODUCT', 'QTY', 'UNIT COST', 'EXTENDED'].map((heading) => <th key={heading} style={{ padding: 11, textAlign: 'left' }}>{heading}</th>)}</tr></thead>
          <tbody>{po.line_items.map((line, index) => <tr key={`${line.sku}-${index}`} style={{ borderTop: `1px solid ${D.line}` }}><td style={{ padding: 11, fontFamily: D.mono }}>{line.sku}</td><td style={{ padding: 11 }}>{line.name}</td><td style={{ padding: 11 }}>{line.qty}</td><td style={{ padding: 11 }}>{fmt.money(line.cost)}</td><td style={{ padding: 11 }}>{fmt.money(line.qty * line.cost)}</td></tr>)}</tbody>
          <tfoot><tr style={{ borderTop: `2px solid ${D.ink}` }}><td colSpan={4} style={{ padding: 12, fontWeight: 600 }}>Total</td><td style={{ padding: 12, fontFamily: D.display, fontSize: 20 }}>{fmt.money(po.total_cost)}</td></tr></tfoot>
        </table>
      </div>

      {responded ? (
        <div style={{ marginTop: 24, padding: 18, borderRadius: 10, background: D.paperAlt }}>
          Response recorded: <strong>{String(po.vendor_response).replaceAll('_', ' ')}</strong>{po.vendor_response_note ? ` · ${po.vendor_response_note}` : ''}
        </div>
      ) : (
        <div style={{ marginTop: 24, padding: 20, border: `1px solid ${D.line}`, borderRadius: 10, background: D.card }}>
          <label style={{ display: 'block' }}><span style={label}>YOUR NAME</span><input value={responder} onChange={(event) => setResponder(event.target.value)} style={input} /></label>
          <label style={{ display: 'block', marginTop: 12 }}><span style={label}>NOTE FOR UNITE</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Required for changes or inability to fulfill" style={{ ...input, resize: 'vertical' }} /></label>
          {error && <div style={{ marginTop: 10, color: '#a43127', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 14 }}>
            <button disabled={busy} onClick={() => respond('acknowledge')} style={primary}>Acknowledge PO</button>
            <button disabled={busy} onClick={() => respond('request_changes')} style={secondary}>Request changes</button>
            <button disabled={busy} onClick={() => respond('cannot_fulfill')} style={{ ...secondary, color: '#a43127' }}>Cannot fulfill</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: D.ink3 }}>This page contains supplier-facing PO terms only. Reply questions to <a href="mailto:suppliers@unitemedical.net">suppliers@unitemedical.net</a>.</div>
      <Link to="/" style={{ display: 'inline-block', marginTop: 20, color: D.plum }}>unitemedical.net</Link>
    </Shell>
  );
}

function Shell({ children }) {
  return <main style={{ minHeight: '100vh', background: D.paper, color: D.ink, fontFamily: D.sans, padding: '48px 22px' }}><div style={{ maxWidth: 900, margin: '0 auto' }}>{children}</div></main>;
}

const title = { fontFamily: D.display, fontSize: 'clamp(36px,6vw,58px)', fontWeight: 400, margin: '7px 0' };
const label = { display: 'block', fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3, marginBottom: 5 };
const input = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: `1px solid ${D.line}`, borderRadius: 7, background: D.paper, color: D.ink, fontFamily: D.sans };
const primary = { background: D.plum, color: D.paper, border: 'none', borderRadius: 4, padding: '11px 16px', cursor: 'pointer', fontWeight: 600 };
const secondary = { background: 'transparent', color: D.ink, border: `1px solid ${D.line}`, borderRadius: 4, padding: '11px 16px', cursor: 'pointer', fontWeight: 600 };
