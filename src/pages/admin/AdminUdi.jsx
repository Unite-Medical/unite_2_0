import { useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { db } from '../../lib/db.js';
import { useViewport } from '../../lib/viewport.js';
import {
  prefixStatus,
  UDI_MODELS,
  MODEL_C_TERMS,
  recordAcknowledgment,
  promoteGateRecord,
  updateUdiFields,
  fieldsForClass,
  generateLabelSpec,
  complianceCheckLabel,
  markSubmitted,
  LABEL_REQUIRED_ELEMENTS,
  LABELERS,
} from '../../lib/gudid.js';
import { downloadGudidIntakeTemplate } from '../../lib/gudidTemplate.js';

const INPUT = { padding: '9px 12px', borderRadius: 4, border: `1px solid ${D.line}`, fontFamily: D.mono, fontSize: 13, color: D.ink, background: D.card };
const BTN = { background: D.plum, color: D.paper, border: 'none', padding: '9px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const BTN_GHOST = { ...BTN, background: D.card, color: D.plum, border: `1.5px solid ${D.plum}` };

const STATUS_COLOR = {
  gate_open: D.terra,
  draft: D.ink3,
  ready_to_label: D.plum,
  ready_for_gudid: D.plum,
  submitted: '#3b8760',
};

function StatusPill({ status }) {
  return (
    <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: STATUS_COLOR[status] || D.ink3 }}>
      {String(status || '—').toUpperCase().replace(/_/g, ' ')}
    </span>
  );
}

/** Inline desk action: determine model + class on a gate-opened record. */
function GateIntake({ rec, onDone }) {
  const [model, setModel] = useState('A');
  const [klass, setKlass] = useState('1');
  const [labeler, setLabeler] = useState('unite');
  const [customerDi, setCustomerDi] = useState('');
  const [err, setErr] = useState('');

  function go() {
    const res = promoteGateRecord(rec.id, { model, device_class: Number(klass), labeler, customer_di: customerDi });
    if (!res.ok) { setErr(res.reason.replace(/_/g, ' ')); return; }
    setErr('');
    onDone?.();
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <select value={model} onChange={(e) => setModel(e.target.value)} style={INPUT}>
        {Object.keys(UDI_MODELS).map((m) => <option key={m} value={m}>Model {m}</option>)}
      </select>
      <select value={klass} onChange={(e) => setKlass(e.target.value)} style={INPUT}>
        <option value="1">Class 1</option>
        <option value="2">Class 2</option>
      </select>
      {model !== 'B' && (
        <select value={labeler} onChange={(e) => setLabeler(e.target.value)} style={INPUT}>
          {Object.values(LABELERS).map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
        </select>
      )}
      {model === 'B' && (
        <input value={customerDi} onChange={(e) => setCustomerDi(e.target.value)} placeholder="Customer DI (GTIN)" style={{ ...INPUT, width: 170 }} />
      )}
      <button onClick={go} style={BTN}>Assign DI + intake</button>
      {err && <span style={{ color: D.terra, fontFamily: D.mono, fontSize: 11 }}>{err}</span>}
    </div>
  );
}

/**
 * Intake editor for draft records — captures the Class 1/2 GUDID fields
 * in-app with the same validation the engine enforces, so a draft can
 * reach ready_to_label without a spreadsheet round-trip.
 */
function IntakeEditor({ rec, onDone }) {
  const [values, setValues] = useState({ ...rec.fields });
  const [errors, setErrors] = useState(rec.field_errors || []);
  const errFor = (key) => errors.find((e) => e.field === key)?.problem;
  const set = (key, v) => setValues((prev) => ({ ...prev, [key]: v }));

  function save() {
    const res = updateUdiFields(rec.id, values);
    if (!res.ok) return;
    setErrors(res.validation.errors);
    if (res.validation.ok) onDone?.();
  }

  return (
    <div style={{ marginTop: 10, borderTop: `1px dashed ${D.line}`, paddingTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
        {fieldsForClass().map((f) => {
          const err = errFor(f.key);
          const label = (
            <div style={{ fontFamily: D.mono, fontSize: 9.5, letterSpacing: 0.8, color: err ? D.terra : D.ink3, marginBottom: 3, textTransform: 'uppercase' }}>
              {f.label}{err ? ` — ${err}` : ''}
            </div>
          );
          const style = { ...INPUT, width: '100%', borderColor: err ? D.terra : D.line };
          if (f.type === 'yn') {
            return (
              <div key={f.key}>{label}
                <select value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} style={style}>
                  <option value="">—</option><option value="Y">Y</option><option value="N">N</option>
                </select>
              </div>
            );
          }
          if (f.options) {
            return (
              <div key={f.key}>{label}
                <select value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} style={style}>
                  <option value="">—</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            );
          }
          return (
            <div key={f.key}>{label}
              <input value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.hint || ''} style={style} />
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={save} style={BTN}>Validate &amp; save intake</button>
        <span style={{ fontFamily: D.mono, fontSize: 11, color: errors.length ? D.terra : '#3b8760' }}>
          {errors.length ? `${errors.length} field(s) outstanding` : 'Complete'}
        </span>
      </div>
    </div>
  );
}

/** Path-2 checklist: which required elements are on the uploaded label. */
function LabelCheck({ rec, onDone }) {
  const [present, setPresent] = useState([]);
  const [result, setResult] = useState(null);
  const toggle = (k) => setPresent((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  function run() {
    const res = complianceCheckLabel(rec.id, { present, filename: 'uploaded-label.pdf' });
    setResult(res);
    if (res.ok) onDone?.();
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '6px 0' }}>
        {LABEL_REQUIRED_ELEMENTS.map((el) => (
          <label key={el.key} style={{ fontSize: 12, color: D.ink2, display: 'flex', gap: 5, alignItems: 'center' }}>
            <input type="checkbox" checked={present.includes(el.key)} onChange={() => toggle(el.key)} />
            {el.label}
          </label>
        ))}
      </div>
      <button onClick={run} style={BTN_GHOST}>Run compliance check</button>
      {result && !result.ok && (
        <span style={{ marginLeft: 10, color: D.terra, fontSize: 12 }}>
          Missing: {result.missing.map((m) => m.label).join(' · ')}
        </span>
      )}
    </div>
  );
}

export function AdminUdi() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  db.useTable('gs1_prefixes');
  const records = db.useTable('udi_records');
  const acks = db.useTable('labeler_acknowledgments');
  const prefixes = prefixStatus();

  const [ackName, setAckName] = useState('');
  const [ackSigner, setAckSigner] = useState('');
  const [expanded, setExpanded] = useState(null);

  function signAck() {
    const res = recordAcknowledgment({
      customer_name: ackName.trim(),
      signer: ackSigner.trim(),
      accepted_terms: MODEL_C_TERMS,
    });
    if (res.ok) { setAckName(''); setAckSigner(''); }
  }

  const open = records.filter((r) => r.status !== 'submitted');
  const submitted = records.filter((r) => r.status === 'submitted');

  return (
    <AdminShell active="udi">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px 64px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>COMPLIANCE · UDI / GUDID</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, margin: '0 0 8px' }}>UDI &amp; GUDID.</h1>
        <p style={{ color: D.ink2, maxWidth: 720, margin: '0 0 22px' }}>
          Device Identifier assignment, GS1 prefix capacity, and GUDID-ready record preparation.
          Phase 1: records are prepared here and submitted manually via the FDA GUDID portal.
        </p>

        <AdminCard title="GS1 prefix capacity — DIs are only issued from medical-flagged prefixes">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button onClick={downloadGudidIntakeTemplate} style={BTN_GHOST}>Download intake templates (Class 1 + 2)</button>
          </div>
          <div className="um-scroll-x">
            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{['PREFIX', 'LABELER', 'MEDICAL', 'USED', 'REMAINING', 'EXPIRES', 'STATUS'].map((h) => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${D.line}` }}>{h}</th>)}</tr></thead>
              <tbody>
                {prefixes.map((p) => (
                  <tr key={p.id} style={{ borderTop: `1px solid ${D.line}` }}>
                    <td style={{ padding: '8px 12px', fontFamily: D.mono }}>{p.prefix}</td>
                    <td style={{ padding: '8px 12px' }}>{LABELERS[p.labeler]?.name || p.labeler}</td>
                    <td style={{ padding: '8px 12px', fontFamily: D.mono, fontSize: 11, color: p.medical ? D.plum : D.ink3 }}>{p.medical ? 'YES' : 'NO'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: D.mono }}>{p.used} / {p.capacity}</td>
                    <td style={{ padding: '8px 12px', fontFamily: D.mono, color: p.alert ? D.terra : D.ink }}>{p.remaining}</td>
                    <td style={{ padding: '8px 12px', color: D.ink2 }}>{p.expires}</td>
                    <td style={{ padding: '8px 12px', fontFamily: D.mono, fontSize: 11, color: p.exhausted ? D.terra : p.alert ? D.terra : '#3b8760' }}>
                      {p.exhausted ? 'EXHAUSTED' : p.alert ? `⚠ NEAR CAP (≤20)` : 'OK'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>

        <div style={{ height: 14 }} />

        <AdminCard title={`UDI records — post-quote gate queue (${open.length} open · ${submitted.length} submitted)`}>
          {open.length === 0 && <div style={{ color: D.ink3, fontSize: 13 }}>No open records. The gate opens automatically when an order with import / private-label lines commits.</div>}
          {open.map((r) => (
            <div key={r.id} style={{ border: `1px solid ${D.line}`, borderRadius: 6, padding: '12px 14px', marginBottom: 10, background: D.card }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontFamily: D.mono, fontSize: 12, color: D.plum }}>{r.id}</span>
                  <span style={{ margin: '0 10px', color: D.ink2, fontSize: 13 }}>{r.fields?.device_description || r.brand || '—'}</span>
                  <StatusPill status={r.status} />
                </div>
                <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>
                  {r.order_id ? `ORDER ${r.order_id}` : ''} {r.model ? `· MODEL ${r.model}` : ''} {r.device_class ? `· CLASS ${r.device_class}` : ''} {r.di ? `· DI ${r.di}` : ''}
                </div>
              </div>

              {r.status === 'gate_open' && <div style={{ marginTop: 10 }}><GateIntake rec={r} onDone={() => setExpanded(null)} /></div>}

              {r.status === 'draft' && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: D.terra, marginBottom: 6 }}>
                    {r.field_errors?.length || 0} intake field(s) outstanding — Class {r.device_class} record.
                  </div>
                  <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} style={BTN_GHOST}>
                    {expanded === r.id ? 'Close intake' : 'Capture intake fields…'}
                  </button>
                  {expanded === r.id && <IntakeEditor rec={r} onDone={() => setExpanded(null)} />}
                </div>
              )}

              {r.status === 'ready_to_label' && (
                <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={() => { generateLabelSpec(r.id); }} style={BTN}>Generate label (our template)</button>
                  <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} style={BTN_GHOST}>Check uploaded label…</button>
                </div>
              )}
              {r.status === 'ready_to_label' && expanded === r.id && <div style={{ marginTop: 8 }}><LabelCheck rec={r} onDone={() => setExpanded(null)} /></div>}

              {r.status === 'ready_for_gudid' && (
                <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
                  {r.submitter === 'customer'
                    ? <span style={{ fontSize: 12, color: D.ink2 }}>Model B — the customer submits this GUDID record.</span>
                    : <button onClick={() => markSubmitted(r.id)} style={BTN}>Mark submitted via GUDID portal</button>}
                </div>
              )}
            </div>
          ))}
        </AdminCard>

        <div style={{ height: 14 }} />

        <AdminCard title={`Model C acknowledgments (${acks.length}) — required before Unite becomes labeler of record`}>
          <ul style={{ margin: '0 0 12px 18px', color: D.ink2, fontSize: 12.5 }}>
            {MODEL_C_TERMS.map((t, i) => <li key={i} style={{ marginBottom: 3 }}>{t}</li>)}
          </ul>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={ackName} onChange={(e) => setAckName(e.target.value)} placeholder="Customer / company name" style={{ ...INPUT, minWidth: 220 }} />
            <input value={ackSigner} onChange={(e) => setAckSigner(e.target.value)} placeholder="Signer (name, title)" style={{ ...INPUT, minWidth: 200 }} />
            <button onClick={signAck} disabled={!ackName.trim() || !ackSigner.trim()} style={{ ...BTN, opacity: ackName.trim() && ackSigner.trim() ? 1 : 0.5 }}>Record signed acknowledgment</button>
          </div>
          {acks.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 12 }}>
              <thead><tr style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{['CUSTOMER', 'SIGNER', 'SIGNED'].map((h) => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${D.line}` }}>{h}</th>)}</tr></thead>
              <tbody>
                {acks.map((a) => (
                  <tr key={a.id} style={{ borderTop: `1px solid ${D.line}` }}>
                    <td style={{ padding: '8px 12px' }}>{a.customer_name}</td>
                    <td style={{ padding: '8px 12px', color: D.ink2 }}>{a.signer}</td>
                    <td style={{ padding: '8px 12px', fontFamily: D.mono, fontSize: 12 }}>{new Date(a.signed_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminCard>
      </div>
    </AdminShell>
  );
}
