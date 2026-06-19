import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { hubspot } from '../../lib/services.js';
import { hubspotSync } from '../../lib/hubspotSync.js';
import { useViewport } from '../../lib/viewport.js';

const TABS = [
  ['contacts', 'Contacts', 'hubspot_contacts'],
  ['companies', 'Companies', 'hubspot_companies'],
  ['deals', 'Deals', 'hubspot_deals'],
];

const SEGMENT_LABEL = { asc: 'ASC', pharmacy: 'Pharmacy', ems: 'EMS', gov: 'Government', distributors: 'Distributor', retail: 'Retail' };

function prop(row, key) { return row?.properties?.[key] ?? ''; }
function contactName(row) {
  const n = `${prop(row, 'firstname')} ${prop(row, 'lastname')}`.trim();
  return n || prop(row, 'email') || '(no name)';
}

function Pill({ children, tone = 'plum' }) {
  const bg = tone === 'plum' ? 'rgba(108,42,92,.10)' : tone === 'green' ? 'rgba(59,135,96,.12)' : 'rgba(0,0,0,.05)';
  const fg = tone === 'plum' ? D.plum : tone === 'green' ? '#2f6b4c' : D.ink2;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontFamily: D.mono, letterSpacing: 0.4, background: bg, color: fg }}>{children}</span>
  );
}

export function AdminHubSpot() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;

  const [tab, setTab] = useState('contacts');
  const [totals, setTotals] = useState(null);
  const [stageLabels, setStageLabels] = useState({});
  const [cursors, setCursors] = useState({ contacts: undefined, companies: undefined, deals: undefined });
  const [exhausted, setExhausted] = useState({ contacts: false, companies: false, deals: false });
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [bulk, setBulk] = useState(null); // { busy, msg } for full pull/push
  const [auto, setAuto] = useState(hubspotSync.isAuto());
  const [autoCount, setAutoCount] = useState(0);
  const didInit = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const contacts = db.useTable('hubspot_contacts', { orderBy: 'last_synced_at', dir: 'desc' });
  const companies = db.useTable('hubspot_companies', { orderBy: 'last_synced_at', dir: 'desc' });
  const deals = db.useTable('hubspot_deals', { orderBy: 'last_synced_at', dir: 'desc' });
  const rowsByTab = { contacts, companies, deals };

  const syncTab = useCallback(async (objectType, { reset = false } = {}) => {
    setSyncing(true);
    setError(null);
    try {
      const after = reset ? undefined : cursors[objectType];
      const { results, after: next, stub } = await hubspot.list(objectType, { limit: 50, after });
      setCursors((c) => ({ ...c, [objectType]: next || undefined }));
      setExhausted((e) => ({ ...e, [objectType]: !next }));
      setLastSync(new Date().toISOString());
      if (stub) setError('HubSpot not reachable — showing locally cached rows. Set HUBSPOT_PRIVATE_APP_TOKEN in Vercel.');
      return results.length;
    } catch (err) {
      setError(err.message);
      return 0;
    } finally {
      setSyncing(false);
    }
  }, [cursors]);

  const refreshTotals = useCallback(async () => {
    try { const t = await hubspot.totals(); if (mounted.current) setTotals(t); } catch { /* keep prior */ }
  }, []);

  const runBulk = useCallback(async (label, fn) => {
    setBulk({ busy: true, msg: `${label}…` });
    setError(null);
    try {
      await fn((p) => {
        if (!mounted.current) return;
        if (p.phase === 'pull') setBulk({ busy: true, msg: `Pulling ${p.objectType}: ${p.fetched} fetched…` });
        else setBulk({ busy: true, msg: `Pushing ${p.objectType}: ${p.pushed}/${p.of}…` });
      });
      if (mounted.current) { setBulk({ busy: false, msg: `${label} complete.` }); setLastSync(new Date().toISOString()); }
      refreshTotals();
    } catch (err) {
      if (mounted.current) setBulk({ busy: false, msg: `${label} failed: ${err.message}` });
    }
  }, [refreshTotals]);

  const toggleAuto = useCallback(() => {
    if (hubspotSync.isAuto()) { hubspotSync.stopAuto(); setAuto(false); }
    else { hubspotSync.startAuto(() => { if (mounted.current) setAutoCount((n) => n + 1); }); setAuto(true); }
  }, []);

  const pushable = hubspotSync.pushableCounts();

  // Initial load: totals + pipeline stage labels + first page of each object.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    (async () => {
      try {
        const [t, pipes] = await Promise.all([hubspot.totals(), hubspot.pipelines()]);
        setTotals(t);
        const labels = {};
        for (const p of pipes) for (const s of p.stages || []) labels[s.id] = s.label;
        setStageLabels(labels);
      } catch (err) { setError(err.message); }
      for (const [id] of TABS) await syncTab(id, { reset: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = rowsByTab[tab];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => JSON.stringify(r.properties || {}).toLowerCase().includes(q));
  }, [rows, search]);

  const tiles = [
    [totals?.contacts != null ? fmt.number(totals.contacts) : '—', 'Contacts in HubSpot', `${contacts.length} synced here`],
    [totals?.companies != null ? fmt.number(totals.companies) : '—', 'Companies', `${companies.length} synced here`],
    [totals?.deals != null ? fmt.number(totals.deals) : '—', 'Open deals', `${deals.length} synced here`],
    [lastSync ? fmt.ago(lastSync) : '—', 'Last sync', syncing ? 'syncing…' : 'live via /api/proxy'],
  ];

  return (
    <AdminShell active="hubspot">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 48 : 64}px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>SALES · HUBSPOT (LIVE)</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', marginBottom: 22, flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>HubSpot CRM.</h1>
          <button
            onClick={() => syncTab(tab)}
            disabled={syncing}
            style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: D.plum, color: D.paper, cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.5 : 1 }}
          >
            {syncing ? 'SYNCING…' : `SYNC MORE ${tab.toUpperCase()} →`}
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(180,90,40,.10)', border: '1px solid rgba(180,90,40,.25)', color: '#8a4b20', fontSize: 13 }}>{error}</div>
        )}

        <div style={{ marginBottom: 18 }}>
          <AdminCard title="Two-way sync">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <button onClick={() => runBulk('Pull all from HubSpot', hubspotSync.pullAll.bind(hubspotSync))} disabled={bulk?.busy} style={btn(D, 'solid', bulk?.busy)}>↓ PULL ALL (HUBSPOT → UNITE)</button>
              <button onClick={() => runBulk('Push Unite → HubSpot', hubspotSync.pushAll.bind(hubspotSync))} disabled={bulk?.busy} style={btn(D, 'outline', bulk?.busy)}>↑ PUSH UNITE → HUBSPOT</button>
              <button onClick={() => runBulk('Two-way sync', hubspotSync.syncBoth.bind(hubspotSync))} disabled={bulk?.busy} style={btn(D, 'outline', bulk?.busy)}>⇅ SYNC BOTH WAYS</button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', fontSize: 12, color: D.ink2, cursor: 'pointer' }}>
                <input type="checkbox" checked={auto} onChange={toggleAuto} />
                Auto-push local changes{auto && autoCount > 0 ? ` · ${autoCount} synced` : ''}
              </label>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: D.ink2 }}>
              Push maps <b>{pushable.organizations}</b> organizations → companies, <b>{pushable.contacts}</b> customer contacts, <b>{pushable.orders}</b> orders → deals.
              {bulk?.msg && <span style={{ marginLeft: 10, fontFamily: D.mono, fontSize: 11, color: bulk.busy ? D.plum : D.ink3 }}>{bulk.msg}</span>}
            </div>
          </AdminCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
          {tiles.map(([b, s, sub]) => (
            <div key={s} style={{ padding: isMobile ? 16 : 22, background: D.card, borderRadius: 14, border: `1px solid ${D.line}` }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{s.toUpperCase()}</div>
              <div style={{ fontFamily: D.display, fontSize: isMobile ? 24 : 36, color: D.ink, letterSpacing: -0.6, marginTop: 8 }}>{b}</div>
              <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {TABS.map(([id, label, table]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                fontFamily: D.mono, fontSize: 12, letterSpacing: 0.6, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${tab === id ? D.plum : D.line}`,
                background: tab === id ? D.plum : 'transparent',
                color: tab === id ? D.paper : D.ink2,
              }}
            >{label} · {db.count(table)}</button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Filter ${tab}…`}
            style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 8, border: `1px solid ${D.line}`, fontSize: 13, fontFamily: D.sans, background: D.card, color: D.ink }}
          />
        </div>

        <AdminCard title={`${TABS.find(([id]) => id === tab)[1]} · ${filtered.length} shown`}>
          {filtered.length === 0 ? (
            <div style={{ padding: 18, color: D.ink3, fontSize: 14 }}>{syncing ? 'Loading from HubSpot…' : 'No rows yet — hit “Sync more”.'}</div>
          ) : (
            <div className="um-scroll-x" style={{ overflowX: 'auto' }}>
              {tab === 'contacts' && <ContactTable rows={filtered} />}
              {tab === 'companies' && <CompanyTable rows={filtered} />}
              {tab === 'deals' && <DealTable rows={filtered} stageLabels={stageLabels} />}
            </div>
          )}
          {!exhausted[tab] && filtered.length > 0 && (
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button onClick={() => syncTab(tab)} disabled={syncing} style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, padding: '8px 18px', borderRadius: 8, border: `1px solid ${D.line}`, background: 'transparent', color: D.ink2, cursor: syncing ? 'default' : 'pointer' }}>
                {syncing ? 'LOADING…' : 'LOAD MORE FROM HUBSPOT'}
              </button>
            </div>
          )}
        </AdminCard>
      </div>
    </AdminShell>
  );
}

function btn(d, variant, busy) {
  const solid = variant === 'solid';
  return {
    fontFamily: d.mono, fontSize: 11, letterSpacing: 0.8, padding: '9px 14px', borderRadius: 8,
    cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
    border: solid ? 'none' : `1px solid ${d.line}`,
    background: solid ? d.plum : 'transparent',
    color: solid ? d.paper : d.ink2,
  };
}

const TH = { textAlign: 'left', fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, padding: '0 14px 10px 0', whiteSpace: 'nowrap' };
const TD = { fontSize: 13, color: D.ink, padding: '11px 14px 11px 0', borderTop: `1px solid ${D.line}`, whiteSpace: 'nowrap' };

function ContactTable({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>{['Name', 'Email', 'Phone', 'Company', 'Role', 'Lifecycle', 'Updated'].map((h) => <th key={h} style={TH}>{h.toUpperCase()}</th>)}</tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td style={{ ...TD, fontWeight: 600 }}>{contactName(r)}</td>
            <td style={{ ...TD, color: D.ink2 }}>{prop(r, 'email') || '—'}</td>
            <td style={{ ...TD, color: D.ink2 }}>{prop(r, 'phone') || '—'}</td>
            <td style={TD}>{prop(r, 'company') || '—'}</td>
            <td style={TD}>{prop(r, 'unite_role') ? <Pill>{prop(r, 'unite_role')}</Pill> : '—'}</td>
            <td style={{ ...TD, color: D.ink2 }}>{prop(r, 'lifecyclestage') || '—'}</td>
            <td style={{ ...TD, color: D.ink3, fontFamily: D.mono, fontSize: 11 }}>{r.hs_updated_at ? fmt.ago(r.hs_updated_at) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CompanyTable({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>{['Name', 'Domain', 'Industry', 'Location', 'Segment', 'Tier', 'Updated'].map((h) => <th key={h} style={TH}>{h.toUpperCase()}</th>)}</tr></thead>
      <tbody>
        {rows.map((r) => {
          const loc = [prop(r, 'city'), prop(r, 'state')].filter(Boolean).join(', ');
          const seg = prop(r, 'unite_segment');
          return (
            <tr key={r.id}>
              <td style={{ ...TD, fontWeight: 600 }}>{prop(r, 'name') || '(unnamed)'}</td>
              <td style={{ ...TD, color: D.ink2 }}>{prop(r, 'domain') || '—'}</td>
              <td style={{ ...TD, color: D.ink2 }}>{prop(r, 'industry') || '—'}</td>
              <td style={TD}>{loc || '—'}</td>
              <td style={TD}>{seg ? <Pill>{SEGMENT_LABEL[seg] || seg}</Pill> : '—'}</td>
              <td style={TD}>{prop(r, 'unite_tier') ? <Pill tone="green">{prop(r, 'unite_tier')}</Pill> : '—'}</td>
              <td style={{ ...TD, color: D.ink3, fontFamily: D.mono, fontSize: 11 }}>{r.hs_updated_at ? fmt.ago(r.hs_updated_at) : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DealTable({ rows, stageLabels }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>{['Deal', 'Amount', 'Stage', 'Pipeline', 'Close date', 'Order ID', 'Updated'].map((h) => <th key={h} style={TH}>{h.toUpperCase()}</th>)}</tr></thead>
      <tbody>
        {rows.map((r) => {
          const stage = prop(r, 'dealstage');
          const won = prop(r, 'hs_is_closed_won') === 'true';
          return (
            <tr key={r.id}>
              <td style={{ ...TD, fontWeight: 600 }}>{prop(r, 'dealname') || '(untitled)'}</td>
              <td style={{ ...TD, color: D.plum, fontFamily: D.display, fontSize: 15 }}>{prop(r, 'amount') ? fmt.money(Number(prop(r, 'amount')), { cents: false }) : '—'}</td>
              <td style={TD}>{stage ? <Pill tone={won ? 'green' : 'plum'}>{stageLabels[stage] || stage}</Pill> : '—'}</td>
              <td style={{ ...TD, color: D.ink2 }}>{prop(r, 'pipeline') || '—'}</td>
              <td style={{ ...TD, color: D.ink2 }}>{prop(r, 'closedate') ? fmt.date(prop(r, 'closedate'), { year: true }) : '—'}</td>
              <td style={{ ...TD, fontFamily: D.mono, fontSize: 11 }}>{prop(r, 'unite_order_id') || '—'}</td>
              <td style={{ ...TD, color: D.ink3, fontFamily: D.mono, fontSize: 11 }}>{r.hs_updated_at ? fmt.ago(r.hs_updated_at) : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
