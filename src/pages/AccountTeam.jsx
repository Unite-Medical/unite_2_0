/**
 * Account · Team — PRD-14.
 *
 * Manage the users on a B2B account: see members + their org-level role,
 * invite teammates, change roles, and remove access. Owner-gated.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { auth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { inviteTeammate, updateMemberRole, removeMember, orgRoleOf, ORG_ROLES } from '../lib/team.js';

const ROLE_COLOR = { owner: '#1d5c4d', buyer: '#3b8760', viewer: D.ink3 };

export function AccountTeam() {
  const navigate = useNavigate();
  const session = auth.use();
  const org = auth.org();
  const { isMobile } = useViewport();
  const pad = isMobile ? 20 : 40;
  const orgId = session?.org_id || 'org_atlsurgical';

  const team = db.useTable('profiles', { where: { org_id: orgId }, orderBy: 'created_at' });
  const me = session?.user_id ? db.get('profiles', session.user_id) : null;
  const myRole = orgRoleOf(me, org);
  const canManage = myRole === 'owner';

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('buyer');
  const [notice, setNotice] = useState(null);

  useSEO({ title: 'Team & access', description: 'Manage who can access your account.', canonical: '/account/team', noindex: true });

  function invite() {
    const res = inviteTeammate({ orgId, email, name, org_role: role, invitedBy: session?.user_id });
    if (res.ok) { setNotice(`Invited ${email}.`); setEmail(''); setName(''); }
    else setNotice(res.reason === 'exists' ? 'That email already has an account.' : res.reason === 'bad_email' ? 'Enter a valid email.' : 'Could not invite.');
  }

  const card = { background: D.card, border: `1px solid ${D.line}`, borderRadius: 14 };

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <div style={{ padding: `${isMobile ? 32 : 56}px ${pad}px 24px`, maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>{(org?.name || 'YOUR ORGANIZATION').toUpperCase()}</div>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 6vw, 60px)', fontWeight: 400, letterSpacing: -1.2, margin: '12px 0 0' }}>Team &amp; access</h1>
          <div style={{ fontSize: 14, color: D.ink2, marginTop: 10 }}>
            {canManage ? 'Invite teammates and set what each person can do.' : 'Your account owner manages team access. You have ' + myRole + ' access.'}
          </div>
        </div>

        <div style={{ maxWidth: 1000, margin: '0 auto', padding: `8px ${pad}px 80px`, display: 'grid', gap: 18 }}>
          {/* Members */}
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.line}`, fontFamily: D.display, fontSize: 20 }}>Members ({team.length})</div>
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, textAlign: 'left' }}>
                    {['NAME', 'EMAIL', 'TITLE', 'ROLE', 'STATUS', ''].map((h) => <th key={h} style={{ padding: '10px 16px' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {team.map((u) => {
                    const r = orgRoleOf(u, org);
                    const isSelf = u.id === session?.user_id;
                    return (
                      <tr key={u.id} style={{ borderTop: `1px solid ${D.line}` }}>
                        <td style={{ padding: '12px 16px', fontWeight: 500 }}>{u.name}{isSelf && <span style={{ color: D.ink3, fontWeight: 400 }}> (you)</span>}</td>
                        <td style={{ padding: '12px 16px', color: D.ink2 }}>{u.email}</td>
                        <td style={{ padding: '12px 16px', color: D.ink2 }}>{u.title || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {canManage && !isSelf ? (
                            <select value={r} onChange={(e) => updateMemberRole(u.id, e.target.value)} style={{ padding: '5px 8px', borderRadius: 8, border: `1px solid ${D.line}`, background: D.paper, color: D.ink, fontSize: 12 }}>
                              {ORG_ROLES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : (
                            <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '3px 8px', borderRadius: 4, background: `${ROLE_COLOR[r]}20`, color: ROLE_COLOR[r] }}>{r.toUpperCase()}</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', color: u.status === 'invited' ? '#b3592b' : '#3b8760' }}>{(u.status || 'active').toUpperCase()}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {canManage && !isSelf && (
                            <button type="button" onClick={() => removeMember(u.id)} style={{ background: 'none', border: 'none', color: '#c3382d', cursor: 'pointer', fontSize: 12 }}>Remove</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {team.length === 0 && <tr><td colSpan={6} style={{ padding: 24, color: D.ink3 }}>No team members yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Invite */}
          {canManage && (
            <div style={{ ...card, padding: 22 }}>
              <div style={{ fontFamily: D.display, fontSize: 20 }}>Invite a teammate</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr auto auto', gap: 10, marginTop: 14, alignItems: 'center' }}>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com" style={{ padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${D.line}`, fontSize: 14, background: D.paper, color: D.ink, boxSizing: 'border-box' }} />
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" style={{ padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${D.line}`, fontSize: 14, background: D.paper, color: D.ink, boxSizing: 'border-box' }} />
                <select value={role} onChange={(e) => setRole(e.target.value)} style={{ padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${D.line}`, fontSize: 14, background: D.paper, color: D.ink }}>
                  {ORG_ROLES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <button type="button" onClick={invite} disabled={!email.trim()} style={{ background: D.plum, color: D.paper, border: 'none', padding: '12px 22px', borderRadius: 4, cursor: email.trim() ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600, opacity: email.trim() ? 1 : 0.5 }}>Invite</button>
              </div>
              {notice && <div style={{ marginTop: 12, fontSize: 13, color: D.ink2 }}>{notice}</div>}
              <div style={{ marginTop: 12, fontSize: 12, color: D.ink3 }}>
                <strong>owner</strong> manages team + terms · <strong>buyer</strong> can order and accept quotes · <strong>viewer</strong> is read-only.
              </div>
            </div>
          )}

          {!session && (
            <div style={{ textAlign: 'center', color: D.ink2, fontSize: 14 }}>
              <button type="button" onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', color: D.plum, cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}>Sign in</button> to manage your team.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
