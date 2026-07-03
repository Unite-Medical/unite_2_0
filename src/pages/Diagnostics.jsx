// Dedicated Diagnostic Tests page — PRD-28 §5.2 (M4, HIGH PRIORITY).
// Brand-neutral ("Don't see your brand? Just ask."), SEO-focused for retail
// buyers, separate from the catalog. Diagnostics is Unite's #2 mover and a
// major retail growth lane.
//
// UNITE_LINE_LIVE gates the Unite private-label diagnostics line: the section
// structure is built, but specific Unite-branded products stay unpublished
// until Damon confirms the line is live — flip the flag then.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Eyebrow } from '../components/shared/Eyebrow.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { Reveal } from '../components/shared/Reveal.jsx';
import { StatusPill } from '../components/shared/StatusPill.jsx';
import { db } from '../lib/db.js';
import { hubspot, gmail } from '../lib/services.js';
import { uid } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

// Flip when Damon confirms the Unite-branded line is live (PRD-28 §5.2).
const UNITE_LINE_LIVE = false;

const TEST_CATEGORIES = [
  ['COVID-19', 'Antigen & molecular · POC + OTC'],
  ['Influenza A/B', 'Rapid antigen · professional & retail'],
  ['COVID + Flu combo', 'Multiplex rapid panels'],
  ['Strep A', 'Rapid antigen · CLIA-waived'],
  ['HIV', 'Rapid & self-test formats'],
  ['RSV', 'Rapid antigen · pediatric-ready'],
  ['Drug screening', 'Multi-panel cups, dips & strips'],
  ['Pregnancy & fertility', 'hCG & ovulation · retail formats'],
  ['Glucose & A1c', 'Meters, strips & POC analyzers'],
  ['UTI & urinalysis', 'Strips & POC readers'],
];

const CAPABILITIES = [
  ['Wholesale', 'Case and pallet quantities of every major brand, priced for resale. No minimums on stocked items.'],
  ['Retail programs', 'EDI-ready retail supply — bulk orders, bulk discounts, and drop-ship — built for pharmacy chains and retailers.'],
  ['Private label', 'Your brand on proven test platforms: sourcing, compliance, packaging, and fulfillment handled end to end.'],
  ['POC + OTC', 'Professional CLIA-waived point-of-care formats and consumer OTC formats, across every category we carry.'],
];

function BrandAskForm({ isMobile }) {
  const [form, setForm] = useState({ brand: '', org: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      db.insert('leads', {
        id: uid('lead'),
        org_name: form.org || form.email,
        contact_name: '',
        contact_email: form.email,
        segment: 'pharmacy',
        status: 'warm',
        source: 'diagnostics_page',
        owner: 'Unassigned',
        next_action: `Diagnostics brand request · ${form.brand}`,
        next_action_at: new Date(Date.now() + 86400000).toISOString(),
        notes: `Requested diagnostics brand: ${form.brand}`,
        reason: 'Quote · source a product or brand',
      });
      await Promise.all([
        hubspot.createContact({ email: form.email, firstname: '', lastname: '', company: form.org, phone: '', lifecyclestage: 'lead' }),
        gmail.send({ to: 'support@unitemedical.net', subject: `Diagnostics brand request · ${form.brand}`, body: `Org: ${form.org}\nEmail: ${form.email}\nBrand: ${form.brand}` }),
      ]);
      setDone(true);
    } finally {
      setBusy(false);
    }
  }
  const input = { marginTop: 6, padding: '12px 14px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 14, color: D.ink, width: '100%', outline: 'none', fontFamily: D.sans, boxSizing: 'border-box' };
  const label = { fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 };
  if (done) {
    return (
      <div style={{ padding: 24, background: D.paperAlt, borderRadius: 12 }}>
        <div style={{ fontFamily: D.display, fontSize: 24, color: D.plum }}>On it.</div>
        <p style={{ color: D.ink2, marginTop: 8, marginBottom: 0, fontSize: 14 }}>We&apos;ll come back with availability and wholesale pricing inside one business day.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        <label style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}><div style={label}>BRAND / TEST YOU NEED</div><input required placeholder="e.g. BinaxNOW, QuickVue, iHealth…" value={form.brand} onChange={(e) => set('brand', e.target.value)} style={input} /></label>
        <label><div style={label}>ORGANIZATION</div><input value={form.org} onChange={(e) => set('org', e.target.value)} style={input} /></label>
        <label><div style={label}>WORK EMAIL</div><input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} style={input} /></label>
      </div>
      <button type="submit" disabled={busy} style={{ marginTop: 14, background: D.plum, color: D.paper, border: 'none', padding: '13px 22px', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: D.sans }}>
        {busy ? 'Sending…' : 'Ask about this brand →'}
      </button>
    </form>
  );
}

export function Diagnostics() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Diagnostic Tests Wholesale — COVID, flu, strep, HIV & more · Unite Medical',
    description:
      'Wholesale diagnostic tests for pharmacies and retailers: COVID-19, flu, strep, HIV, RSV, drug screening, and more. Every major brand — POC and OTC — with retail EDI, bulk discounts, private label, and drop-ship. Don\u2019t see your brand? Just ask.',
    canonical: '/diagnostics',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        {/* HERO */}
        <div style={{ padding: `${isMobile ? 56 : 100}px ${padX}px ${isMobile ? 40 : 72}px`, background: D.paperAlt, borderBottom: `1px solid ${D.line}` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <Eyebrow style={{ marginBottom: isMobile ? 14 : 22 }}>DIAGNOSTICS · WHOLESALE + RETAIL + PRIVATE LABEL</Eyebrow>
            <h1 style={{ fontFamily: D.display, fontWeight: 400, fontSize: 'clamp(40px, 8.5vw, 96px)', lineHeight: 0.96, letterSpacing: '-0.035em', margin: 0, maxWidth: '11em' }}>
              Every major test brand. <Grad>One supplier.</Grad>
            </h1>
            <p style={{ fontSize: isMobile ? 15.5 : 18, lineHeight: 1.6, color: D.ink2, marginTop: 22, maxWidth: 640 }}>
              Point-of-care and OTC diagnostic tests for pharmacies, retailers, clinics, and
              distributors — wholesale, retail EDI programs, bulk discounts, and private label.
              Don&apos;t see your brand? Just ask.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/catalog?cat=Diagnostics')} style={{ background: D.ink, color: D.paper, border: 'none', padding: isMobile ? '14px 22px' : '15px 26px', borderRadius: 4, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                Browse stocked diagnostics <Icon.arrow />
              </button>
              <a href="#brand-ask" style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: isMobile ? '13px 22px' : '14px 26px', borderRadius: 4, fontSize: 14.5, fontWeight: 500 }}>
                Ask about a brand
              </a>
            </div>
          </div>
        </div>

        {/* TEST CATEGORIES */}
        <div style={{ padding: `${isMobile ? 48 : 88}px ${padX}px`, borderBottom: `1px solid ${D.line}` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <Reveal>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 14 }}>WHAT WE COVER</div>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 5vw, 54px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.04, margin: 0 }}>
                Test categories, <Grad>brand-neutral</Grad>.
              </h2>
            </Reveal>
            <div style={{ marginTop: isMobile ? 24 : 40, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: isMobile ? 10 : 14 }}>
              {TEST_CATEGORIES.map(([name, sub]) => (
                <div key={name} style={{ padding: isMobile ? 16 : 20, background: D.card, borderRadius: 14, border: `1px solid ${D.line}` }}>
                  <div style={{ fontFamily: D.display, fontSize: isMobile ? 17 : 20, letterSpacing: -0.3 }}>{name}</div>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 6, lineHeight: 1.5 }}>{sub}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 14, color: D.ink2, marginTop: 20 }}>
              Carrying or switching to a specific manufacturer? We source every major brand —{' '}
              <a href="#brand-ask" style={{ color: D.plum, textDecoration: 'underline', textUnderlineOffset: 3 }}>just ask</a>.
            </p>
          </div>
        </div>

        {/* SUPPLY CAPABILITIES */}
        <div style={{ padding: `${isMobile ? 48 : 88}px ${padX}px`, background: D.paperAlt, borderBottom: `1px solid ${D.line}` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <Reveal>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 14 }}>HOW WE SUPPLY</div>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 5vw, 54px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.04, margin: 0 }}>
                Built for <Grad>retail buyers</Grad>.
              </h2>
            </Reveal>
            <div style={{ marginTop: isMobile ? 24 : 40, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: isMobile ? 12 : 18 }}>
              {CAPABILITIES.map(([h, s], i) => (
                <Reveal key={h} delay={i * 80}>
                  <div style={{ borderTop: `2px solid ${D.plum}`, paddingTop: 16 }}>
                    <div style={{ fontFamily: D.display, fontSize: 22, letterSpacing: -0.4 }}>{h}</div>
                    <p style={{ fontSize: 13.5, color: D.ink2, lineHeight: 1.6, margin: '8px 0 0' }}>{s}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>

        {/* UNITE PRIVATE-LABEL LINE — structure built; products gated until live */}
        <div style={{ padding: `${isMobile ? 48 : 88}px ${padX}px`, background: D.inkDeep, color: D.paper, borderBottom: `1px solid ${D.line}` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: isMobile ? 24 : 64, alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plumSoft }}>THE UNITE LINE</span>
                {!UNITE_LINE_LIVE && <StatusPill dotColor={D.terra} style={{ background: 'rgba(243,242,235,.1)', color: 'rgba(243,242,235,.8)', border: '1px solid rgba(243,242,235,.25)' }}>COMING SOON</StatusPill>}
              </div>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.05, margin: 0 }}>
                Every major brand — <Grad>and our own line</Grad>.
              </h2>
              <p style={{ fontSize: isMobile ? 14.5 : 16, lineHeight: 1.65, color: 'rgba(243,242,235,.78)', marginTop: 18, maxWidth: 560 }}>
                Unite is bringing its own private-label diagnostics line to market — the same
                proven test platforms, at wholesale economics only a manufacturer-direct line can
                hit. Ask us for early access and launch pricing.
              </p>
              {UNITE_LINE_LIVE && (
                <div style={{ marginTop: 20 }}>
                  {/* Product cards for the Unite-branded line render here once
                      the line is live (confirm with Damon before publishing). */}
                </div>
              )}
            </div>
            <div>
              <a href="#brand-ask" style={{ background: D.paper, color: D.ink, padding: '15px 28px', borderRadius: 4, fontSize: 15, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                Get early access <Icon.arrow />
              </a>
            </div>
          </div>
        </div>

        {/* BRAND ASK — conversion */}
        <div id="brand-ask" style={{ padding: `${isMobile ? 48 : 88}px ${padX}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr', gap: isMobile ? 24 : 64, alignItems: 'start' }}>
            <div>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 14 }}>DON&apos;T SEE YOUR BRAND?</div>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.04, margin: 0 }}>
                Just <Grad>ask</Grad>.
              </h2>
              <p style={{ fontSize: 15, color: D.ink2, lineHeight: 1.65, marginTop: 14, maxWidth: 460 }}>
                Tell us the brand and format you need and we&apos;ll come back with availability and
                wholesale pricing — usually inside one business day.
              </p>
              <p style={{ fontSize: 13.5, color: D.ink2, marginTop: 18 }}>
                Prefer to talk? <Link to="/contact?reason=Quote%20%C2%B7%20source%20a%20product%20or%20brand" style={{ color: D.plum, textDecoration: 'underline', textUnderlineOffset: 3 }}>Contact our diagnostics desk</Link>.
              </p>
            </div>
            <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, padding: isMobile ? 20 : 28 }}>
              <BrandAskForm isMobile={isMobile} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
