// Restore Robotics program — flagship /robotics build (PRD-28 §5.3).
// Structure modeled on rocuvexmed.com (a Unite sub-distributor's program
// site); Unite sits ABOVE Rocuvex in the chain, so this page presents the
// program at least as strongly. All program facts verified & approved:
//   · FDA 510(k)-cleared remanufactured da Vinci Xi & DV5 + certified pre-owned
//   · Restore Robotics = manufacturer of record (only FDA 510(k) clearance)
//   · Encore Medical = master distributor · Unite = authorized distributor/rep
//   · ~20% savings remanufactured / ~25% certified pre-owned · MOR warranty
// Conversion paths → HubSpot: hospitals (savings analysis / consultation,
// capturing facility, contact, da Vinci model, instrument volume) and
// sub-distributors (rep the program under Unite).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Eyebrow } from '../components/shared/Eyebrow.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { Reveal } from '../components/shared/Reveal.jsx';
import { db } from '../lib/db.js';
import { hubspot, gmail } from '../lib/services.js';
import { uid } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const STEPS = [
  ['Collection & recycling', 'Used robotic instruments go into collection trays provided at no cost, with reusable shipping containers and free return shipping.'],
  ['Secure transport', 'Sealed containers protect instruments in transit back to the Restore Robotics remanufacturing facility.'],
  ['Remanufacture & QC', 'Eligible instruments run a multi-step process — cleaning, visual inspection, functional performance testing, electrical verification, and quality-control validation — under the FDA 510(k) clearance.'],
  ['Certified instruments back', 'Your program gains access to remanufactured and certified pre-owned instruments at 20–25% savings, under a manufacturer-of-record warranty.'],
];

const FAQS = [
  ['What is a remanufactured robotic instrument?', 'A used da Vinci instrument restored through an FDA 510(k)-cleared process, tested for performance, and made available for reuse at significantly lower cost.'],
  ['Is the remanufacturing process FDA-cleared?', 'Yes. Restore Robotics holds the industry\u2019s only FDA 510(k) clearance for remanufacturing da Vinci Xi and DV5 instruments.'],
  ['Which robotic systems are compatible?', 'da Vinci Xi and DV5 surgical systems, plus certified pre-owned inventory with remaining uses.'],
  ['Who provides the warranty?', 'Restore Robotics is the manufacturer of record and provides full warranty coverage on remanufactured instruments.'],
  ['How much can our hospital save?', 'Approximately 20% on remanufactured instruments and about 25% on certified pre-owned inventory versus new OEM instruments. Unite has generated over $900K in savings for hospital systems to date.'],
  ['Does the program disrupt our surgical workflow?', 'No. Collection trays and containers slot into existing processes with minimal disruption, and return shipping is free.'],
];

const MODELS = ['da Vinci Xi', 'da Vinci 5 (DV5)', 'Both', 'Not sure'];
const VOLUMES = ['< 100 instruments / yr', '100–500 / yr', '500–1,000 / yr', '1,000+ / yr', 'Not sure'];

function LeadForm({ isMobile }) {
  const [form, setForm] = useState({ kind: 'savings', facility: '', name: '', email: '', model: MODELS[0], volume: VOLUMES[0], message: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const kindLabel = form.kind === 'savings' ? 'Savings analysis' : form.kind === 'consult' ? 'Consultation' : 'Sub-distributor inquiry';
      const lead = db.insert('leads', {
        id: uid('lead'),
        org_name: form.facility || form.name,
        contact_name: form.name,
        contact_email: form.email,
        segment: form.kind === 'distributor' ? 'distributors' : 'asc',
        status: 'warm',
        source: 'robotics_page',
        owner: 'Unassigned',
        next_action: `Robotics · ${kindLabel}`,
        next_action_at: new Date(Date.now() + 86400000).toISOString(),
        notes: `da Vinci model: ${form.model} · Instrument volume: ${form.volume}\n${form.message}`,
        reason: `Robotics · ${kindLabel}`,
      });
      const [first, ...rest] = form.name.split(' ');
      await Promise.all([
        hubspot.createContact({ email: form.email, firstname: first || '', lastname: rest.join(' '), company: form.facility, phone: '', lifecyclestage: 'lead' }),
        gmail.send({ to: 'support@unitemedical.net', subject: `Robotics lead · ${kindLabel} · ${form.facility || form.name}`, body: `Model: ${form.model}\nVolume: ${form.volume}\n\n${form.message}` }),
      ]);
      setDone(lead.id);
    } finally {
      setBusy(false);
    }
  }

  const input = { marginTop: 6, padding: '12px 14px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 14, color: D.ink, width: '100%', outline: 'none', fontFamily: D.sans, boxSizing: 'border-box' };
  const label = { fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 };

  if (done) {
    return (
      <div style={{ padding: 28, background: D.paperAlt, borderRadius: 14 }}>
        <div style={{ fontFamily: D.display, fontSize: 26, color: D.plum }}>Got it.</div>
        <p style={{ color: D.ink2, marginTop: 8, marginBottom: 0, fontSize: 14.5, lineHeight: 1.6 }}>
          Our robotics team will reach out within one business day with next steps
          {form.kind === 'savings' ? ' on your savings analysis' : ''}.
        </p>
      </div>
    );
  }
  return (
    <form onSubmit={submit}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['savings', 'Request a savings analysis'], ['consult', 'Schedule a consultation'], ['distributor', 'Rep the program']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => set('kind', k)} style={{
            background: form.kind === k ? D.plum : 'transparent', color: form.kind === k ? D.paper : D.ink2,
            border: `1px solid ${form.kind === k ? D.plum : D.line}`, padding: '9px 14px', borderRadius: 999,
            fontSize: 12.5, cursor: 'pointer', fontFamily: D.sans,
          }}>{l}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginTop: 14 }}>
        <label><div style={label}>{form.kind === 'distributor' ? 'COMPANY' : 'FACILITY / HEALTH SYSTEM'}</div><input required value={form.facility} onChange={(e) => set('facility', e.target.value)} style={input} /></label>
        <label><div style={label}>YOUR NAME</div><input required value={form.name} onChange={(e) => set('name', e.target.value)} style={input} /></label>
        <label><div style={label}>WORK EMAIL</div><input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} style={input} /></label>
        <label><div style={label}>DA VINCI MODEL</div>
          <select value={form.model} onChange={(e) => set('model', e.target.value)} style={input}>{MODELS.map((m) => <option key={m}>{m}</option>)}</select>
        </label>
        {form.kind !== 'distributor' && (
          <label style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}><div style={label}>ANNUAL INSTRUMENT VOLUME</div>
            <select value={form.volume} onChange={(e) => set('volume', e.target.value)} style={input}>{VOLUMES.map((v) => <option key={v}>{v}</option>)}</select>
          </label>
        )}
        <label style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}><div style={label}>ANYTHING ELSE?</div>
          <textarea rows={3} value={form.message} onChange={(e) => set('message', e.target.value)} style={{ ...input, resize: 'vertical' }} />
        </label>
      </div>
      <button type="submit" disabled={busy} style={{ marginTop: 16, background: D.plum, color: D.paper, border: 'none', padding: '14px 24px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: D.sans }}>
        {busy ? 'Sending…' : form.kind === 'savings' ? 'Request savings analysis →' : form.kind === 'consult' ? 'Schedule consultation →' : 'Talk to our program team →'}
      </button>
    </form>
  );
}

export function Robotics() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Robotic Surgery Instruments — FDA 510(k) remanufactured da Vinci · Unite Medical',
    description:
      'Reduce the cost of robotic surgery: FDA 510(k)-cleared remanufactured da Vinci Xi & DV5 instruments and certified pre-owned inventory, 20–25% savings, manufacturer-of-record warranty. $900K+ saved for hospital systems to date.',
    canonical: '/robotics',
  });
  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        {/* HERO */}
        <div style={{ background: D.inkDeep, color: D.paper, padding: `${isMobile ? 72 : 130}px ${padX}px ${isMobile ? 56 : 96}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <Eyebrow dark pulse style={{ marginBottom: isMobile ? 16 : 24 }}>RESTORE ROBOTICS PROGRAM · AUTHORIZED DISTRIBUTOR</Eyebrow>
            <h1 style={{ fontFamily: D.display, fontWeight: 400, fontSize: 'clamp(40px, 8.5vw, 104px)', lineHeight: 0.96, letterSpacing: '-0.035em', margin: 0, maxWidth: '11em' }}>
              Reduce the cost of <Grad>robotic surgery</Grad>.
            </h1>
            <p style={{ fontSize: isMobile ? 15.5 : 18, lineHeight: 1.6, color: 'rgba(247,242,234,.8)', marginTop: 24, maxWidth: 640 }}>
              FDA 510(k)-cleared remanufactured da Vinci Xi &amp; DV5 instruments and certified
              pre-owned inventory — 20–25% savings per instrument, full manufacturer-of-record
              warranty, zero compromise on clinical performance.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 32, flexWrap: 'wrap' }}>
              <a href="#robotics-lead" style={{ background: D.paper, color: D.ink, padding: isMobile ? '14px 22px' : '16px 28px', borderRadius: 999, fontSize: 15, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                Request a savings analysis <Icon.arrow />
              </a>
              <a href="#robotics-lead" className="um-glass-btn" style={{ color: D.paper, padding: isMobile ? '14px 22px' : '16px 28px', borderRadius: 999, fontSize: 15, fontWeight: 500 }}>
                Schedule a consultation
              </a>
            </div>
            {/* Program stat band */}
            <div style={{ marginTop: isMobile ? 40 : 64, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? '0 20px' : '0 40px' }}>
              {[
                ['$900K+', 'Saved for hospital systems to date'],
                ['20%', 'Savings · remanufactured'],
                ['25%', 'Savings · certified pre-owned'],
                ['510(k)', 'The only FDA clearance · Restore Robotics'],
              ].map(([big, small]) => (
                <div key={small} style={{ borderTop: '1px solid rgba(247,242,234,.22)', padding: `${isMobile ? 16 : 24}px 0` }}>
                  <div style={{ fontFamily: D.display, fontSize: isMobile ? 30 : 44, letterSpacing: -1 }}>{big}</div>
                  <div style={{ fontFamily: D.mono, fontSize: isMobile ? 9 : 10.5, letterSpacing: 1, color: 'rgba(247,242,234,.6)', marginTop: 8, lineHeight: 1.5 }}>{small.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* THE CHAIN — who stands behind it */}
        <div style={{ padding: `${isMobile ? 56 : 100}px ${padX}px`, borderBottom: `1px solid ${D.line}` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <Reveal>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 16 }}>THE PROGRAM</div>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(30px, 5.4vw, 60px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.02, margin: 0 }}>
                The only FDA 510(k)-cleared path to <Grad>remanufactured da Vinci</Grad> instruments.
              </h2>
            </Reveal>
            <div style={{ marginTop: isMobile ? 28 : 44, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 12 : 20 }}>
              {[
                ['Restore Robotics', 'Manufacturer of record', 'Holds the industry\u2019s only FDA 510(k) clearance for remanufacturing da Vinci Xi & DV5 instruments, and provides full warranty coverage.'],
                ['Encore Medical', 'Master distributor', 'Runs the collection loop — free trays, reusable shipping containers, and free return shipping from your facility.'],
                ['Unite Medical', 'Authorized distributor & representative', 'Your program partner: savings analysis, onboarding, supply, and support — backed by Unite\u2019s full medical supply chain.'],
              ].map(([name, role, desc]) => (
                <div key={name} style={{ padding: isMobile ? 20 : 28, background: D.card, borderRadius: 18, border: `1px solid ${D.line}` }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1.2, color: D.plum }}>{role.toUpperCase()}</div>
                  <div style={{ fontFamily: D.display, fontSize: isMobile ? 24 : 28, letterSpacing: -0.5, marginTop: 8 }}>{name}</div>
                  <p style={{ fontSize: 14, color: D.ink2, lineHeight: 1.6, margin: '10px 0 0' }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* HOW IT WORKS — collection → remanufacture loop */}
        <div style={{ padding: `${isMobile ? 56 : 100}px ${padX}px`, background: D.paperAlt, borderBottom: `1px solid ${D.line}` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <Reveal>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 16 }}>HOW IT WORKS</div>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(30px, 5vw, 54px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.04, margin: 0 }}>
                A closed loop that fits your <Grad>existing workflow</Grad>.
              </h2>
            </Reveal>
            <div style={{ marginTop: isMobile ? 28 : 48, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: isMobile ? 12 : 20 }}>
              {STEPS.map(([h, s], i) => (
                <Reveal key={h} delay={i * 90}>
                  <div style={{ borderTop: `2px solid ${D.plum}`, paddingTop: 18 }}>
                    <div style={{ fontFamily: D.display, fontSize: 40, color: D.plum, letterSpacing: -1, lineHeight: 1 }}>{String(i + 1).padStart(2, '0')}</div>
                    <div style={{ fontFamily: D.display, fontSize: 21, letterSpacing: -0.3, marginTop: 12 }}>{h}</div>
                    <p style={{ fontSize: 13.5, color: D.ink2, lineHeight: 1.6, margin: '8px 0 0' }}>{s}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>

        {/* SUSTAINABILITY */}
        <div style={{ padding: `${isMobile ? 56 : 100}px ${padX}px`, background: D.plum, color: D.paper }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: isMobile ? 24 : 64, alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plumSoft, marginBottom: 16 }}>SUSTAINABILITY</div>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.8vw, 52px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.06, margin: 0 }}>
                Less surgical waste. Longer instrument life.
              </h2>
              <p style={{ fontSize: isMobile ? 14.5 : 16, lineHeight: 1.65, color: '#e5d6e7', marginTop: 18, maxWidth: 560 }}>
                Robotic instruments are programmed for a limited number of uses and then discarded.
                Remanufacturing extends their useful life, reduces surgical waste, and cuts the
                carbon footprint of your robotics program — while your budget captures the savings.
              </p>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {['Reduce discarded-instrument waste', 'Extend the lifecycle of advanced surgical technology', 'Lower the environmental footprint of your OR'].map((t) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'rgba(247,242,234,.08)', borderRadius: 12, border: '1px solid rgba(247,242,234,.18)', fontSize: 14.5 }}>
                  <span style={{ color: D.terraSoft }}><Icon.check /></span> {t}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div style={{ padding: `${isMobile ? 56 : 100}px ${padX}px`, borderBottom: `1px solid ${D.line}` }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 16 }}>FAQ</div>
            <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.6vw, 48px)', fontWeight: 400, letterSpacing: -0.8, lineHeight: 1.06, margin: 0 }}>
              Common questions.
            </h2>
            <div style={{ marginTop: 28 }}>
              {FAQS.map(([q, a]) => (
                <details key={q} style={{ borderTop: `1px solid ${D.line}`, padding: '16px 0' }}>
                  <summary style={{ fontSize: 15.5, fontWeight: 600, cursor: 'pointer', color: D.ink }}>{q}</summary>
                  <p style={{ fontSize: 14.5, color: D.ink2, lineHeight: 1.65, margin: '10px 0 0', maxWidth: 760 }}>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>

        {/* CONVERSION — hospitals + sub-distributors */}
        <div id="robotics-lead" style={{ padding: `${isMobile ? 56 : 100}px ${padX}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr', gap: isMobile ? 28 : 64, alignItems: 'start' }}>
            <div>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 16 }}>GET STARTED</div>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(30px, 5vw, 52px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.04, margin: 0 }}>
                Discover how much your hospital can <Grad>save</Grad>.
              </h2>
              <p style={{ fontSize: 15.5, color: D.ink2, lineHeight: 1.65, marginTop: 16, maxWidth: 480 }}>
                Every robotic surgery program is different. Tell us your da Vinci model and
                instrument volume and we&apos;ll estimate your potential savings — or, if you&apos;re a
                distributor, ask about representing the program under Unite.
              </p>
              <p style={{ fontSize: 12, color: D.ink3, lineHeight: 1.6, marginTop: 24 }}>
                da Vinci®, da Vinci Xi® and Intuitive® are registered trademarks of Intuitive
                Corporation. Restore Robotics is not affiliated with Intuitive®.
              </p>
              <Link to="/portfolio" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 8, color: D.plum, fontSize: 14, fontWeight: 600 }}>
                See the program results in our portfolio <Icon.arrow />
              </Link>
            </div>
            <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 18, padding: isMobile ? 20 : 32 }}>
              <LeadForm isMobile={isMobile} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
