import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { auth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { fmt, uid } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const TABS = ['Profile', 'Team & access', 'Saved addresses', 'Billing & terms', 'Integrations', 'Audit log'];

export function AccountSettings() {
  const navigate = useNavigate();
  const session = auth.use();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({ title: 'Account settings', noindex: true });
  const orgId = session?.org_id || null;
  const profile = db.useRow('profiles', session?.user_id || '__none__');
  const org = db.useRow('organizations', orgId || '__none__');
  const addresses = db.useTable('addresses', { where: orgId ? { org_id: orgId } : { org_id: '__none__' } });
  const teammates = db.useTable('profiles', { where: orgId ? { org_id: orgId } : { org_id: '__none__' } });
  const auditLog = db.useTable('audit_log', { orderBy: 'created_at', dir: 'desc', limit: 8 });

  const [tab, setTab] = useState('Profile');
  const [name, setName] = useState(profile?.name || '');
  const [title, setTitle] = useState(profile?.title || '');
  const [editing, setEditing] = useState(false);

  if (!session) {
    return (
      <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
        <Nav />
        <main style={{ maxWidth: 640, margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
          <h1 style={{ fontFamily: D.display, fontSize: 56, fontWeight: 400, letterSpacing: -1.2, lineHeight: 1, margin: 0 }}>Sign in to view settings.</h1>
          <button onClick={() => navigate('/login')} style={{ marginTop: 16, background: D.plum, color: D.paper, border: 'none', padding: '13px 22px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Sign in</button>
        </main>
      </div>
    );
  }

  function saveProfile() {
    db.update('profiles', session.user_id, { name, title });
    setEditing(false);
  }

  function addAddress() {
    db.insert('addresses', {
      id: uid('adr'),
      org_id: orgId,
      label: 'New location',
      line1: '— address —',
      city: '',
      state: '',
      zip: '',
      is_default: false,
    });
  }

  function setDefault(id) {
    addresses.forEach((a) => db.update('addresses', a.id, { is_default: a.id === id }));
  }

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead eyebrow={`ACCOUNT · ${(org?.name || '').toUpperCase()}`} title="Settings" sub="Organization profile, team access, billing terms, and integrations — all in one pane." />
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: `24px ${padX}px ${isMobile ? 56 : 64}px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '240px 1fr', gap: isMobile ? 18 : 32 }}>
          <nav aria-label="Settings sections" className={isMobile ? 'um-scroll-x' : ''} style={isMobile ? { display: 'flex', gap: 6, paddingBottom: 6 } : undefined}>
            {TABS.map((s) => (
              <button key={s} onClick={() => setTab(s)} aria-current={tab === s ? 'page' : undefined} style={{ display: isMobile ? 'inline-block' : 'block', width: isMobile ? 'auto' : '100%', textAlign: 'left', padding: isMobile ? '8px 14px' : '11px 14px', borderRadius: isMobile ? 999 : 8, fontSize: 13, background: tab === s ? D.plum : (isMobile ? D.card : 'transparent'), color: tab === s ? D.paper : D.ink2, fontWeight: tab === s ? 600 : 500, cursor: 'pointer', marginBottom: isMobile ? 0 : 2, border: isMobile ? `1px solid ${tab === s ? D.plum : D.line}` : 'none', fontFamily: D.sans, whiteSpace: 'nowrap' }}>{s}</button>
            ))}
          </nav>

          <div style={{ display: 'grid', gap: 18 }}>
            {tab === 'Profile' && (
              <Card title="Your profile" action={editing ? <button onClick={saveProfile} style={{ background: D.plum, color: D.paper, border: 'none', padding: '8px 16px', borderRadius: 999, fontSize: 12, cursor: 'pointer' }}>Save</button> : <button onClick={() => setEditing(true)} style={{ background: 'transparent', color: D.plum, border: `1px solid ${D.plum}`, padding: '8px 16px', borderRadius: 999, fontSize: 12, cursor: 'pointer' }}>Edit</button>}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
                  <Cell label="Name">{editing ? <Input value={name} onChange={setName} /> : (profile?.name || '—')}</Cell>
                  <Cell label="Title">{editing ? <Input value={title} onChange={setTitle} /> : (profile?.title || '—')}</Cell>
                  <Cell label="Email">{profile?.email}</Cell>
                  <Cell label="Role">{(profile?.role || '').toUpperCase()}</Cell>
                </div>
              </Card>
            )}

            {tab === 'Profile' && (
              <Card title="Organization">
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
                  <Cell label="Legal name">{org?.name}</Cell>
                  <Cell label="Segment">{org?.segment?.toUpperCase()}</Cell>
                  <Cell label="Tier">{org?.tier}</Cell>
                  <Cell label="Account rep">{org?.account_rep}</Cell>
                  <Cell label="Total spend">{fmt.money(org?.total_spend || 0)}</Cell>
                  <Cell label="Customer since">{fmt.date(org?.created_at, { year: true })}</Cell>
                </div>
              </Card>
            )}

            {tab === 'Team & access' && (
              <Card title={`Team · ${teammates.length} members`}>
                {teammates.map((t, i) => (
                  <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '44px 1.3fr 1.2fr 120px', gap: 16, padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: D.plumSoft }} />
                    <div>
                      <div style={{ fontSize: 14, color: D.ink }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: D.ink2 }}>{t.title}</div>
                    </div>
                    <div style={{ fontSize: 13, color: D.ink2 }}>{t.email}</div>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{(t.role || '').toUpperCase()}</div>
                  </div>
                ))}
              </Card>
            )}

            {tab === 'Saved addresses' && (
              <Card title="Addresses" action={<button onClick={addAddress} style={{ background: D.plum, color: D.paper, border: 'none', padding: '8px 16px', borderRadius: 999, fontSize: 12, cursor: 'pointer' }}>+ Add address</button>}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                  {addresses.map((a) => (
                    <button key={a.id} onClick={() => setDefault(a.id)} style={{ padding: 18, background: D.paper, borderRadius: 10, border: `${a.is_default ? 2 : 1}px solid ${a.is_default ? D.plum : D.line}`, cursor: 'pointer', textAlign: 'left', fontFamily: D.sans, color: D.ink }}>
                      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{(a.label || '').toUpperCase()}{a.is_default ? ' · DEFAULT' : ''}</div>
                      <div style={{ fontFamily: D.display, fontSize: 18, letterSpacing: -0.2, marginTop: 8 }}>{a.label}</div>
                      <div style={{ fontSize: 13, color: D.ink2, marginTop: 4, lineHeight: 1.5 }}>{a.line1}<br />{a.city}, {a.state} {a.zip}</div>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {tab === 'Billing & terms' && (
              <Card title="Billing & terms">
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
                  <Cell label="Payment terms">{(org?.terms || '').toUpperCase()}</Cell>
                  <Cell label="Credit limit">{fmt.money(org?.credit_limit || 0)}</Cell>
                  <Cell label="Method on file">ACH · CHASE 5421</Cell>
                  <Cell label="Auto-pay">Off</Cell>
                </div>
              </Card>
            )}

            {tab === 'Integrations' && (
              <Card title="Connected systems">
                {[
                  ['Billing system', 'connected', 'Last sync 4 min ago'],
                  ['Order management', 'connected', 'Tracking auto-populates orders'],
                  ['Stripe', 'connected', 'Card-on-file supported'],
                  ['EDI (850 / 810 / 856)', 'available', 'Contact us to enable'],
                ].map(([n, st, sub], i) => (
                  <div key={n} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontFamily: D.display, fontSize: 18, letterSpacing: -0.2 }}>{n}</div>
                      <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{sub}</div>
                    </div>
                    <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, padding: '4px 10px', borderRadius: 999, background: st === 'connected' ? 'rgba(94,41,99,.1)' : D.terraSoft, color: st === 'connected' ? D.plum : D.terra }}>{st.toUpperCase()}</span>
                  </div>
                ))}
              </Card>
            )}

            {tab === 'Audit log' && (
              <Card title="Audit log · last 8 events">
                {auditLog.length === 0 && <div style={{ padding: 16, color: D.ink3 }}>No events yet.</div>}
                {auditLog.map((e, i) => (
                  <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 16, padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                    <div>
                      <div style={{ fontFamily: D.mono, fontSize: 12, color: D.plum, fontWeight: 600 }}>{e.kind}</div>
                      <div style={{ fontSize: 12, color: D.ink2, marginTop: 4, fontFamily: D.mono }}>{e.ref_id}</div>
                    </div>
                    <div style={{ fontSize: 12, color: D.ink3, fontFamily: D.mono, textAlign: 'right' }}>{fmt.dateTime(e.created_at).toUpperCase()}</div>
                  </div>
                ))}
              </Card>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Card({ title, action, children }) {
  return (
    <div style={{ background: D.card, borderRadius: 14, border: `1px solid ${D.line}`, padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontFamily: D.display, fontSize: 24, letterSpacing: -0.4 }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Cell({ label, children }) {
  return (
    <div>
      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 14, color: D.ink, marginTop: 6 }}>{children}</div>
    </div>
  );
}

function Input({ value, onChange }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%', padding: '8px 12px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 8, fontSize: 14, color: D.ink, outline: 'none', fontFamily: D.sans }}
    />
  );
}
