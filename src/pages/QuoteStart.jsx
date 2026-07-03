// A5 quote router — PRD-28 §5.4. Replaces the single generic quote form with
// a 3-path chooser. Each path asks only its relevant fields and tags the lead
// type in HubSpot. Copy sells capability/outcome only — never the engine
// mechanism (§1.4). The button label everywhere stays "Start a quote".
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { db } from '../lib/db.js';
import { hubspot, gmail } from '../lib/services.js';
import { uid } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

// The three quote paths. Lead-type tags flow to HubSpot + the leads table so
// they reconcile with the Contact reason dropdown (§3.5).
const PATHS = [
  {
    id: 'source',
    n: '01',
    h: 'Source a specific product or brand',
    p: 'You know exactly what you need — a brand, a SKU, a hard-to-find item. We find it and come back with a firm price and delivery window.',
    tag: 'Quote · source a product or brand',
  },
  {
    id: 'custom',
    n: '02',
    h: 'Custom quote — made to spec',
    p: 'Product built to your specification, under your label or a Unite label. From spec to landed delivery, we run the whole chain.',
    tag: 'Quote · custom / made to spec',
  },
  {
    id: 'shortage',
    n: '03',
    h: 'I have a shortage list',
    p: 'Backordered somewhere else? Paste or upload your shortage list and we return a quote — stocked items matched against our own live inventory, the rest sourced.',
    tag: 'Shortage list',
  },
];

const inputStyle = { marginTop: 6, padding: '12px 14px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 14, color: D.ink, width: '100%', outline: 'none', fontFamily: D.sans, boxSizing: 'border-box' };
const labelStyle = { fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 };

function PathForm({ path, prefillSku, isMobile }) {
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
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const notes = path.id === 'source'
        ? `Item/brand: ${form.item}\nQty: ${form.qty}`
        : `Spec: ${form.spec}\nQty: ${form.qty}\nLabel: ${form.label_pref}`;
      const lead = db.insert('leads', {
        id: uid('lead'),
        org_name: form.org || form.name,
        contact_name: form.name,
        contact_email: form.email,
        segment: 'asc',
        status: 'warm',
        source: 'quote_router',
        owner: 'Unassigned',
        next_action: path.tag,
        next_action_at: new Date(Date.now() + 86400000).toISOString(),
        notes,
        reason: path.tag,
      });
      const [first, ...rest] = form.name.split(' ');
      await Promise.all([
        hubspot.createContact({ email: form.email, firstname: first || '', lastname: rest.join(' '), company: form.org, phone: '', lifecyclestage: 'lead' }),
        gmail.send({ to: 'support@unitemedical.net', subject: `${path.tag} · ${form.org || form.name}`, body: notes }),
      ]);
      setDone(lead.id);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ padding: 24, background: D.paperAlt, borderRadius: 12 }}>
        <div style={{ fontFamily: D.display, fontSize: 24, color: D.plum }}>Quote request in.</div>
        <p style={{ color: D.ink2, marginTop: 8, marginBottom: 0, fontSize: 14, lineHeight: 1.6 }}>
          Reference <code>{done}</code>. We&apos;ll come back with pricing inside one business day.
        </p>
      </div>
    );
  }
  return (
    <form onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        {path.id === 'source' ? (
          <>
            <label style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
              <div style={labelStyle}>PRODUCT / BRAND / SKU</div>
              <input required placeholder="e.g. BinaxNOW COVID-19 Ag, 22-pack…" value={form.item} onChange={(e) => set('item', e.target.value)} style={inputStyle} />
            </label>
            <label>
              <div style={labelStyle}>QUANTITY NEEDED</div>
              <input required placeholder="e.g. 500 kits / month" value={form.qty} onChange={(e) => set('qty', e.target.value)} style={inputStyle} />
            </label>
          </>
        ) : (
          <>
            <label style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
              <div style={labelStyle}>DESCRIBE THE PRODUCT / SPEC</div>
              <textarea required rows={3} placeholder="What are we building? Materials, sizes, packaging, certifications…" value={form.spec} onChange={(e) => set('spec', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
            </label>
            <label>
              <div style={labelStyle}>QUANTITY / RUN SIZE</div>
              <input required placeholder="e.g. 10,000 units" value={form.qty} onChange={(e) => set('qty', e.target.value)} style={inputStyle} />
            </label>
            <label>
              <div style={labelStyle}>WHOSE LABEL?</div>
              <select value={form.label_pref} onChange={(e) => set('label_pref', e.target.value)} style={inputStyle}>
                {['My label', 'A Unite label', 'Not sure yet'].map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
          </>
        )}
        <label>
          <div style={labelStyle}>ORGANIZATION</div>
          <input value={form.org} onChange={(e) => set('org', e.target.value)} style={inputStyle} />
        </label>
        <label>
          <div style={labelStyle}>YOUR NAME</div>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)} style={inputStyle} />
        </label>
        <label style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
          <div style={labelStyle}>WORK EMAIL</div>
          <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} style={inputStyle} />
        </label>
      </div>
      <button type="submit" disabled={busy} style={{ marginTop: 16, background: D.plum, color: D.paper, border: 'none', padding: '14px 24px', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: D.sans }}>
        {busy ? 'Sending…' : 'Start a quote →'}
      </button>
    </form>
  );
}

export function QuoteStart() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
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

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow="SOURCE & QUOTE"
          title={<>What do you <em>need</em>?</>}
          sub="Pick a path — each one asks only what's relevant, and every quote comes back compliance-checked with one all-in price."
        />
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: `12px ${padX}px ${isMobile ? 56 : 80}px` }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 12 : 20 }}>
            {PATHS.map((p) => {
              const isActive = selected === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    if (p.id === 'shortage') { navigate('/shortage-list'); return; }
                    setSelected(p.id);
                  }}
                  className="um-card"
                  style={{
                    textAlign: 'left', cursor: 'pointer',
                    background: isActive ? D.ink : D.card,
                    color: isActive ? D.paper : D.ink,
                    border: `1.5px solid ${isActive ? D.ink : D.line}`,
                    borderRadius: 8, padding: isMobile ? 20 : 28,
                    fontFamily: D.sans,
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  }}
                >
                  <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: isActive ? D.plumSoft : D.plum }}>{p.n}</span>
                  <span style={{ fontFamily: D.display, fontSize: isMobile ? 22 : 26, letterSpacing: -0.5, lineHeight: 1.1, marginTop: 10 }}>{p.h}</span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 10, color: isActive ? 'rgba(243,242,235,.75)' : D.ink2, flex: 1 }}>{p.p}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 13, fontWeight: 600, color: isActive ? D.paper : D.plum }}>
                    {p.id === 'shortage' ? 'Match my list' : isActive ? 'Selected' : 'Choose this'} <Icon.arrow />
                  </span>
                </button>
              );
            })}
          </div>

          {active && active.id !== 'shortage' && (
            <div style={{ marginTop: isMobile ? 20 : 28, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.4fr', gap: isMobile ? 20 : 40, alignItems: 'start' }}>
              <div>
                <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>{active.tag.toUpperCase()}</div>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 26 : 34, letterSpacing: -0.6, lineHeight: 1.1 }}>
                  {active.id === 'source' ? 'Tell us the product. We\u2019ll do the rest.' : 'From your spec to your dock.'}
                </div>
                <p style={{ fontSize: 14.5, color: D.ink2, lineHeight: 1.65, marginTop: 12, maxWidth: 420 }}>
                  {active.id === 'source'
                    ? 'Every quote comes back compliance-checked with one all-in landed price — no hidden freight, no surprise fees.'
                    : 'Manufacturing, compliance, packaging, and fulfillment handled end to end — your brand stays on the front.'}
                </p>
                <p style={{ fontSize: 13, color: D.ink3, marginTop: 16 }}>
                  Have a vendor product sheet instead?{' '}
                  <Link to="/quote/new" style={{ color: D.plum, textDecoration: 'underline', textUnderlineOffset: 3 }}>Upload it here</Link>.
                </p>
              </div>
              <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, padding: isMobile ? 20 : 28 }}>
                <PathForm key={active.id} path={active} prefillSku={prefillSku} isMobile={isMobile} />
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
