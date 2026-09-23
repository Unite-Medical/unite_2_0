import {CONTACT_REASONS as REASONS} from '../lib/contactReasons.js';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

// Contact form reasons — aligned with the quote-router paths (PRD-28 §5.4)
// and the 3 supply states (§5.1) so leads tag consistently in HubSpot.


export function Contact() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({
    title: 'Contact — call us, we answer',
    description:
      'Every inbound goes to a real person. Mon–Fri 8am–5pm EST. Accounting & billing at ext. 3; all other inquiries — sales, support, general — on 833.868.6483.',
    canonical: '/contact',
  });
  // ?reason= deep-link picks the initial dropdown value; the user takes over
  // afterwards via the select. We deliberately don't re-sync mid-session to
  // avoid React 19's set-state-in-effect lint and the resulting render storm.
  const [params] = useSearchParams();
  const initialReason = params.get('reason') && REASONS.includes(params.get('reason')) ? params.get('reason') : 'New account';
  const [form, setForm] = useState({ first: '', last: '', org: '', email: '', message: params.get('document')?`Please send ${params.get('document').slice(0,300)}.`:'', reason: initialReason, route_to_rep: true });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [error,setError]=useState(''),requestRef=useRef(null),busyRef=useRef(false);
  const [honeypot,setHoneypot]=useState('');

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();if(busyRef.current)return;
    busyRef.current=true;setSubmitting(true);setError('');
    const payload={kind:'contact',name:`${form.first} ${form.last}`.trim(),company:form.org,email:form.email,reason:form.reason,message:form.message,route_to_rep:form.route_to_rep,website_confirm:honeypot};
    const canonical=JSON.stringify(payload);
    if(requestRef.current?.canonical!==canonical)requestRef.current={canonical,key:crypto.randomUUID()};
    try{
      const response=await fetch('/api/public/inquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,idempotency_key:requestRef.current.key})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok||!result.id)throw new Error(response.status===429?'Too many requests. Please try again later or call 833.868.6483.':result.error==='contact_reason_and_message_required'?'Choose a reason and add a message.':'We could not confirm your request was saved. Your details are still here; retry or call 833.868.6483.');
      setSubmitted({id:result.id});
    }catch(err){setError(err instanceof TypeError?'We could not reach the server. Your details are still here; retry or call 833.868.6483.':err.message||'We could not confirm your request was saved. Please retry or call us.');}
    finally{busyRef.current=false;setSubmitting(false);}
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
            <div style={{ fontFamily: D.display, fontSize: 26, marginBottom: 18 }}>Send us a line</div>{error&&<p role="alert" style={{color:"#922e24"}}>{error}</p>}<label style={{position:"absolute",left:"-10000px"}} aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={e=>setHoneypot(e.target.value)}/></label>
            {submitted ? (
              <div style={{ padding: 24, background: D.paperAlt, borderRadius: 12 }}>
                <div style={{ fontFamily: D.display, fontSize: 24, color: D.plum }}>Got it.</div>
                <p style={{ color: D.ink2, marginTop: 8, marginBottom: 0 }}>Your request was saved for our team to review. Reference: <code>{submitted.id}</code>.</p>
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
                <button type="submit" disabled={submitting} style={{ marginTop: 16, background: D.plum, color: D.paper, border: 'none', padding: '14px 22px', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
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
              {/* Two lines per PRD-28 §3.5 — accounting keeps its real inbox; everything else routes to support@. */}
              {[
                ['Accounting & Billing', '833.868.6483 ext. 3', '8338686483', 'accounting@unitemedical.net'],
                ['All other inquiries · sales, support, general', '833.868.6483', '8338686483', 'support@unitemedical.net'],
              ].map(([name, phoneLabel, phoneDigits, email]) => (
                <div key={name} style={{ padding: 20, background: D.card, borderRadius: 12, border: `1px solid ${D.line}` }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{name.toUpperCase()}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
                    <a href={`tel:${phoneDigits}`} style={{ fontFamily: D.display, fontSize: 22, color: D.ink, letterSpacing: -0.3 }}>{phoneLabel}</a>
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
        maxLength={type==='email'?254:100}
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
        required
        maxLength={4000}
        style={{ marginTop: 6, padding: '12px 14px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 14, color: D.ink, width: '100%', outline: 'none', fontFamily: D.sans, resize: 'vertical' }}
      />
    </label>
  );
}
