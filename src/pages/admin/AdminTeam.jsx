import { useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { useViewport } from '../../lib/viewport.js';
import { GRANTS, GRANT_LABEL, repAuthority } from '../../lib/repAuthority.js';

// PRD-26 §9 — rep order-entry authority matrix. Admin grants per-rep
// permissions; placeOrder enforces them and audits every override + denial.
export function AdminTeam() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const profiles = db.useTable('profiles');
  const grantRows = db.useTable('rep_order_grants');
  const reps = profiles.filter((p) => p.role === 'admin' || p.role === 'rep');
  const [activeId, setActiveId] = useState(reps[0]?.id);
  const active = reps.find((r) => r.id === activeId) || reps[0];

  const has = (repId, grant) => grantRows.some((g) => g.rep_id === repId && g.grant === grant);
  const rowFor = (repId, grant) => grantRows.find((g) => g.rep_id === repId && g.grant === grant);

  function toggle(grant) {
    if (!active) return;
    if (has(active.id, grant)) repAuthority.revoke(active.id, grant);
    else repAuthority.grant({ rep_id: active.id, grant, max_discount_pct: grant === 'discount' ? 10 : null, granted_by: 'usr_admin' });
  }
  function setCap(grant, val) {
    repAuthority.grant({ rep_id: active.id, grant, max_discount_pct: Number(val) || 0, granted_by: 'usr_admin' });
  }

  const denials = db.useTable('audit_log').filter((a) => a.kind === 'rep.authority_denied').slice(-8).reverse();

  return (
    <AdminShell active="team">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px 24px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>TEAM · ORDER-ENTRY AUTHORITY (RBAC)</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>Rep authority</h1>
        <p style={{ color: D.ink2, marginTop: 10, maxWidth: 640 }}>What each rep may change when placing an order for a customer. Every override is bounded and audited; attempts beyond a grant are rejected and logged.</p>
      </div>

      <div style={{ padding: isMobile ? 20 : 32, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '260px 1fr', gap: 20 }}>
        <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, overflow: 'hidden', height: 'fit-content' }}>
          {reps.map((r) => (
            <button key={r.id} onClick={() => setActiveId(r.id)} style={{ width: '100%', textAlign: 'left', padding: '14px 16px', borderTop: `1px solid ${D.line}`, background: active?.id === r.id ? 'rgba(94,41,99,.06)' : 'transparent', cursor: 'pointer', fontFamily: D.sans, color: D.ink }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: D.ink2 }}>{r.title || r.role} · {grantRows.filter((g) => g.rep_id === r.id).length} grants</div>
            </button>
          ))}
        </div>

        <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, padding: isMobile ? 20 : 26 }}>
          {active && (
            <>
              <div style={{ fontFamily: D.display, fontSize: 26, letterSpacing: -0.4 }}>{active.name}</div>
              <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3, letterSpacing: 1, marginBottom: 16 }}>{(active.title || active.role || '').toUpperCase()}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {GRANTS.map((grant) => {
                  const on = has(active.id, grant);
                  return (
                    <div key={grant} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: `1px solid ${on ? D.plum : D.line}`, background: on ? 'rgba(94,41,99,.05)' : D.paper }}>
                      <button onClick={() => toggle(grant)} aria-pressed={on} style={{ width: 40, height: 22, borderRadius: 11, border: 'none', background: on ? D.plum : D.line, position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                        <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: D.paper, transition: 'left .15s' }} />
                      </button>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: D.mono, fontSize: 12, color: D.ink }}>{grant}</div>
                        <div style={{ fontSize: 12, color: D.ink2 }}>{GRANT_LABEL[grant]}</div>
                      </div>
                      {grant === 'discount' && on && (
                        <label style={{ fontSize: 12, color: D.ink2, display: 'flex', alignItems: 'center', gap: 6 }}>
                          max
                          <input type="number" min="0" max="100" defaultValue={rowFor(active.id, grant)?.max_discount_pct ?? 10} onBlur={(e) => setCap(grant, e.target.value)} style={{ width: 60, padding: '6px 8px', border: `1px solid ${D.line}`, borderRadius: 6, fontFamily: D.mono }} />%
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ marginTop: 26, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>RECENT DENIED ATTEMPTS</div>
          {denials.length === 0 && <div style={{ fontSize: 12, color: D.ink3, marginTop: 8 }}>None — no rep has exceeded their authority.</div>}
          {denials.map((a) => (
            <div key={a.id} style={{ fontSize: 12, color: D.ink2, marginTop: 8, fontFamily: D.mono }}>
              {a.ref_id} → {(a.payload?.violations || []).join(', ')}
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
