/**
 * Surplus inventory intake — PRD-10 Phase 1.
 *
 * Public landing page: "Sell your surplus medical supplies to Unite
 * Medical." Intake form writes to the in-browser DB (will move to the
 * `surplus_submissions` / `surplus_lines` tables once PRD-01 lands).
 *
 * AI categorization + valuation (PRD-10 Phase 2) is wired through
 * `src/lib/ai/client.js` against the `surplus/line_normalize` and
 * `surplus/valuation` prompts — currently stubbed (no API key) but
 * fully exercised so the workflow is real.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { IMG } from '../lib/imageMap.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { db } from '../lib/db.js';
import { uid } from '../lib/format.js';
import { ai } from '../lib/ai/client.js';

const EMPTY_LINE = () => ({ id: uid('ln'), raw_description: '', qty: '', condition: 'unknown', expiry_date: '' });

export function Surplus() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;

  useSEO({
    title: 'Sell us your surplus medical supplies',
    description: 'Hospitals, surgery centers, and clinics: submit your excess medical inventory to Unite Medical. We respond with offers in 1–2 business days. Veteran-owned, FDA-registered.',
    canonical: '/surplus',
  });

  const [form, setForm] = useState({
    hospital_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    pickup_location: '',
    notes: '',
  });
  const [lines, setLines] = useState([EMPTY_LINE()]);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);
  const [error, setError] = useState(null);

  function updateField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function updateLine(idx, patch) {
    setLines((arr) => arr.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((arr) => [...arr, EMPTY_LINE()]); }
  function removeLine(idx) { setLines((arr) => arr.length > 1 ? arr.filter((_, i) => i !== idx) : arr); }

  async function submit(e) {
    e.preventDefault();
    setError(null);

    const validLines = lines
      .map((l) => ({ ...l, qty: parseInt(l.qty, 10) }))
      .filter((l) => l.raw_description.trim().length > 0 && Number.isFinite(l.qty) && l.qty > 0);

    if (!form.contact_email.trim()) {
      setError('Email is required so we can send you an offer.');
      return;
    }
    if (validLines.length === 0) {
      setError('Add at least one line item with a description and quantity.');
      return;
    }

    setSubmitting(true);
    try {
      const submission = db.insert('surplus_submissions', {
        id: uid('sps'),
        ...form,
        status: 'reviewing',
        submitted_at: new Date().toISOString(),
        total_lines: validLines.length,
        estimated_value: 0,
      });

      // Run AI categorization (stubbed today; real when ANTHROPIC_API_KEY lands).
      const { data: normalized } = await ai.run('surplus/line_normalize', {
        input: { lines: validLines, lines_json: { lines: validLines } },
        source: 'surplus-intake',
      });
      const normalizedLines = normalized?.lines || [];

      validLines.forEach((l, idx) => {
        const ai_meta = normalizedLines[idx] || {};
        db.insert('surplus_lines', {
          id: uid('spl'),
          submission_id: submission.id,
          raw_description: l.raw_description,
          normalized_name: ai_meta.normalized_name || l.raw_description,
          category: ai_meta.category || 'Other',
          condition: ai_meta.condition_hint || l.condition || 'unknown',
          expiry_date: l.expiry_date || ai_meta.expiry_iso || null,
          qty: l.qty,
          gtin: ai_meta.gtin || null,
          flags: ai_meta.flags || [],
        });
      });

      setSubmittedId(submission.id);
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please email surplus@unitemedical.net directly.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submittedId) {
    return (
      <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
        <Nav />
        <main id="main" style={{ maxWidth: 760, margin: '0 auto', padding: `${isMobile ? 56 : 96}px ${padX}px` }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>SUBMISSION RECEIVED</div>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 7vw, 64px)', fontWeight: 400, letterSpacing: -1.2, margin: 0, lineHeight: 1.05 }}>
            We&apos;ve got your list. <Grad>Thanks for thinking of us.</Grad>
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: D.ink2, marginTop: 22 }}>
            We&apos;ll review your submission and email <strong>{form.contact_email}</strong> with an offer within 1–2 business days. Reference: <code>{submittedId}</code>.
          </p>
          <div style={{ marginTop: 30, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/')} style={{ background: D.plum, color: D.paper, border: 'none', padding: '13px 22px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Back home</button>
            <button onClick={() => { setSubmittedId(null); setLines([EMPTY_LINE()]); }} style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '12px 22px', borderRadius: 999, fontSize: 14, cursor: 'pointer' }}>Submit another list</button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead
          eyebrow="SURPLUS · OVERSTOCK · NEAR-EXPIRY"
          title={<>Have <em>excess</em> medical supplies?</>}
          sub="Hospitals, surgery centers, and clinics: send us your surplus inventory list and we'll respond with an offer in 1–2 business days. We cover pickup. Net-30 payment on accepted lots."
          right={
            <PhotoPlaceholder
              src={IMG.SURPLUS_HERO}
              alt="Hospital storeroom shelves stacked with sealed cases of medical supplies"
              caption="hospital storeroom, sealed cases"
              height={isMobile ? 220 : 380}
              stripeFrom="#e8ddcd" stripeTo="#d9c8b0" textColor={D.plum}
              radius={16}
              eager
            />
          }
        />

        <section style={{ padding: `0 ${padX}px ${isMobile ? 56 : 80}px` }}>
          <div style={{ maxWidth: 980, margin: '0 auto' }}>
            <form onSubmit={submit} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 16, padding: isMobile ? 22 : 36 }}>
              {/* Contact block */}
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum, marginBottom: 14 }}>STEP 1 · WHO YOU ARE</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                <Field label="Hospital / organization" required value={form.hospital_name} onChange={(v) => updateField('hospital_name', v)} />
                <Field label="Pickup location (city, state)" value={form.pickup_location} onChange={(v) => updateField('pickup_location', v)} placeholder="e.g. Atlanta, GA" />
                <Field label="Your name" required value={form.contact_name} onChange={(v) => updateField('contact_name', v)} />
                <Field label="Work email" required type="email" value={form.contact_email} onChange={(v) => updateField('contact_email', v)} />
                <Field label="Phone (optional)" value={form.contact_phone} onChange={(v) => updateField('contact_phone', v)} />
              </div>

              {/* Line items */}
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum, marginTop: 32, marginBottom: 14 }}>STEP 2 · WHAT YOU HAVE</div>
              <div style={{ fontSize: 13, color: D.ink2, marginBottom: 14, lineHeight: 1.55 }}>
                Add each lot as one line. If you have a spreadsheet, paste rows or attach by emailing it to <a href="mailto:surplus@unitemedical.net" style={{ color: D.plum }}>surplus@unitemedical.net</a> after you submit. Our AI will normalize descriptions and match against our catalog automatically.
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
                  <thead>
                    <tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                      <th style={{ textAlign: 'left', padding: '8px 4px' }}>DESCRIPTION</th>
                      <th style={{ textAlign: 'left', padding: '8px 4px', width: 90 }}>QTY</th>
                      <th style={{ textAlign: 'left', padding: '8px 4px', width: 130 }}>CONDITION</th>
                      <th style={{ textAlign: 'left', padding: '8px 4px', width: 140 }}>EXPIRY (optional)</th>
                      <th style={{ width: 36 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={l.id} style={{ borderTop: `1px solid ${D.line}` }}>
                        <td style={{ padding: '8px 4px' }}>
                          <input value={l.raw_description} onChange={(e) => updateLine(i, { raw_description: e.target.value })} placeholder="e.g. Cardinal exam gloves L, sealed cases" style={inputStyle} />
                        </td>
                        <td style={{ padding: '8px 4px' }}>
                          <input value={l.qty} type="number" min="1" onChange={(e) => updateLine(i, { qty: e.target.value })} placeholder="48" style={inputStyle} />
                        </td>
                        <td style={{ padding: '8px 4px' }}>
                          <select value={l.condition} onChange={(e) => updateLine(i, { condition: e.target.value })} style={{ ...inputStyle, appearance: 'auto' }}>
                            <option value="new_in_box">New in box</option>
                            <option value="opened">Opened</option>
                            <option value="expired">Expired</option>
                            <option value="unknown">Unknown</option>
                          </select>
                        </td>
                        <td style={{ padding: '8px 4px' }}>
                          <input type="date" value={l.expiry_date} onChange={(e) => updateLine(i, { expiry_date: e.target.value })} style={inputStyle} />
                        </td>
                        <td>
                          <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1} aria-label="Remove line" style={{ background: 'transparent', color: D.ink3, border: 'none', cursor: lines.length === 1 ? 'not-allowed' : 'pointer', padding: 6, opacity: lines.length === 1 ? 0.3 : 1 }}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 12 }}>
                <button type="button" onClick={addLine} style={{ background: 'transparent', color: D.plum, border: `1px solid ${D.line}`, padding: '8px 14px', borderRadius: 999, fontSize: 13, cursor: 'pointer' }}>
                  + Add another line
                </button>
              </div>

              {/* Notes */}
              <div style={{ marginTop: 24 }}>
                <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum, marginBottom: 8 }}>NOTES (OPTIONAL)</div>
                <textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Anything we should know — pickup windows, lot sizes, why you're moving inventory…" />
              </div>

              {error && (
                <div style={{ marginTop: 18, padding: 12, borderRadius: 8, background: '#fbe9e1', color: '#7a2d10', fontSize: 13 }}>{error}</div>
              )}

              <div style={{ marginTop: 28, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="submit" disabled={submitting} style={{ background: D.plum, color: D.paper, border: 'none', padding: '14px 24px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  {submitting ? 'Submitting…' : <>Submit for offer <Icon.arrow /></>}
                </button>
                <div style={{ fontSize: 12, color: D.ink3 }}>We respond in 1–2 business days. No obligation.</div>
              </div>
            </form>

            {/* How it works */}
            <div style={{ marginTop: 56 }}>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.5vw, 38px)', fontWeight: 400, letterSpacing: -0.7, margin: 0 }}>How surplus works at Unite.</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 16, marginTop: 28 }}>
                {[
                  ['1', 'You submit', 'Send us your excess inventory list — sealed cases, near-expiry, retired SKUs, anything moveable.'],
                  ['2', 'We evaluate', 'AI categorizes lines against our catalog. A buyer reviews and prices each lot at fair market value.'],
                  ['3', 'You accept', 'Get our offer in 1–2 business days. Accept and we schedule pickup at no cost to you.'],
                  ['4', 'You get paid', 'Net-30 ACH or check on accepted lots. Repeat-supplier accounts get priority + better pricing.'],
                ].map(([n, h, s]) => (
                  <div key={n} style={{ padding: '18px 18px 18px 0' }}>
                    <div style={{ height: 2, background: D.grad, borderRadius: 2, opacity: 0.9, marginBottom: 16 }} />
                    <div style={{ fontFamily: D.mono, fontSize: 11, color: D.plum, letterSpacing: 1 }}>STEP {n}</div>
                    <div style={{ fontFamily: D.display, fontSize: 22, marginTop: 10, letterSpacing: -0.3 }}>{h}</div>
                    <div style={{ fontSize: 13, color: D.ink2, marginTop: 8, lineHeight: 1.55 }}>{s}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: D.paper,
  border: `1px solid ${D.line}`,
  borderRadius: 8,
  fontSize: 13,
  fontFamily: D.sans,
  color: D.ink,
  outline: 'none',
  boxSizing: 'border-box',
};

function Field({ label, value, onChange, type = 'text', required = false, placeholder = '' }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginBottom: 6 }}>
        {label.toUpperCase()}{required ? ' *' : ''}
      </div>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </label>
  );
}
