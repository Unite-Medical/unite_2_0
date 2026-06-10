import { useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { gs1, hts } from '../../lib/services.js';
import { evaluateVendor } from '../../lib/vendorScoring.js';
import { useViewport } from '../../lib/viewport.js';

const BADGE = (s) => ({ pass: ['#2d6a4f', 'PASS'], warn: [D.terra, 'REVIEW'], fail: ['#c3382d', 'FAIL'], pending: [D.ink3, 'PENDING'], approved: ['#2d6a4f', 'APPROVED'], rejected: ['#c3382d', 'REJECTED'] })[s] || ['#8f8490', '—'];
const DECISION_COLOR = { AUTO_APPROVE: '#2d6a4f', MANUAL_REVIEW: D.terra, AUTO_REJECT: '#c3382d' };

export function AdminVendorApproval() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const vendors = db.useTable('vendors', { orderBy: 'name' });
  const [activeId, setActiveId] = useState(vendors[0]?.id);
  const active = db.useRow('vendors', activeId);
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState([]);
  const [scoring, setScoring] = useState(null);

  async function runChecks() {
    if (!active) return;
    setRunning(true);
    setChecks([]);
    setScoring(null);

    // PRD-07 Phase 2: real vendor scoring against openFDA.
    const result = await evaluateVendor({
      name: active.name,
      fei_number: active.fei_number,
      country_of_origin: active.country,
      business_age_years: active.business_age_years,
      importgenius_annual_usd: active.importgenius_annual_usd,
    });
    setScoring(result);

    // Supplementary point-checks (GS1 + HTS) — these flow into the
    // product onboarding workflow (PRD-07 Phase 3); displayed here as
    // confirmation that the rest of the pipeline is ready.
    const gtin = await gs1.validateGTIN('00012345678905');
    setChecks((c) => [...c, { name: 'GS1 GTIN validation · sample SKU', status: gtin.valid ? 'pass' : 'warn', detail: `GTIN ${gtin.gtin}` }]);
    const dutyA = await hts.lookup('9021.10');
    setChecks((c) => [...c, { name: 'HTS lookup · sample code (9021.10)', status: 'pass', detail: `${dutyA.description} · ${dutyA.mfn}% MFN` }]);
    setChecks((c) => [...c, { name: 'Country of origin · TAA flag', status: active.country === 'US' ? 'pass' : 'warn', detail: `Origin: ${active.country || '—'}` }]);
    setChecks((c) => [...c, { name: 'Product liability insurance certificate', status: active.insurance_on_file ? 'pass' : 'warn', detail: active.insurance_on_file ? 'On file' : 'Not on file — request from vendor' }]);

    setRunning(false);
  }

  function approve() {
    if (active) db.update('vendors', active.id, { status: 'approved', last_audit: new Date().toISOString(), approval_score: scoring?.score, approval_decision: scoring?.decision });
  }
  function reject() {
    if (active) db.update('vendors', active.id, { status: 'rejected', last_audit: new Date().toISOString(), approval_score: scoring?.score, approval_decision: scoring?.decision });
  }

  return (
    <AdminShell active="vendors">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>VENDORS · APPROVAL REVIEW</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>{vendors.length} vendors</h1>
      </div>
      <div style={{ padding: isMobile ? 20 : 32, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '320px 1fr', gap: 20 }}>
        <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${D.line}`, fontFamily: D.display, fontSize: 18 }}>Vendors</div>
          {vendors.map((v) => {
            const [color, label] = BADGE(v.status);
            return (
              <button key={v.id} onClick={() => { setActiveId(v.id); setChecks([]); }} style={{ width: '100%', textAlign: 'left', display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8, padding: '14px 16px', borderTop: `1px solid ${D.line}`, background: activeId === v.id ? 'rgba(94,41,99,.06)' : 'transparent', cursor: 'pointer', fontFamily: D.sans, color: D.ink, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{v.name}</div>
                  <div style={{ fontSize: 12, color: D.ink2 }}>{v.country} · audit {fmt.ago(v.last_audit) || 'never'}</div>
                </div>
                <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '3px 8px', borderRadius: 999, background: `${color}20`, color, textAlign: 'center' }}>{label}</span>
              </button>
            );
          })}
        </div>

        <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, padding: isMobile ? 22 : 28 }}>
          {!active && <div style={{ color: D.ink3 }}>Select a vendor to review.</div>}
          {active && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>VENDOR · {active.country}</div>
                  <div style={{ fontFamily: D.display, fontSize: 36, letterSpacing: -0.7, lineHeight: 1.05, marginTop: 6 }}>{active.name}</div>
                  <div style={{ fontSize: 13, color: D.ink2, marginTop: 6 }}>FDA registered: {active.fda_registered ? 'yes' : 'no'} · GS1 validated: {active.gs1_validated ? 'yes' : 'pending'}</div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={reject} style={{ background: 'transparent', color: '#c3382d', border: '1.5px solid #c3382d', padding: '10px 18px', borderRadius: 999, fontSize: 13, cursor: 'pointer' }}>Reject</button>
                  <button onClick={approve} style={{ background: D.plum, color: D.paper, border: 'none', padding: '10px 22px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Approve as partner</button>
                </div>
              </div>

              <div style={{ marginTop: 28, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={runChecks} disabled={running} style={{ background: D.ink, color: D.paper, border: 'none', padding: '11px 20px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: running ? 'wait' : 'pointer', opacity: running ? 0.6 : 1 }}>
                  {running ? 'Running checks…' : 'Run vendor approval pipeline'}
                </button>
                <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>
                  {scoring ? `Scored · ${scoring.components.length} components` : 'Idle'}
                </div>
              </div>

              {/* Scoring summary card */}
              {scoring && (
                <div style={{ marginTop: 22, padding: 20, borderRadius: 12, background: D.paperAlt, border: `1px solid ${D.line}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
                    <div>
                      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>DECISION</div>
                      <div style={{ fontFamily: D.display, fontSize: 28, color: DECISION_COLOR[scoring.decision] || D.ink, marginTop: 4, letterSpacing: -0.3 }}>
                        {scoring.decision.replace('_', ' ')}
                      </div>
                      {scoring.reason && (
                        <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{scoring.reason}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>SCORE</div>
                      <div style={{ fontFamily: D.display, fontSize: 42, color: D.plum, marginTop: 4, letterSpacing: -0.4 }}>
                        {scoring.score}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 18, borderTop: `1px solid ${D.line}`, paddingTop: 16 }}>
                    {scoring.components.map((cmp) => (
                      <div key={cmp.name} style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 12, padding: '6px 0', alignItems: 'center', fontSize: 13 }}>
                        <div>
                          <div style={{ fontWeight: 500 }}>{cmp.name}</div>
                          <div style={{ fontSize: 11, color: D.ink2, marginTop: 2 }}>{cmp.detail}</div>
                        </div>
                        <span style={{ fontFamily: D.mono, fontSize: 13, textAlign: 'right', color: cmp.points > 0 ? '#2d6a4f' : cmp.points < 0 ? '#c3382d' : D.ink3 }}>
                          {cmp.points > 0 ? '+' : ''}{cmp.points}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 24 }}>
                {checks.length === 0 && !scoring && <div style={{ color: D.ink3, fontSize: 13 }}>No checks run yet. Hit the button.</div>}
                {checks.map((c, i) => {
                  const [color, label] = BADGE(c.status);
                  return (
                    <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 16, padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{c.detail}</div>
                      </div>
                      <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, padding: '4px 10px', borderRadius: 999, background: `${color}20`, color, textAlign: 'center' }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
