import { SORTED_STOREFRONT_PRODUCTS } from '../lib/storefrontCatalog.js';
import { CommerceHero } from '../components/shared/CommerceHero.jsx';
import {trackFunnel} from '../lib/funnelTelemetry.js';
import './commerce-public.css';
import './commerce-editorial.css';
import { HomepageFooter } from '../components/layout/HomepageFooter.jsx';
import { PRODUCT_IMG } from '../lib/imageMap.js';
import { categorize } from '../lib/taxonomy.js';
import { Icon } from '../components/shared/Icon.jsx';
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
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Nav } from '../components/layout/Nav.jsx';
import { auth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
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
  const products = SORTED_STOREFRONT_PRODUCTS;
  const accountPrices = db.useTable('account_prices');

  const [query, setQuery] = useState('');
  const [variantChoices, setVariantChoices] = useState({});
  useEffect(()=>{trackFunnel('session_started');},[]);
  const [category,setCategory]=useState('');
  const [cart, setCart] = useState(() => {
    const sku = searchParams.get('sku');
    const qty = Math.min(1000000, Math.max(1, Math.round(Number(searchParams.get('qty')) || 1)));
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
    const list = q ? products.filter((p) => `${p.name} ${p.sku} ${p.category || ''} ${(p.variants || []).map(v => `${v.sku} ${v.title}`).join(' ')}`.toLowerCase().includes(q)) : products;
    return list.filter(p=>!category||categorize(p)===category);
  }, [products, query, category]);

  const lines = useMemo(() => Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([sku, qty]) => {
      const p = products.find(p => p.sku === sku || p.variants?.some(v => v.sku === sku));
      const variant = p?.variants?.find(v => v.sku === sku);
      const name = p ? `${p.name}${variant && p.variants.length > 1 ? ` — ${variant.title}` : ''}` : sku;
      if (!commerce.can_view_prices) return { sku, name, qty, unit: null, list: null, ext: null, contract: false, discount: 0 };
      const price = scopedPrice(accountPrices, sku, qty, org?.id);
      return {
        sku, name, qty,
        unit: price?.unit_price ?? null, list: price?.list_price ?? null,
        ext: price ? +(price.unit_price * qty).toFixed(2) : null,
        contract: price?.basis === 'contract',
        discount: price && price.list_price > price.unit_price ? Math.round((1 - price.unit_price / price.list_price) * 100) : 0,
      };
    }), [cart, org, commerce.can_view_prices, accountPrices, products]);

  const total = commerce.can_view_prices && lines.every((line) => line.ext != null) ? lines.reduce((a, l) => a + l.ext, 0) : null;

  function setQty(sku, qty) {
    trackFunnel(qty<=0?'item_removed':cart[sku]?'quantity_changed':'item_added');
    setCart((c) => ({ ...c, [sku]: Math.min(1000000, Math.max(0, Math.round(qty || 0))) }));
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
      business_identity_required: 'Enter complete business details and a valid five-digit shipping ZIP.',
      business_website_invalid: 'Enter a public company website, such as company.com.',
      product_not_found: 'An item is no longer available. Remove it from your list and try again.',
      quote_only: 'An item needs a custom quote. Please use Request sourcing for that item.',
      approved_price_required: 'An item needs a custom price. Please request sourcing for that item.',
      account_not_approved: 'Your account is awaiting approval. Contact our team for a quote.',
      customer_or_distributor_required: 'Use a customer account to generate a quote, or sign out to request a business quote.',
      price_unavailable: 'An item needs a custom price. Please request sourcing for that item.',
      quick_quote_not_configured: 'Quick Quote is temporarily unavailable. Please contact our team.',
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
    if (!email || !(org?.name || identity.company_name).trim() || !(session?.name || identity.contact_name).trim()) {
      setSourceError('Enter your company, name, and work email under Business details first.');
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

  function updateIdentity(field, value) {
    setIdentity(current=>({...current,[field]:value}));
    setIdempotencyKey(newQuoteKey());
    setIdentityError(null); setQuoteError(null);
  }

  return <div className="uc-page uq-page"><Nav overlay heroSelector=".umc-masthead" /><main id="main">
    <CommerceHero eyebrow="QUICK QUOTE" title="Your next order." accent="Made simpler." description="Choose your supplies. Tell us about your business. Get a clear quote to review, with our team here to help." image="/images/homepage-2026/supply-hero-1600.webp" imageAlt="Medical supplies prepared for distribution" action={{to:'/catalog',label:'Explore the catalog'}} index="02" />
    <div className="uc-wrap"><ol className="uq-steps"><li><span>01</span> Choose your supplies</li><li><span>02</span> Verify your business</li><li><span>03</span> Review your quote</li></ol></div>
    <div className="uq-layout uc-wrap"><section className="uq-picker" aria-label="Choose products"><div className="uq-section-head"><h2>Find your supplies</h2><span>{filtered.length} products</span></div>
      <div className="uq-search-tools"><label className="uc-search"><Icon.search/><input value={query} onChange={e=>setQuery(e.target.value)} onBlur={()=>{if(query.trim())trackFunnel('search_performed');}} placeholder="Search by name or SKU" aria-label="Search quote products"/></label><label className="uq-category"><span className="uc-sr-only">Product category</span><select value={category} onChange={e=>{setCategory(e.target.value);trackFunnel('category_viewed',{category:e.target.value});}}><option value="">All categories</option>{[...new Set(products.map(categorize))].sort().map(c=><option key={c}>{c}</option>)}</select></label></div>
      <div className="uq-product-list">{filtered.map(p=>{const variant = p.variants?.length > 1 ? p.variants.find(v=>v.sku === variantChoices[p.sku]) || p.variants.find(v=>cart[v.sku]>0) || p.variants[0] : null; const sku = variant?.sku || p.sku; return <article className={`uq-product${cart[sku]?' is-selected':''}`} key={p.sku}>
        <div className="uq-thumbnail">{PRODUCT_IMG[p.sku]?<img src={PRODUCT_IMG[p.sku]} alt="" loading="lazy"/>:<span aria-hidden="true">UM</span>}</div>
        <div className="uq-product-copy"><span className="uc-eyebrow">{categorize(p)}</span><h3><Link to={`/products/${encodeURIComponent(p.sku)}`}>{p.name}</Link></h3><p>{sku}{p.pack_size&&p.pack_size!=='1 ea'?` · ${p.pack_size}`:''}</p>{p.variants?.length>1&&<label className="uq-variant"><span className="uc-sr-only">Option for {p.name}</span><select value={sku} onChange={e=>setVariantChoices(c=>({...c,[p.sku]:e.target.value}))}>{p.variants.map(v=><option key={v.variant_id||v.sku} value={v.sku}>{v.title}</option>)}</select></label>}{commerce.can_view_prices&&<p>{scopedPrice(accountPrices,sku,1,org?.id)?fmt.money(scopedPrice(accountPrices,sku,1,org?.id).unit_price):'Price on request'}</p>}</div>
        {p.quote_only||variant?.available===false?<Link className="uc-text-link" to={`/quote?sku=${encodeURIComponent(sku)}&path=source`}>Request sourcing ↗</Link>:<label className="uq-qty"><span>Quantity</span><input aria-label={`Quantity for ${p.name}`} type="number" min="0" max="1000000" step="1" value={cart[sku]||''} disabled={busy} onChange={e=>setQty(sku,Number(e.target.value))} placeholder="0" inputMode="numeric"/></label>}
      </article>})}{!filtered.length&&<div className="uc-empty"><h3>No matching supplies.</h3><p>Try a different name or SKU, or send a sourcing request below.</p><button className="uc-text-button" onClick={()=>{setQuery('');setCategory('');}}>Clear search and category ↗</button></div>}</div>
      <section className="uq-sourcing" id="sourcing"><p className="uc-eyebrow">CAN’T FIND IT?</p><h2>We’ll help you source it.</h2><p>Tell us the product, brand, and quantity you need. Our team will follow up with pricing and availability.</p>
        {sourceDone?<p className="uq-success" role="status">Request received. Our sourcing team will be in touch.</p>:<><label className="uc-sr-only" htmlFor="sourcing-description">What do you need sourced?</label><textarea id="sourcing-description" value={sourceText} onChange={e=>setSourceText(e.target.value)} rows={3} placeholder="Product, brand, quantity, and any specific requirements" maxLength={4000}/>{!session&&<p className="uq-note">Enter your company, name, and work email under Business details before sending.</p>}<button className="uc-button uc-button-outline" type="button" onClick={submitSourcing} disabled={!sourceText.trim()||sourceBusy}>{sourceBusy?'Saving request…':'Request sourcing ↗'}</button>{sourceError&&<p className="uq-error" role="alert">{sourceError}</p>}</>}
      </section>
    </section>
    <aside className="uq-summary" aria-label="Your quote"><div className="uq-summary-heading"><p className="uc-eyebrow">YOUR QUOTE</p><h2>Your selection.</h2><p aria-live="polite">{lines.length?`${lines.length} ${lines.length===1?'product':'products'} selected`:'Start with the supplies you need.'}</p></div>
      <div className="uq-summary-body">{!lines.length?<div className="uq-empty-list"><span aria-hidden="true">+</span><p>Add quantities beside any product.<br/>Your quote list will appear here.</p></div>:<ul className="uq-lines">{lines.map(l=><li key={l.sku}><div><strong>{l.name}</strong><small>{l.sku} · Qty {l.qty.toLocaleString()}{l.unit!=null?` × ${fmt.money(l.unit)}`:''}</small>{l.ext!=null&&<span>{fmt.money(l.ext)}</span>}</div><button aria-label={`Remove ${l.name}`} disabled={busy} onClick={()=>setQty(l.sku,0)}>×</button></li>)}</ul>}
      {commerce.can_view_prices?<><p className="uq-note">Pricing for {org?.name}.</p><div className="uq-total"><span>Estimated total</span><strong>{total==null?'Request pricing':fmt.money(total)}</strong></div>{lines.length > 0 && (total == null || (session && !['customer','distributor'].includes(session.role))) ? <Link className="uc-button" to={`/quote?path=source&sku=${encodeURIComponent(lines.map(l=>`${l.sku} × ${l.qty}`).join(', '))}`}>Request pricing ↗</Link> : <button className="uc-button" disabled={busy||!lines.length} onClick={generate}>{busy?'Generating your quote…':'Generate quote ↗'}</button>}{quoteError&&<p className="uq-error" role="alert">{quoteError}</p>}</>:<form onSubmit={e=>{e.preventDefault();verifyAndGenerate();}}><fieldset disabled={busy}><legend>Business details</legend><p className="uq-note">Use a work email that matches your company website to unlock pricing.</p><div className="uq-identity">{[
        ['company_name','Company name','text','organization','Your organization'],['contact_name','Your name','text','name','First and last name'],['email','Work email','email','email','you@company.com'],['website','Company website','text','url','company.com'],['shipping_zip','Shipping ZIP','text','postal-code','12345'],
      ].map(([field,label,type,autoComplete,placeholder])=><label key={field}>{label}<input required type={type} autoComplete={autoComplete} maxLength={field==='shipping_zip'?10:254} pattern={field==='shipping_zip'?'[0-9]{5}(-[0-9]{4})?':undefined} value={identity[field]} onChange={e=>updateIdentity(field,e.target.value)} placeholder={placeholder}/></label>)}</div>{identityError&&<p className="uq-error" role="alert">{identityError}</p>}{quoteError&&<p className="uq-error" role="alert">{quoteError}</p>}<button className="uc-button" type="submit" disabled={busy||!lines.length}>{busy?'Verifying your business…':'Verify & generate quote ↗'}</button></fieldset></form>}
      <p className="uq-note uq-review-note">Review your quote before accepting. Generating a quote does not place an order.</p>{!session&&<p className="uq-login">Already a customer? <Link to="/login?next=%2Fportal%2Fquote">Sign in ↗</Link></p>}
      </div>
    </aside></div>
  </main><HomepageFooter/></div>;
}
