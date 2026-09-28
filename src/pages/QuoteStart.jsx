import { captureUniteEvent } from '../lib/analytics/index.js';
// A5 quote router — PRD-28 §5.4. Replaces the single generic quote form with
// a 3-path chooser. Each path asks only its relevant fields and tags the lead
// type in HubSpot. Copy sells capability/outcome only — never the engine
// mechanism (§1.4). The button label everywhere stays "Start a quote".
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Nav } from '../components/layout/Nav.jsx';
import { HomepageFooter } from '../components/layout/HomepageFooter.jsx';
import { CommerceHero } from '../components/shared/CommerceHero.jsx';
import './commerce-public.css';
import './commerce-editorial.css';

import { useSEO } from '../lib/seo.js';

// The three quote paths. Lead-type tags flow to HubSpot + the leads table so
// they reconcile with the Contact reason dropdown (§3.5).
const PATHS = [
  {
    id: 'source',
    n: '01',
    h: 'Find a product.',
    p: 'You know exactly what you need — a brand, a SKU, a hard-to-find item. We find it and come back with a firm price and delivery window.',
    tag: 'Quote · source a product or brand',
  },
  {
    id: 'custom',
    n: '02',
    h: 'Make it yours.',
    p: 'Product built to your specification, under your label or a Unite label. From spec to landed delivery, we run the whole chain.',
    tag: 'Quote · custom / made to spec',
  },
  {
    id: 'shortage',
    n: '03',
    h: 'Close a supply gap.',
    p: 'Backordered somewhere else? Paste or upload your shortage list and we return a quote — stocked items matched against our own live inventory, the rest sourced.',
    tag: 'Shortage list',
  },
];

function PathForm({ path, prefillSku }) {
  const [form, setForm] = useState({
    item: prefillSku || '',
    qty: '',
    spec: '',
    label_pref: 'My label',
    org: '',
    name: '',
    email: '',
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const [idempotencyKey] = useState(() => globalThis.crypto?.randomUUID?.() || `source_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const notes = path.id === 'source'
        ? `Item/brand: ${form.item}\nQty: ${form.qty}`
        : `Spec: ${form.spec}\nQty: ${form.qty}\nLabel: ${form.label_pref}`;
      const response = await fetch('/api/sourcing/request', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          path: path.id,
          organization_name: form.org || form.name,
          contact_name: form.name,
          contact_email: form.email,
          product_description: path.id === 'source' ? form.item : form.spec,
          quantity_text: form.qty,
          label_preference: path.id === 'custom' ? form.label_pref : null,
          notes,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'sourcing_request_failed');
      setDone(payload.request.id);
      captureUniteEvent('quote_requested');
    } catch {
      setError('We could not save this request. Please check your work email and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) return <div className="uq-success us-confirmation" role="status"><p className="uc-eyebrow">REQUEST RECEIVED</p><h3>You’re in good hands.</h3><p>Your request is with our team. We’ll follow up with pricing and next steps.</p><small>Reference {done}</small></div>;
  return <form className="us-request-form" onSubmit={submit}><fieldset disabled={busy}><legend>{path.id==='source'?'What can we find for you?':'Tell us about your project.'}</legend><div className="us-fields">
    {path.id==='source'?<label className="us-wide">Product, brand, or SKU<input required maxLength={1000} placeholder="Product name, brand, or item number" value={form.item} onChange={e=>set('item',e.target.value)}/></label>:<label className="us-wide">Product specifications<textarea required rows={4} maxLength={4000} placeholder="Materials, sizes, packaging, and requirements" value={form.spec} onChange={e=>set('spec',e.target.value)}/></label>}
    <label>Quantity needed<input required maxLength={200} placeholder="e.g. 500 boxes per month" value={form.qty} onChange={e=>set('qty',e.target.value)}/></label>
    {path.id==='custom'&&<label>Label preference<select value={form.label_pref} onChange={e=>set('label_pref',e.target.value)}>{['My label','A Unite label','Not sure yet'].map(option=><option key={option}>{option}</option>)}</select></label>}
    <label>Organization<input autoComplete="organization" maxLength={200} value={form.org} onChange={e=>set('org',e.target.value)} placeholder="Your company or facility"/></label>
    <label>Your name<input required autoComplete="name" maxLength={200} value={form.name} onChange={e=>set('name',e.target.value)} placeholder="First and last name"/></label>
    <label>Work email<input required type="email" autoComplete="email" maxLength={254} value={form.email} onChange={e=>set('email',e.target.value)} placeholder="you@company.com"/></label>
  </div>{error&&<p className="uq-error" role="alert">{error}</p>}<button className="uc-button" type="submit" disabled={busy}>{busy?'Sending your request…':'Request a quote'} <span>↗</span></button><p className="uq-note">Our team will review your request and follow up. Please do not include patient information.</p></fieldset></form>;
}

export function QuoteStart() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialPath = PATHS.some((p) => p.id === params.get('path')) ? params.get('path') : null;
  const [selected, setSelected] = useState(initialPath);
  const prefillSku = params.get('sku') || '';

  useSEO({
    title: 'Start a quote · Unite Medical',
    description:
      'Three ways to quote with Unite: source a specific product or brand, get a custom made-to-spec quote under your label or ours, or send a shortage list. Compliance-checked, all-in landed pricing.',
    canonical: '/quote',
  });

  const active = PATHS.find((p) => p.id === selected);

  return <div className="uc-page us-page"><Nav overlay heroSelector=".umc-masthead"/><main id="main">
    <CommerceHero eyebrow="SOURCE & QUOTE" title="Tell us what you need." accent="We’ll take it from here." description="A product you can’t find. A specification that needs care. A supply gap that needs closing. Start with Unite." image="/images/homepage-2026/supply-hero-1600.webp" imageAlt="Supplies being prepared for distribution" action={{to:'/portal/quote',label:'Build a catalog quote'}} index="03"/>
    <section className="uc-wrap us-paths"><div className="us-section-intro"><p className="uc-eyebrow">A DIRECT PATH TO WHAT’S NEXT</p><h2>How can we help?</h2></div>{PATHS.map(path=><button key={path.id} className="us-path" aria-pressed={selected===path.id} onClick={()=>{if(path.id==='shortage'){navigate('/shortage-list');return;}setSelected(path.id);requestAnimationFrame(()=>document.getElementById('quote-request')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}));}}><span className="uc-eyebrow">{path.n}</span><h3>{path.h}</h3><p>{path.p}</p><span className="us-path-arrow" aria-hidden="true">{selected===path.id?'↓':'↗'}</span></button>)}</section>
    {active&&active.id!=='shortage'&&<section className="us-request" id="quote-request"><div className="uc-wrap us-request-grid"><div><p className="uc-eyebrow">LET’S GET STARTED</p><h2>{active.id==='source'?<>Your request.<br/>Our attention.</>:<>Built around<br/>your needs.</>}</h2><p>{active.id==='source'?'Share the product, brand, and quantity. We’ll confirm the details and work through pricing and availability with you.':'From the first specification to packaging and delivery, tell us what matters for your project.'}</p><a href="tel:+18338686483">Prefer to talk? 833.868.6483 ↗</a></div><PathForm key={active.id} path={active} prefillSku={prefillSku}/></div></section>}
    <section className="uc-wrap us-closing"><p className="uc-eyebrow">ALREADY KNOW YOUR ITEMS?</p><h2>A few clicks.<br/>A clear quote.</h2><Link className="uc-button" to="/portal/quote">Build a Quick Quote <span>↗</span></Link></section>
  </main><HomepageFooter/></div>;
}
