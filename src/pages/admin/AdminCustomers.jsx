import { useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';

const TIER_COLOR = { A: '#3b8760', B: D.plum, C: D.terra };
const TIERS = ['A', 'B', 'C'];
const TERMS = ['net30', 'net60', 'card', 'mspv', 'wire'];
const SEGMENTS = ['asc', 'pharmacy', 'gov', 'distributors', 'ems', 'hospital'];
const REPS = ['Damon Reed', 'Meredith Cole', 'Aidan Park', 'Terrell Jenkins', 'Miguel Vasquez'];

export function AdminCustomers() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const orgs = db.useTable('organizations', { orderBy: 'total_spend', dir: 'desc' });
  const [activeId, setActiveId] = useState(orgs[0]?.id);
  const active = db.useRow('organizations', activeId);
  const recentOrders = db.useTable('orders', { where: { customer_id: activeId }, orderBy: 'placed_at', dir: 'desc' }).slice(0, 6);
  const teammates = db.useTable('profiles', { where: { org_id: activeId } });
  const addresses = db.useTable('addresses', { where: { org_id: activeId } });

  function patchOrg(p) {
    if (!active) return;
    db.update('organizations', active.id, p);
  }

  return (
    <AdminShell active="customers">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>SALES · CUSTOMERS</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>Customers · {orgs.length}</h1>
      </div>
      <div style={{ padding: isMobile ? 20 : 32, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '320px 1fr', gap: 20 }}>
        <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, overflow: 'hidden' }}>
          {orgs.map((o) => (
            <button key={o.id} onClick={() => setActiveId(o.id)} style={{ width: '100%', textAlign: 'left', padding: '14px 16px', borderTop: `1px solid ${D.line}`, background: activeId === o.id ? 'rgba(94,41,99,.06)' : 'transparent', cursor: 'pointer', fontFamily: D.sans, color: D.ink, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{o.name}</div>
                <div style={{ fontSize: 12, color: D.ink2 }}>{(o.segment || '').toUpperCase()} · {o.account_rep}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: D.display, fontSize: 16, color: D.plum }}>{fmt.short(o.total_spend)}</div>
                <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: TIER_COLOR[o.tier] || D.ink3 }}>TIER {o.tier}</div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, padding: isMobile ? 22 : 28 }}>
          {!active && <div style={{ color: D.ink3 }}>Select an organization.</div>}
          {active && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ flex: '1 1 320px' }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{(active.segment || '').toUpperCase()} · TIER {active.tier}</div>
                  <input
                    value={active.name || ''}
                    onChange={(e) => patchOrg({ name: e.target.value })}
                    aria-label="Customer name"
                    style={{ fontFamily: D.display, fontSize: 36, letterSpacing: -0.7, lineHeight: 1.05, marginTop: 6, width: '100%', background: 'transparent', border: 'none', borderBottom: `1px solid transparent`, color: D.ink, outline: 'none', padding: 0, fontWeight: 400 }}
                    onFocus={(e) => (e.currentTarget.style.borderBottomColor = D.line)}
                    onBlur={(e) => (e.currentTarget.style.borderBottomColor = 'transparent')}
                  />
                </div>
              </div>

              <div style={{ marginTop: 18, padding: 16, background: D.paper, borderRadius: 10, border: `1px solid ${D.line}`, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
                <EditField label="Account rep">
                  <select value={active.account_rep || ''} onChange={(e) => patchOrg({ account_rep: e.target.value })} style={inputStyle}>
                    {REPS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </EditField>
                <EditField label="Segment">
                  <select value={active.segment || ''} onChange={(e) => patchOrg({ segment: e.target.value })} style={inputStyle}>
                    {SEGMENTS.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                  </select>
                </EditField>
                <EditField label="Tier">
                  <select value={active.tier || 'B'} onChange={(e) => patchOrg({ tier: e.target.value })} style={inputStyle}>
                    {TIERS.map((t) => <option key={t} value={t}>Tier {t}</option>)}
                  </select>
                </EditField>
                <EditField label="Terms">
                  <select value={active.terms || ''} onChange={(e) => patchOrg({ terms: e.target.value })} style={inputStyle}>
                    {TERMS.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                  </select>
                </EditField>
                <EditField label="Credit limit">
                  <input
                    type="number"
                    value={active.credit_limit || 0}
                    onChange={(e) => patchOrg({ credit_limit: Number(e.target.value) || 0 })}
                    style={inputStyle}
                  />
                </EditField>
                <EditField label="Lifetime spend">
                  <input
                    type="number"
                    value={active.total_spend || 0}
                    onChange={(e) => patchOrg({ total_spend: Number(e.target.value) || 0 })}
                    style={inputStyle}
                  />
                </EditField>
                <EditField label="Status">
                  <select value={active.status || 'active'} onChange={(e) => patchOrg({ status: e.target.value })} style={inputStyle}>
                    <option value="active">Active</option>
                    <option value="hold">On credit hold</option>
                    <option value="suspended">Suspended</option>
                    <option value="closed">Closed</option>
                  </select>
                </EditField>
                <div style={{ display: 'flex', alignItems: 'end' }}>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete customer ${active.name}? This cannot be undone.`)) {
                        db.remove('organizations', active.id);
                        setActiveId(orgs.find((o) => o.id !== active.id)?.id);
                      }
                    }}
                    style={{ background: 'transparent', color: D.terra, border: `1px solid ${D.terra}`, padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}
                  >
                    Delete customer
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12 }}>
                {[
                  [fmt.money(active.total_spend), 'Lifetime spend'],
                  [String(recentOrders.length), 'Recent orders'],
                  [String(teammates.length), 'Users'],
                  [String(addresses.length), 'Addresses'],
                ].map(([b, s]) => (
                  <div key={s} style={{ padding: 16, background: D.paper, borderRadius: 10, border: `1px solid ${D.line}` }}>
                    <div style={{ fontFamily: D.display, fontSize: 22, color: D.ink, letterSpacing: -0.4 }}>{b}</div>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginTop: 4 }}>{s.toUpperCase()}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 24, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>RECENT ORDERS</div>
              <div className="um-scroll-x">
              <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
                <thead>
                  <tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                    {['ORDER', 'DATE', 'TOTAL', 'STATUS'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => (
                    <tr key={o.id} style={{ borderTop: `1px solid ${D.line}` }}>
                      <td style={{ padding: '10px 12px', fontFamily: D.mono, color: D.plum }}>{o.id}</td>
                      <td style={{ padding: '10px 12px', color: D.ink2 }}>{fmt.date(o.placed_at)}</td>
                      <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{fmt.money(o.total)}</td>
                      <td style={{ padding: '10px 12px', color: D.ink2 }}>{o.status?.replace('_', ' ').toUpperCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function EditField({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3, marginBottom: 4 }}>{label.toUpperCase()}</div>
      {children}
    </label>
  );
}

const inputStyle = { width: '100%', padding: '8px 10px', background: D.paperAlt, border: `1px solid ${D.line}`, borderRadius: 6, fontSize: 12, color: D.ink, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
