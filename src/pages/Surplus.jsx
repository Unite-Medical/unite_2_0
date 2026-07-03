/**
 * Surplus intake — seller side of the brokered marketplace (PRD-29 §5).
 *
 * Pivoted off the old "sell us your surplus / Net-30 on accepted lots"
 * buy-and-stock model. Unite is a transaction bridge: you list your
 * excess/expired/random inventory with a target price, we market it to
 * buyers across multiple channels (medical, veterinary, research,
 * non-medical, overseas), and when an offer meets your target the deal is
 * binding — Unite earns a transparent connection fee, paid before the two
 * sides are connected. Direct purchase by Unite stays possible for lots
 * worth owning, but it's the exception, not the default.
 *
 * Intake supports manual line entry AND CSV upload (with a downloadable
 * template). AI line-normalization (surplus/line_normalize) is kept.
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

const EMPTY_LINE = () => ({ id: uid('ln'), raw_description: '', qty: '', condition: 'unknown', expiry_date: '', target_usd_per_unit: '' });

const CSV_TEMPLATE = [
  'description,qty,condition,expiry_date,target_price_per_unit',
  'Cardinal exam gloves L sealed cases,48,new_in_box,2027-03-01,4.50',
  'Rapid strep test kits 25ct,12,new_in_box,2026-11-15,28.00',
  'Suture 3-0 absorbable (expired),30,expired,2025-01-01,1.25',
].join('\n');

const CONDITIONS = ['new_in_box', 'opened', 'expired', 'unknown'];

/** Minimal CSV parser — handles quoted fields with embedded commas. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

function csvToLines(text) {
  const rows = parseCsv(String(text || ''));
  if (!rows.length) return [];
  // Header row optional — detect it by a non-numeric qty column.
  const hasHeader = rows[0].some((h) => /desc|qty|quantity|condition|expiry|target|price/i.test(h));
  const body = hasHeader ? rows.slice(1) : rows;
  return body.slice(0, 200).map(([desc = '', qty = '', condition = '', expiry = '', target = '']) => ({
    id: uid('ln'),
    raw_description: desc.trim(),
    qty: String(parseInt(qty, 10) || ''),
    condition: CONDITIONS.includes(condition.trim().toLowerCase()) ? condition.trim().toLowerCase() : 'unknown',
    expiry_date: /^\d{4}-\d{2}-\d{2}$/.test(expiry.trim()) ? expiry.trim() : '',
    target_usd_per_unit: String(parseFloat(target) || ''),
  })).filter((l) => l.raw_description);
}

export function Surplus() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;

  useSEO({
    title: 'Move your surplus medical inventory',
    description: 'List excess, near-expiry, or expired medical inventory with your target price. Unite brokers it to buyers across medical, veterinary, research, and overseas channels — you set the target, we bridge the deal for a transparent fee.',
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
  const [csvNote, setCsvNote] = useState(null);

  function updateField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function updateLine(idx, patch) {
    setLines((arr) => arr.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((arr) => [...arr, EMPTY_LINE()]); }
  function removeLine(idx) { setLines((arr) => arr.length > 1 ? arr.filter((_, i) => i !== idx) : arr); }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'unite-surplus-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function onCsvUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = csvToLines(String(reader.result || ''));
      if (!parsed.length) {
        setCsvNote('Couldn\u2019t read any lines from that file — check it against the template.');
        return;
      }
      setLines(parsed);
      setCsvNote(`${parsed.length} line${parsed.length === 1 ? '' : 's'} loaded from ${file.name}. Review and adjust below.`);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);

    const validLines = lines
      .map((l) => ({ ...l, qty: parseInt(l.qty, 10), target_usd_per_unit: parseFloat(l.target_usd_per_unit) || null }))
      .filter((l) => l.raw_description.trim().length > 0 && Number.isFinite(l.qty) && l.qty > 0);

    if (!form.contact_email.trim()) {
      setError('Email is required so we can reach you when a buyer bites.');
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

      // AI line-normalization (kept per §5.2.2) — stubbed until keys land.
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
          target_usd_per_unit: l.target_usd_per_unit,
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
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>LISTING RECEIVED</div>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 7vw, 64px)', fontWeight: 400, letterSpacing: -1.2, margin: 0, lineHeight: 1.05 }}>
            We&apos;re on it. <Grad>Buyers next.</Grad>
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: D.ink2, marginTop: 22 }}>
            Our surplus desk reviews your list, confirms targets, and starts marketing it across
            our buyer channels. We&apos;ll email <strong>{form.contact_email}</strong> when there&apos;s
            a bite. Reference: <code>{submittedId}</code>.
          </p>
          <div style={{ marginTop: 30, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/')} style={{ background: D.plum, color: D.paper, border: 'none', padding: '13px 22px', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Back home</button>
            <button onClick={() => { setSubmittedId(null); setLines([EMPTY_LINE()]); }} style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '12px 22px', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}>List another lot</button>
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
          eyebrow="SURPLUS · OVERSTOCK · NEAR-EXPIRY · EXPIRED"
          title={<>Stuck with <em>excess</em> inventory?</>}
          sub="List it with your target price and we find the buyer — hospitals and clinics, plus veterinary, research, non-medical, and overseas channels most sellers never reach. When we bridge you to a buyer, we earn a transparent fee for the connection. That's the whole model."
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
                <Field label="Inventory location (city, state)" value={form.pickup_location} onChange={(v) => updateField('pickup_location', v)} placeholder="e.g. Atlanta, GA" />
                <Field label="Your name" required value={form.contact_name} onChange={(v) => updateField('contact_name', v)} />
                <Field label="Work email" required type="email" value={form.contact_email} onChange={(v) => updateField('contact_email', v)} />
                <Field label="Phone (optional)" value={form.contact_phone} onChange={(v) => updateField('contact_phone', v)} />
              </div>

              {/* Line items */}
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum, marginTop: 32, marginBottom: 14 }}>STEP 2 · WHAT YOU HAVE + YOUR TARGET PRICE</div>
              <div style={{ fontSize: 13, color: D.ink2, marginBottom: 14, lineHeight: 1.55 }}>
                Add each lot as one line and set the price you want per unit — you stay in control
                of the ask. Have a spreadsheet? Upload a CSV (use our template) and we&apos;ll load
                it here. Our AI normalizes descriptions and matches against known products automatically.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: D.ink, border: `1.5px solid ${D.ink}`, borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
                  Upload CSV
                  <input type="file" accept=".csv,.txt" onChange={onCsvUpload} style={{ display: 'none' }} />
                </label>
                <button type="button" onClick={downloadTemplate} style={{ fontSize: 13, fontWeight: 500, color: D.ink2, background: 'none', border: `1px solid ${D.line}`, borderRadius: 4, padding: '8px 16px', cursor: 'pointer', fontFamily: D.sans }}>
                  Download CSV template
                </button>
              </div>
              {csvNote && <div style={{ marginBottom: 12, fontSize: 13, color: D.plum }}>{csvNote}</div>}

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
                  <thead>
                    <tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                      <th style={{ textAlign: 'left', padding: '8px 4px' }}>DESCRIPTION</th>
                      <th style={{ textAlign: 'left', padding: '8px 4px', width: 80 }}>QTY</th>
                      <th style={{ textAlign: 'left', padding: '8px 4px', width: 120 }}>CONDITION</th>
                      <th style={{ textAlign: 'left', padding: '8px 4px', width: 130 }}>EXPIRY (optional)</th>
                      <th style={{ textAlign: 'left', padding: '8px 4px', width: 110 }}>TARGET $/UNIT</th>
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
                        <td style={{ padding: '8px 4px' }}>
                          <input value={l.target_usd_per_unit} type="number" min="0.01" step="0.01" onChange={(e) => updateLine(i, { target_usd_per_unit: e.target.value })} placeholder="4.50" style={inputStyle} />
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
                <button type="button" onClick={addLine} style={{ background: 'transparent', color: D.plum, border: `1px solid ${D.line}`, padding: '8px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>
                  + Add another line
                </button>
              </div>

              {/* Notes */}
              <div style={{ marginTop: 24 }}>
                <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum, marginBottom: 8 }}>NOTES (OPTIONAL)</div>
                <textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Anything buyers should know — lot sizes, storage conditions, why you're moving inventory…" />
              </div>

              {error && (
                <div style={{ marginTop: 18, padding: 12, borderRadius: 8, background: '#fbe9e1', color: '#7a2d10', fontSize: 13 }}>{error}</div>
              )}

              <div style={{ marginTop: 28, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="submit" disabled={submitting} style={{ background: D.plum, color: D.paper, border: 'none', padding: '14px 24px', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  {submitting ? 'Submitting…' : <>List my inventory <Icon.arrow /></>}
                </button>
                <div style={{ fontSize: 12, color: D.ink3 }}>No obligation. You approve every deal before it binds.</div>
              </div>
            </form>

            {/* How it works — the broker model */}
            <div style={{ marginTop: 56 }}>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.5vw, 38px)', fontWeight: 400, letterSpacing: -0.7, margin: 0 }}>How the bridge works.</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 16, marginTop: 28 }}>
                {[
                  ['1', 'You list', 'Upload your excess, near-expiry, or expired inventory — manual entry or CSV — and set your target price per unit.'],
                  ['2', 'We market it', 'We take your lots to buyers across every channel we serve: medical, veterinary, research, non-medical, and overseas. More channels, more exits.'],
                  ['3', 'A deal binds', 'A buyer offers, you accept against your target — the deal is binding. Unite collects its transparent connection fee up front.'],
                  ['4', 'We connect you', 'Fee cleared, we release the connection and you settle the goods directly. Want us to handle freight, compliance docs, or payments? We do that too.'],
                ].map(([n, h, s]) => (
                  <div key={n} style={{ padding: '18px 18px 18px 0' }}>
                    <div style={{ height: 2, background: D.grad, borderRadius: 2, opacity: 0.9, marginBottom: 16 }} />
                    <div style={{ fontFamily: D.mono, fontSize: 11, color: D.plum, letterSpacing: 1 }}>STEP {n}</div>
                    <div style={{ fontFamily: D.display, fontSize: 22, marginTop: 10, letterSpacing: -0.3 }}>{h}</div>
                    <div style={{ fontSize: 13, color: D.ink2, marginTop: 8, lineHeight: 1.55 }}>{s}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 24, padding: isMobile ? 18 : 24, background: D.paperAlt, border: `1px solid ${D.line}`, borderRadius: 14, fontSize: 13.5, color: D.ink2, lineHeight: 1.65 }}>
                <strong style={{ color: D.ink }}>Transparent by design.</strong> Unite doesn&apos;t want to
                stand in the way of you moving your products — if we bridge you to a buyer, we earn a
                fee for the connection. For lots worth owning we may also make you a direct offer, but
                brokering is the default: we don&apos;t sit on your inventory hoping it sells.
                Compliance responsibilities for regulated and expired goods rest with buyer and
                seller per our marketplace terms; expired product is never sold into clinical use.
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
