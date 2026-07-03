import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { UMLogo } from '../components/shared/Logo.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { auth } from '../lib/auth.js';
import { hubspot, gmail } from '../lib/services.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const SEGMENTS = [
  ['asc', 'Ambulatory Surgery Center'],
  ['pharmacy', 'Independent Pharmacy'],
  ['gov', 'Government / VA'],
  ['ems', 'EMS / First Responders'],
  ['distributors', 'Regional Distributor'],
  ['hospital', 'Hospital / Health System'],
];

export function Register() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 22 : 40;
  useSEO({
    title: 'Request a B2B account',
    description:
      'Open a Unite Medical wholesale account in two minutes. Approved within one business day. Wholesale pricing, net-30 terms, dedicated rep.',
    canonical: '/register',
  });
  const [form, setForm] = useState({
    org_name: 'Sunrise Ambulatory Surgery Center',
    website: 'sunrise-asc.com',
    spend: '$1-5M',
    name: 'Jessica Garcia',
    email: 'jessica@sunrise-asc.com',
    phone: '',
    password: '',
    segment: 'asc',
    state: 'GA',
    terms: 'net30',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null); setSubmitting(true);
    try {
      const session = await auth.register({ email: form.email, password: form.password || 'demo', name: form.name, org_name: form.org_name, segment: form.segment, website: form.website });
      await Promise.all([
        hubspot.createContact({ email: form.email, firstname: form.name.split(' ')[0], lastname: form.name.split(' ').slice(1).join(' '), company: form.org_name, phone: form.phone, lifecyclestage: 'customer' }),
        gmail.send({ to: form.email, subject: 'Welcome to Unite Medical', body: `Hi ${form.name.split(' ')[0]} — your account is live. Your dedicated rep will reach out within one business day.`, from: 'support@unitemedical.net' }),
      ]);
      navigate(session.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.message || 'Could not create account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <div style={{ padding: `24px ${padX}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/"><UMLogo size={isMobile ? 24 : 28} color={D.ink} weight={600} /></Link>
          <div style={{ fontSize: 13, color: D.ink2 }}>Already have an account? <Link to="/login" style={{ color: D.plum, textDecoration: 'underline' }}>Sign in</Link></div>
        </div>
      </div>
      <main id="main" style={{ maxWidth: 960, margin: '0 auto', padding: `${isMobile ? 44 : 72}px ${padX}px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 18 }}>REQUEST AN ACCOUNT · 2 MIN</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 8.5vw, 84px)', fontWeight: 400, letterSpacing: 'clamp(-1px, -0.22vw, -2px)', lineHeight: 1.0, margin: 0, maxWidth: 720 }}>
          Tell us about your <Grad>organization</Grad>.
        </h1>
        <p style={{ fontSize: 16, color: D.ink2, marginTop: 22, maxWidth: 600, lineHeight: 1.55 }}>
          We approve accounts within one business day. You&apos;ll get wholesale pricing, net-30 terms, and a dedicated rep for your segment.
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: 48, display: 'grid', gap: 20 }}>
          <fieldset style={{ padding: isMobile ? 20 : 28, background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, margin: 0 }}>
            <legend style={{ padding: '0 8px', fontFamily: D.display, fontSize: 22, color: D.plum }}>01 · Organization</legend>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <Field label="Legal name" value={form.org_name} onChange={(v) => set('org_name', v)} required />
              <Field label="Website" value={form.website} onChange={(v) => set('website', v)} />
              <SelectField label="Segment" value={form.segment} onChange={(v) => set('segment', v)} options={SEGMENTS} />
              <SelectField label="Annual medical spend" value={form.spend} onChange={(v) => set('spend', v)} options={[['<$500K', '<$500K'], ['$500K-1M', '$500K-1M'], ['$1-5M', '$1-5M'], ['$5-25M', '$5-25M'], ['$25M+', '$25M+']]} />
            </div>
          </fieldset>

          <fieldset style={{ padding: isMobile ? 20 : 28, background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, margin: 0 }}>
            <legend style={{ padding: '0 8px', fontFamily: D.display, fontSize: 22, color: D.plum }}>02 · Primary contact</legend>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <Field label="Full name" value={form.name} onChange={(v) => set('name', v)} required />
              <Field label="Work email" value={form.email} onChange={(v) => set('email', v)} type="email" required />
              <Field label="Phone (optional)" value={form.phone} onChange={(v) => set('phone', v)} />
              <Field label="Choose a password" value={form.password} onChange={(v) => set('password', v)} type="password" placeholder="leave blank for demo" />
            </div>
          </fieldset>

          {error && <div style={{ padding: 12, background: '#fbe9e1', color: '#7a2d10', borderRadius: 10, fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" disabled={submitting} style={{ background: D.plum, color: D.paper, border: 'none', padding: '16px 36px', borderRadius: 4, fontSize: 15, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Creating account…' : 'Submit application →'}
            </button>
            <div style={{ fontSize: 13, color: D.ink2 }}>Approved within 1 business day · we&apos;ll email + call your primary contact</div>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required, placeholder }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{label.toUpperCase()}</div>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ marginTop: 6, padding: '12px 14px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 14, color: D.ink, width: '100%', outline: 'none', fontFamily: D.sans }}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{label.toUpperCase()}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ marginTop: 6, padding: '12px 14px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 14, color: D.ink, width: '100%', outline: 'none', fontFamily: D.sans }}
      >
        {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
    </label>
  );
}
