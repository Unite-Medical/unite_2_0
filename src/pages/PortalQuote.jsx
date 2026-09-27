import {trackFunnel} from '../lib/funnelTelemetry.js';
import '../styles/workspace.css';
/**
 * Customer self-serve quoting portal — PRD-19.
 *
 * Browse the stocked catalog, add SKUs + quantities, and generate a real
 * quote priced at your account tier — no rep required. The quote is
 * persisted with an acceptance token, so "Generate quote" lands the
 * customer straight on the `/q/:token` acceptance page. A sourcing-request
 * box captures anything we don't stock.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { auth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { commerceAccessFor } from '../lib/accessPolicy.js';

const newQuoteKey = () => globalThis.crypto?.randomUUID?.() || `quick_quote_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const scopedPrice = (rows, sku, qty, orgId) => rows
  .filter((row) => row.sku === sku && (!orgId || row.org_id === orgId) && row.ok !== false && Number(row.quantity || 1) <= qty)
  .sort((a, b) => Number(b.quantity || 1) - Number(a.quantity || 1))[0] || null;

export function PortalQuote() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const session = auth.use();
  const org = auth.org();
  const commerce = commerceAccessFor(session, org);
  const { isMobile } = useViewport();
  const products = db.useTable('products', { orderBy: 'name', dir: 'asc' });
  const accountPrices = db.useTable('account_prices');

  const [query, setQuery] = useState('');
  useEffect(()=>{trackFunnel('session_started');},[]);
  const [intent,setIntent]=useState('');const [category,setCategory]=useState('');
  const [cart, setCart] = useState(() => {
    const sku = searchParams.get('sku');
    const qty = Math.max(1, Number(searchParams.get('qty')) || 1);
    return sku ? { [sku]: qty } : {};
  }); // sku -> qty
  const [busy, setBusy] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const [sourceDone, setSourceDone] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState(null);
  const [sourceIdempotencyKey] = useState(newQuoteKey);
  const [identity, setIdentity] = useState({ company_name: '', contact_name: '', email: '', website: '', shipping_zip: '' });
  const [identityError, setIdentityError] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newQuoteKey);

  useSEO({ title: 'Build a quote', description: 'Self-serve catalog quoting — priced at your account tier, accept online.', canonical: '/portal/quote', noindex: true });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? products.filter((p) => `${p.name} ${p.sku} ${p.category || ''}`.toLowerCase().includes(q)) : products;
    const pattern={diagnostics:/diagnostic|test|lab/i,ppe:/ppe|glove|mask|gown|protect/i,orthotics:/orthot|brace|recovery|support/i}[intent];
    return list.filter(p=>(!category||p.category===category)&&(!pattern||pattern.test(`${p.name} ${p.category||''}`))).slice(0, 40);
  }, [products, query, category, intent]);

  const lines = useMemo(() => Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([sku, qty]) => {
      const p = db.get('products', sku) || db.list('products', { where: { sku } })[0];
      if (!commerce.can_view_prices) return { sku, name: p?.name || sku, qty, unit: null, list: null, ext: null, contract: false, discount: 0 };
      const price = scopedPrice(accountPrices, sku, qty, org?.id);
      return {
        sku, name: p?.name || sku, qty,
        unit: price?.unit_price ?? null, list: price?.list_price ?? null,
        ext: price ? +(price.unit_price * qty).toFixed(2) : null,
        contract: price?.basis === 'contract',
        discount: price && price.list_price > price.unit_price ? Math.round((1 - price.unit_price / price.list_price) * 100) : 0,
      };
    }), [cart, org, commerce.can_view_prices, accountPrices]);

  const total = commerce.can_view_prices && lines.every((line) => line.ext != null) ? lines.reduce((a, l) => a + l.ext, 0) : null;

  function setQty(sku, qty) {
    trackFunnel(qty<=0?'item_removed':cart[sku]?'quantity_changed':'item_added');
    setCart((c) => ({ ...c, [sku]: Math.max(0, Math.round(qty || 0)) }));
    setIdempotencyKey(newQuoteKey());
    setQuoteError(null);
  }

  async function generateFor(extra = {}) {
    setQuoteError(null);
    const response = await fetch('/api/quotes/quick', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...extra,
        idempotency_key: idempotencyKey,
        lines: lines.map((line) => ({ sku: line.sku, qty: line.qty })),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.ok && payload.token) {
      trackFunnel('quote_generated');trackFunnel('business_verification_passed');
      navigate(`/q/${payload.token}`);
      return payload;
    }
    const message = {
      work_email_required: 'Use a company work email, not a personal mailbox.',
      email_website_mismatch: 'Your work email domain must match the company website.',
      business_domain_unverified: 'We could not verify that company email domain.',
      business_website_unreachable: 'We could not reach the company website.',
    }[payload.error] || 'We could not generate this quote. Check the details and try again.';
    setQuoteError(message);
    trackFunnel('business_verification_failed');
    return { ok: false, reason: payload.error || 'quick_quote_failed' };
  }

  async function generate() {
    setBusy(true);
    try{await generateFor({ shipping_zip: org?.shipping_zip || '' });}catch{setQuoteError('Could not reach the quote service. Your list is saved here; try again.');}finally{setBusy(false);}
  }

  async function verifyAndGenerate() {
    trackFunnel('business_verification_started');
    setIdentityError(null);
    setBusy(true);
    if (!identity.company_name || !identity.contact_name || !identity.email || !identity.website || !identity.shipping_zip) {
      setIdentityError('Complete company, contact, work email, website, and shipping ZIP.');
      setBusy(false);
      return;
    }
    try{await generateFor(identity);}catch{setQuoteError('Could not reach the quote service. Your list is saved here; try again.');}finally{setBusy(false);}
  }

  async function submitSourcing() {
    const email = session?.email || identity.email;
    if (!email) {
      setSourceError('Enter your company and work email in the quote form first.');
      return;
    }
    trackFunnel('noncatalog_item_added');
    setSourceBusy(true);
    setSourceError(null);
    try {
      const response = await fetch('/api/sourcing/request', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: sourceIdempotencyKey,
          path: 'source',
          organization_name: org?.name || identity.company_name,
          contact_name: session?.name || identity.contact_name,
          contact_email: email,
          product_description: sourceText,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'sourcing_request_failed');
      setSourceDone(true);
      setSourceText('');
    } catch {
      setSourceError('We could not save this sourcing request. Please try again.');
    } finally {
      setSourceBusy(false);
    }
  }

  const pad = isMobile ? 20 : 40;

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <div style={{ padding: `${isMobile ? 32 : 56}px ${pad}px 24px`, maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>SELF-SERVE QUOTING</div>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(36px, 7vw, 72px)', fontWeight: 400, letterSpacing: -1.4, margin: '12px 0 0', lineHeight: 1.02 }}>Build your quote</h1>
          <div style={{ fontSize: isMobile ? 14 : 16, color: D.ink2, marginTop: 14, maxWidth: 640 }}>
            {commerce.can_view_prices
              ? <>Add stocked items below. Pricing reflects your <strong>{org?.name}</strong> account tier ({org?.tier}).</>
              : <>Build an unpriced list first. We only reveal pricing after work-email and company verification.</>}
          </div>
        </div>

        <div style={{ maxWidth: 1280, margin: '0 auto', padding: `8px ${pad}px 80px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: 24, alignItems: 'start' }}>
          <section className="ws-card" style={{gridColumn:'1 / -1'}}><h2>What do you need?</h2><div className="ws-actions">{[['restock','Restock'],['substitute','Find a substitute'],['diagnostics','Diagnostic tests'],['ppe','PPE'],['orthotics','Braces and recovery'],['source','Source something else']].map(([id,label])=><button className={`ws-button ${intent===id?'primary':''}`} key={id} onClick={()=>{setIntent(id);setCategory('');trackFunnel('intent_selected',{intent:id});}}>{label}</button>)}</div><label>Category<select value={category} onChange={e=>{setCategory(e.target.value);trackFunnel('category_viewed',{category:e.target.value});}}><option value="">All categories</option>{[...new Set(products.map(p=>p.category).filter(Boolean))].sort().map(c=><option key={c}>{c}</option>)}</select></label><p>Your quote list stays intact when you switch categories.</p></section>
          {/* Catalog picker */}
          <div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={()=>{if(query.trim())trackFunnel('search_performed');}}
              placeholder="Search the catalog — name, SKU, or category"
              style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${D.line}`, fontSize: 15, fontFamily: D.sans, background: D.card, color: D.ink, boxSizing: 'border-box' }}
            />
            <div style={{ marginTop: 16, background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, overflow: 'hidden' }}>
              {filtered.map((p, i) => {
                const qty = cart[p.sku] || 0;
                return (
                  <div key={p.sku} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>{p.sku} · {commerce.can_view_prices ? (scopedPrice(accountPrices, p.sku, 1, org?.id) ? `${fmt.money(scopedPrice(accountPrices, p.sku, 1, org?.id).unit_price)} account price` : 'pricing loading') : 'pricing after verification'}</div>
                    </div>
                    <input
                      type="number" min="0" value={qty || ''}
                      onChange={(e) => setQty(p.sku, Number(e.target.value))}
                      placeholder="qty"
                      style={{ width: 80, padding: '8px 10px', borderRadius: 8, border: `1px solid ${D.line}`, fontSize: 14, fontFamily: D.mono, textAlign: 'right', background: D.paper, color: D.ink }}
                    />
                  </div>
                );
              })}
              {filtered.length === 0 && <div style={{ padding: 24, color: D.ink3, fontSize: 14 }}>No products match “{query}”.</div>}
            </div>

            {/* Sourcing request */}
            <div style={{ marginTop: 24, background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>CAN&apos;T FIND IT?</div>
              <div style={{ fontSize: 14, color: D.ink2, marginTop: 8 }}>Tell us what you need — our sourcing desk hunts it down globally and quotes you landed cost.</div>
              {sourceDone ? (
                <div style={{ marginTop: 12, color: '#3b8760', fontSize: 14 }}>Got it — our sourcing team will be in touch.</div>
              ) : (
                <>
                  <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} rows={3} placeholder="e.g. 5,000 units nitrile exam gloves, blue, size L, EN455"
                    style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 10, border: `1px solid ${D.line}`, fontSize: 14, fontFamily: D.sans, background: D.paper, color: D.ink, boxSizing: 'border-box', resize: 'vertical' }} />
                  <button type="button" onClick={submitSourcing} disabled={!sourceText.trim() || sourceBusy} style={{ marginTop: 10, background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '10px 18px', borderRadius: 4, cursor: sourceText.trim() && !sourceBusy ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600, opacity: sourceText.trim() && !sourceBusy ? 1 : 0.5 }}>{sourceBusy ? 'Saving…' : 'Request sourcing'}</button>
                  {sourceError && <div style={{ color: '#c3382d', fontSize: 12, marginTop: 8 }}>{sourceError}</div>}
                </>
              )}
            </div>
          </div>

          {/* Quote summary */}
          <div style={{ position: isMobile ? 'static' : 'sticky', top: 92 }}>
            <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, padding: 22 }}>
              <div style={{ fontFamily: D.display, fontSize: 24, letterSpacing: -0.4 }}>Your quote</div>
              {lines.length === 0 ? (
                <div style={{ color: D.ink3, fontSize: 14, marginTop: 14 }}>Add items from the catalog to start your quote.</div>
              ) : (
                <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                  {lines.map((l) => (
                    <div key={l.sku} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, borderBottom: `1px solid ${D.line}`, paddingBottom: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                        <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>
                          {commerce.can_view_prices && l.unit != null ? <>{l.qty.toLocaleString()} × {fmt.money(l.unit)}</> : <>{l.qty.toLocaleString()} units</>}
                          {commerce.can_view_prices && l.discount > 0 && <span style={{ color: '#3b8760' }}> · −{l.discount}%{l.contract ? ' contract' : ''}</span>}
                        </div>
                      </div>
                      {commerce.can_view_prices && l.ext != null && <div style={{ fontFamily: D.mono, fontWeight: 600 }}>{fmt.money(l.ext)}</div>}
                    </div>
                  ))}
                  {commerce.can_view_prices ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                        <span style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>TOTAL (FOB GA)</span>
                        <span style={{ fontFamily: D.display, fontSize: 28, color: D.plum }}>{total == null ? 'Pricing loading' : fmt.money(total)}</span>
                      </div>
                      <button type="button" onClick={generate} disabled={busy || total == null} style={{ marginTop: 8, background: D.plum, color: D.paper, border: 'none', padding: '14px', borderRadius: 4, cursor: busy || total == null ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 600, opacity: busy || total == null ? 0.6 : 1 }}>
                        {busy ? 'Generating…' : 'Generate quote →'}
                      </button>
                      {quoteError && <div style={{ color: '#c3382d', fontSize: 12 }}>{quoteError}</div>}
                    </>
                  ) : (
                    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                      {[
                        ['company_name', 'Company name'], ['contact_name', 'Contact name'],
                        ['email', 'Work email'], ['website', 'Company website'], ['shipping_zip', 'Shipping ZIP'],
                      ].map(([field, label]) => (
                        <input key={field} value={identity[field]} onChange={(event) => setIdentity((current) => ({ ...current, [field]: event.target.value }))} placeholder={label} inputMode={field === 'shipping_zip' ? 'postal-code' : undefined} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 11px', border: `1px solid ${D.line}`, borderRadius: 6, background: D.paper, color: D.ink }} />
                      ))}
                      {identityError && <div style={{ color: '#c3382d', fontSize: 12 }}>{identityError}</div>}
                      {quoteError && <div style={{ color: '#c3382d', fontSize: 12 }}>{quoteError}</div>}
                      <button type="button" onClick={verifyAndGenerate} disabled={busy} style={{ background: D.plum, color: D.paper, border: 'none', padding: '14px', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                        {busy ? 'Verifying…' : 'Verify business and generate quote →'}
                      </button>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: D.ink3, textAlign: 'center' }}>You&apos;ll be able to review and accept it on the next screen.</div>
                </div>
              )}
            </div>
            {!session && (
              <div style={{ marginTop: 14, fontSize: 13, color: D.ink2, textAlign: 'center' }}>
                <button type="button" onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', color: D.plum, cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}>Sign in</button> to price at your negotiated account tier.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
