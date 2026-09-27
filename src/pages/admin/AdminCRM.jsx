import { useMemo } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';

const STAGES = ['cold', 'warm', 'qualified', 'hot'];
const STAGE_LABEL = { cold: 'Cold', warm: 'Warm', qualified: 'Qualified', hot: 'Hot' };

export function AdminCRM() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const leads = db.useTable('leads', { orderBy: 'created_at', dir: 'desc' });
  const orgs = db.useTable('organizations');
  const activities = db.useTable('activities', { orderBy: 'created_at', dir: 'desc', limit: 8 });

  const grouped = useMemo(() => {
    const m = Object.fromEntries(STAGES.map((s) => [s, []]));
    leads.forEach((l) => { (m[l.status] || m.cold).push(l); });
    return m;
  }, [leads]);

  const pipelineValue = leads.reduce((a, b) => a + (b.est_annual_value || 0), 0);

  function advance(lead) {
    const i = STAGES.indexOf(lead.status);
    if (i < STAGES.length - 1) db.update('leads', lead.id, { status: STAGES[i + 1] });
  }
  function regress(lead) {
    const i = STAGES.indexOf(lead.status);
    if (i > 0) db.update('leads', lead.id, { status: STAGES[i - 1] });
  }


  return (
    <AdminShell active="customers">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 48 : 64}px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>SALES · CRM & PIPELINE</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', marginBottom: 22, flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>CRM · pipeline.</h1>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3 }}>Loaded CRM records</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 14 }}>
          {[
            [String(leads.length), 'Active leads', `${grouped.hot.length} hot`],
            [fmt.short(pipelineValue), 'Pipeline value', 'open opportunities'],
            [String(orgs.length), 'Organizations', `${orgs.filter((o) => o.tier === 'A').length} tier A`],
            ['Not measured', 'Avg rep reply', 'No response-time evidence connected'],
          ].map(([b, s, sub]) => (
            <div key={s} style={{ padding: isMobile ? 16 : 22, background: D.card, borderRadius: 14, border: `1px solid ${D.line}` }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{s.toUpperCase()}</div>
              <div style={{ fontFamily: D.display, fontSize: isMobile ? 24 : 36, color: D.ink, letterSpacing: -0.6, marginTop: 8 }}>{b}</div>
              <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 14 }}>
          <AdminCard title="Pipeline · click a lead to advance it">
            <div className={isMobile ? 'um-scroll-x' : ''}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(4, 220px)' : 'repeat(4,1fr)', gap: 10 }}>
              {STAGES.map((stage) => (
                <div key={stage} style={{ background: D.paperAlt, borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{STAGE_LABEL[stage].toUpperCase()}</div>
                    <div style={{ fontSize: 11, color: D.ink3, fontFamily: D.mono }}>{grouped[stage].length}</div>
                  </div>
                  {grouped[stage].slice(0, 4).map((lead) => (
                    <div key={lead.id} style={{ padding: 10, background: D.card, borderRadius: 8, marginBottom: 6, border: `1px solid ${D.line}` }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{lead.org_name}</div>
                      <div style={{ fontFamily: D.display, fontSize: 16, color: D.plum, marginTop: 2 }}>{fmt.short(lead.est_annual_value)}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button onClick={() => regress(lead)} style={{ flex: 1, fontSize: 10, fontFamily: D.mono, letterSpacing: 0.8, padding: '4px 6px', background: 'transparent', border: `1px solid ${D.line}`, borderRadius: 6, cursor: 'pointer', color: D.ink2 }}>← BACK</button>
                        <button onClick={() => advance(lead)} disabled={lead.status === 'hot'} style={{ flex: 1, fontSize: 10, fontFamily: D.mono, letterSpacing: 0.8, padding: '4px 6px', background: D.plum, color: D.paper, border: 'none', borderRadius: 6, cursor: lead.status === 'hot' ? 'default' : 'pointer', opacity: lead.status === 'hot' ? 0.4 : 1 }}>NEXT →</button>
                      </div>
                      <p style={{fontSize:11,color:D.ink3}}>Call notes require a recorded conversation. No automatic follow-up is sent from this view.</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            </div>
          </AdminCard>
          <AdminCard title="Today's activity">
            {activities.length === 0 && <div style={{ padding: 16, color: D.ink3 }}>No activity yet.</div>}
            {activities.map((a, i) => (
              <div key={a.id} style={{ padding: '12px 0', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, display: 'flex', gap: 12, alignItems: 'start' }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: a.kind === 'call' ? D.plum : a.kind === 'email' ? '#3b8760' : D.ink3, marginTop: 6 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.subject}</div>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 2 }}>{a.who} · {a.kind?.toUpperCase()}</div>
                </div>
                <div style={{ fontSize: 11, color: D.ink3, fontFamily: D.mono }}>{fmt.ago(a.created_at)}</div>
              </div>
            ))}
          </AdminCard>
        </div>
      </div>
    </AdminShell>
  );
}
