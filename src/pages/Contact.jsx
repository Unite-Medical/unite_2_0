import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { db } from '../lib/db.js';
import { hubspot, gmail } from '../lib/services.js';
import { uid } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

// Contact form reasons per spec §4m. "Distributor program" replaces "Dealer
// program"; "Document request" and "PDAC consulting" added; separate
// Government/VA and Vendor desks removed (no dedicated emails).
const REASONS = [
  'New account',
  'Quote · stocked item',
  'Quote · non-stocked / sourcing',
  'Government procurement',
  'Distributor program',
  'Document request',
  'PDAC consulting',
  'Support',
];

export function Contact() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Contact — call us, we answer',
    description:
      'Every inbound goes to a real person. Mon–Fri 8am–5pm EST. Sales, support, government, and billing all on 833.868.6483.',
    canonical: '/contact',
  });
  // ?reason= deep-link picks the initial dropdown value; the user takes over
  // afterwards via the select. We deliberately don't re-sync mid-session to
  // avoid React 19's set-state-in-effect lint and the resulting render storm.
  const [params] = useSearchParams();
  const initialReason = params.get('reason') && REASONS.includes(params.get('reason')) ? params.get('reason') : 'New account';
  const [form, setForm] = useState({ first: '', last: '', org: '', email: '', message: '', reason: initialReason, route_to_rep: true });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const lead = db.insert('leads', {
        id: uid('lead'),
        org_name: form.org || `${form.first} ${form.last}`,
        contact_name: `${form.first} ${form.last}`.trim(),
        contact_email: form.email,
        segment: form.reason.toLowerCase().includes('gov') ? 'gov' : form.reason.toLowerCase().includes('dealer') ? 'distributors' : 'asc',
        status: form.route_to_rep ? 'warm' : 'cold',
        source: 'website',
        owner: 'Aidan Park',
        next_action: 'First reply',
        next_action_at: new Date(Date.now() + 86400000).toISOString(),
        notes: form.message,
        reason: form.reason,
      });
      await Promise.all([
        hubspot.createContact({
          email: form.email,
          firstname: form.first,
          lastname: form.last,
          company: form.org,
          phone: '',
          lifecyclestage: 'lead',
        }),
        gmail.send({ to: form.email, subject: `Got it — Unite Medical (${form.reason})`, body: `Hi ${form.first || 'there'}, thanks for reaching out. ${form.route_to_rep ? 'A rep is being assigned and will reply within one business day.' : 'A team member will be in touch shortly.'}` }),
        gmail.send({ to: 'sales@unitemedical.net', subject: `New lead · ${form.org || form.first}`, body: `${form.reason}\n\n${form.message}` }),
      ]);
      setSubmitted({ id: lead.id });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow="CONTACT · MON-FRI 8AM-5PM EST"
          title={<>Call us. We answer.</>}
          sub="Every inbound goes to a real person."
        />
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: `24px ${padX}px ${isMobile ? 56 : 64}px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 28 : 40 }}>
          <form onSubmit={handleSubmit} style={{ background: D.card, borderRadius: 14, border: `1px solid ${D.line}`, padding: isMobile ? 22 : 32 }}>
            <div style={{ fontFamily: D.display, fontSize: 26, marginBottom: 18 }}>Send us a line</div>
            {submitted ? (
              <div style={{ padding: 24, background: D.paperAlt, borderRadius: 12 }}>
                <div style={{ fontFamily: D.display, fontSize: 24, color: D.plum }}>Got it.</div>
                <p style={{ color: D.ink2, marginTop: 8, marginBottom: 0 }}>Lead ID <code>{submitted.id}</code> created. We&apos;ll be in touch inside one business day.</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="First name" value={form.first} onChange={(v) => set('first', v)} required />
                  <Field label="Last name" value={form.last} onChange={(v) => set('last', v)} required />
                </div>
                <Field label="Organization" value={form.org} onChange={(v) => set('org', v)} />
                <Field label="Work email" type="email" value={form.email} onChange={(v) => set('email', v)} required />
                <SelectField label="Reason" value={form.reason} onChange={(v) => set('reason', v)} options={REASONS} />
                <TextAreaField label="What can we help with?" value={form.message} onChange={(v) => set('message', v)} />
                <label style={{ display: 'block', marginTop: 14, fontSize: 12, color: D.ink2 }}>
                  <input type="checkbox" checked={form.route_to_rep} onChange={(e) => set('route_to_rep', e.target.checked)} style={{ accentColor: D.plum, marginRight: 8 }} />
                  Route this to a sales rep (recommended)
                </label>
                <button type="submit" disabled={submitting} style={{ marginTop: 16, background: D.plum, color: D.paper, border: 'none', padding: '14px 22px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? 'Sending…' : 'Send message'}
                </button>
              </>
            )}
          </form>

          <div>
            <div style={{ fontFamily: D.display, fontSize: 36, lineHeight: 1.1, letterSpacing: -0.7, color: D.ink }}>
              Prefer to <em>talk</em>?
            </div>
            <div style={{ marginTop: 24, display: 'grid', gap: 14 }}>
              {/* All numbers consolidated to one line per spec §4m. */}
              {[
                ['Sales & New Accounts', '833.868.6483', 'sales@unitemedical.net'],
                ['Customer Support', '833.868.6483', 'support@unitemedical.net'],
                ['General Inquiries', '833.868.6483', 'info@unitemedical.net'],
                ['Accounting & Billing', '833.868.6483', 'accounting@unitemedical.net'],
              ].map(([name, phone, email]) => (
                <div key={name} style={{ padding: 20, background: D.card, borderRadius: 12, border: `1px solid ${D.line}` }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{name.toUpperCase()}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
                    <a href={`tel:${phone.replace(/\D/g, '')}`} style={{ fontFamily: D.display, fontSize: 22, color: D.ink, letterSpacing: -0.3 }}>{phone}</a>
                    <a href={`mailto:${email}`} style={{ fontSize: 13, color: D.ink2, alignSelf: 'end' }}>{email}</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required }) {
  return (
    <label style={{ display: 'block', marginTop: 12 }}>
      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{label.toUpperCase()}</div>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        style={{ marginTop: 6, padding: '12px 14px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 14, color: D.ink, width: '100%', outline: 'none', fontFamily: D.sans }}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'block', marginTop: 12 }}>
      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{label.toUpperCase()}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ marginTop: 6, padding: '12px 14px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 14, color: D.ink, width: '100%', outline: 'none', fontFamily: D.sans }}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function TextAreaField({ label, value, onChange }) {
  return (
    <label style={{ display: 'block', marginTop: 12 }}>
      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{label.toUpperCase()}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        style={{ marginTop: 6, padding: '12px 14px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 14, color: D.ink, width: '100%', outline: 'none', fontFamily: D.sans, resize: 'vertical' }}
      />
    </label>
  );
}
