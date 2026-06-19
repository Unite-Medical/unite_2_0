import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { auth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { consignment } from '../lib/consignment.js';
import { shippingRates } from '../lib/shippingRates.js';
import { poIngestion } from '../lib/poIngestion.js';
import { placeOrder } from '../lib/orders.js';
import { resolveCustomerPrice } from '../lib/customerPricing.js';

const TABS = [['inventory', 'My inventory'], ['po', 'Upload PO'], ['shipping', 'Shipping'], ['settlement', 'Settlement'], ['documents', 'Documents']];

function resolveDistributorOrg(session) {
  const org = session?.org_id ? db.get('organizations', session.org_id) : null;
  if (org && (org.segment === 'distributors' || db.list('distributor_products', { where: { owner_org_id: org.id } }).length)) return org;
  // Demo fallback: the seeded distributor so admins/demo can preview.
  return db.get('organizations', 'org_medone') || org;
}

export function DistributorPortal() {
  const navigate = useNavigate();
  const session = auth.use();
  const { isMobile } = useViewport();
  useSEO({ title: 'Distributor portal', canonical: '/distributor', noindex: true });
  const org = useMemo(() => resolveDistributorOrg(session), [session]);
  const [tab, setTab] = useState('inventory');

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main" style={{ maxWidth: 1100, margin: '0 auto', padding: `${isMobile ? 32 : 52}px ${isMobile ? 20 : 40}px 80px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum }}>DISTRIBUTOR PORTAL · {org?.name?.toUpperCase()}</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px,6vw,60px)', fontWeight: 400, letterSpacing: -1.2, margin: '8px 0 6px', lineHeight: 1 }}>Your warehouse</h1>
        <p style={{ color: D.ink2, marginBottom: 20, maxWidth: 640 }}>Order against your consignment stock and the Unite catalog, blind-ship under your brand, and track sell-through — <a href="/account/order" style={{ color: D.plum }}>quick order &amp; reorder</a> use the same flow as Unite customers.</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ padding: '9px 16px', borderRadius: 999, border: `1.5px solid ${tab === id ? D.plum : D.line}`, background: tab === id ? D.plum : D.card, color: tab === id ? D.paper : D.ink2, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{label}</button>
          ))}
        </div>

        {tab === 'inventory' && <Inventory org={org} navigate={navigate} />}
        {tab === 'po' && <PoUpload org={org} navigate={navigate} />}
        {tab === 'shipping' && <Shipping org={org} />}
        {tab === 'settlement' && <Settlement org={org} />}
        {tab === 'documents' && <Documents org={org} />}
      </main>
    </div>
  );
}

function Inventory({ org }) {
  db.useTable('inventory_lots');
  const inv = consignment.inventoryFor(org.id);
  const soon = (d) => d && (new Date(d) - Date.now()) < 60 * 86400000;
  return (
    <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden' }}>
      <div className="um-scroll-x">
        <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{['SKU', 'NAME', 'LISTING', 'ON HAND', 'AVAILABLE', 'NEAREST EXPIRY'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
          <tbody>
            {inv.map((p) => (
              <tr key={p.id} style={{ borderTop: `1px solid ${D.line}` }}>
                <td style={{ padding: '10px 12px', fontFamily: D.mono, color: D.plum }}>{p.distributor_sku}</td>
                <td style={{ padding: '10px 12px', color: D.ink2 }}>{p.name}</td>
                <td style={{ padding: '10px 12px', fontFamily: D.mono, fontSize: 11, color: p.visibility === 'storefront' ? D.plum : D.ink3 }}>{p.visibility === 'storefront' ? `STOREFRONT${p.unite_sellable ? ' · UNITE-SELLABLE' : ''}` : 'WAREHOUSE-ONLY'}</td>
                <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{p.on_hand}</td>
                <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{p.available}</td>
                <td style={{ padding: '10px 12px', color: soon(p.nearest_expiry) ? D.terra : D.ink2 }}>{p.nearest_expiry || '—'}{soon(p.nearest_expiry) ? ' ⚠ near-dated' : ''}</td>
              </tr>
            ))}
            {inv.length === 0 && <tr><td colSpan={6} style={{ padding: 16, color: D.ink3 }}>No consignment stock on file.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PoUpload({ org, navigate }) {
  const [text, setText] = useState('');
  const [upload, setUpload] = useState(null);
  const [busy, setBusy] = useState(false);
  function ingest() {
    const u = poIngestion.ingestPo({ owner_org_id: org.id, parsedInput: text });
    setUpload(u);
  }
  function map(ext, sku, kind) {
    setUpload(poIngestion.mapAndRecheck(upload.id, ext, sku, kind));
  }
  async function createDraft() {
    setBusy(true);
    try {
      const draft = poIngestion.draftLinesFromUpload(upload.id);
      if (!draft.ok) return;
      const items = draft.lines.map((l) => {
        const priced = resolveCustomerPrice({ org, sku: l.sku, qty: l.qty, basePrice: db.get('products', l.sku)?.price ?? 0 });
        return { sku: l.sku, name: l.name || l.sku, qty: l.qty, unit_price: l.kind === 'distributor' ? 0 : priced.unit_price };
      });
      const res = await placeOrder({
        customer: { user_id: 'distributor', org_id: org.id, org_name: org.name, segment: org.segment, email: `ops@${org.id}.com` },
        items, payment_terms: org.terms || 'net60', payment_method: org.terms || 'net30',
        order_source: 'rep_entry', on_behalf_of_org_id: org.id, blind_ship: true, po_number: upload.parsed?.po_number || null,
      });
      db.update('distributor_po_uploads', upload.id, { status: 'ordered', draft_order_id: res.order.id });
      navigate(`/orders/${res.order.id}/confirmed`);
    } finally { setBusy(false); }
  }
  const uniteProducts = db.list('products', { limit: 1 });
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, color: D.ink2, marginBottom: 10 }}>Paste your customer&apos;s PO (one <code>SKU, qty</code> per line; optional <code>PO: 1234</code> / <code>Ship to: …</code>). We match each line to a SKU and learn your part numbers over time. In production this also parses uploaded PDF/xlsx.</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={'PO: 88231\nMED-STERI-9000, 50\nACME-XYZ, 10'} style={{ width: '100%', boxSizing: 'border-box', fontFamily: D.mono, fontSize: 13, padding: 12, border: `1px solid ${D.line}`, borderRadius: 8 }} />
        <button onClick={ingest} disabled={!text.trim()} style={{ marginTop: 10, ...btnPrimary(Boolean(text.trim())) }}>Parse PO</button>
      </div>
      {upload && (
        <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${D.line}`, display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: D.display, fontSize: 18 }}>PO {upload.parsed?.po_number || '(no #)'}</div>
            <div style={{ fontFamily: D.mono, fontSize: 11, color: upload.status === 'ready' ? '#3b8760' : D.terra, alignSelf: 'center' }}>{upload.status.toUpperCase()}</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {(upload.parsed?.lines || []).map((l, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${D.line}` }}>
                  <td style={{ padding: '10px 12px', fontFamily: D.mono, color: l.resolved_sku ? D.plum : D.terra }}>{l.external_sku}</td>
                  <td style={{ padding: '10px 12px' }}>× {l.qty}</td>
                  <td style={{ padding: '10px 12px', color: D.ink2 }}>
                    {l.resolved_sku ? `→ ${l.resolved_sku} (${l.resolved_kind})` : (
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        unmatched — map to
                        <input placeholder="Unite SKU" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value) map(l.external_sku, e.target.value.toUpperCase(), db.get('products', e.target.value.toUpperCase()) ? 'unite' : 'distributor'); }} style={{ padding: '4px 8px', border: `1px solid ${D.line}`, borderRadius: 6, fontFamily: D.mono, fontSize: 12, width: 130 }} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: 16, borderTop: `1px solid ${D.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: D.ink3 }}>Unmatched part numbers persist once mapped — repeat POs auto-match. {uniteProducts.length ? '' : ''}</div>
            <button onClick={createDraft} disabled={upload.status !== 'ready' || busy} style={btnPrimary(upload.status === 'ready' && !busy)}>{busy ? 'Creating…' : 'Create blind draft order'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Shipping({ org }) {
  const [cmp, setCmp] = useState(null);
  const [busy, setBusy] = useState(false);
  const markup = shippingRates.markupPctFor(org.id);
  async function run() {
    setBusy(true);
    try { setCmp(await shippingRates.compareForDistributor({ id: 'preview', customer_id: org.id, on_behalf_of_org_id: org.id }, { to_zip: '30301' })); }
    finally { setBusy(false); }
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, color: D.ink2 }}>Your markup is <b>{markup}%</b> on Unite rates. Compare shipping on Unite&apos;s carriers vs. your own carrier account (third-party billed) before you ship.</div>
        <button onClick={run} disabled={busy} style={{ marginTop: 12, ...btnPrimary(!busy) }}>{busy ? 'Quoting…' : 'Quote a sample shipment'}</button>
      </div>
      {cmp && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {cmp.options.map((o) => (
            <div key={o.kind} style={{ background: D.card, border: `1.5px solid ${o.kind === 'unite_rate' ? D.plum : D.line}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{o.label.toUpperCase()}</div>
              <div style={{ fontFamily: D.display, fontSize: 34, letterSpacing: -1, margin: '6px 0' }}>{o.cost ? fmt.money(o.cost) : '—'}</div>
              <div style={{ fontSize: 12, color: D.ink2 }}>{o.carrier}{o.account ? ` · ${o.account}` : ''}</div>
              <div style={{ fontSize: 12, color: D.ink3, marginTop: 6 }}>{o.bills}</div>
              {o.kind === 'third_party' && !o.available && <div style={{ fontSize: 11, color: D.terra, marginTop: 6 }}>No carrier account on file.</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Settlement({ org }) {
  db.useTable('consignment_movements');
  const s = consignment.settlementFor(org.id);
  return (
    <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 12 }}>
        <Stat label="Owed to you" value={fmt.money(s.owed)} />
        <Stat label="Settled" value={fmt.money(s.settled)} />
        <Stat label="Units sold" value={String(s.units)} />
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{['ORDER', 'QTY', 'UNIT COST', 'AMOUNT', 'STATUS'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
        <tbody>
          {s.movements.length === 0 && <tr><td colSpan={5} style={{ padding: 16, color: D.ink3 }}>No sell-through yet. When Unite sells your stock, it shows here.</td></tr>}
          {s.movements.slice().reverse().map((m) => (
            <tr key={m.id} style={{ borderTop: `1px solid ${D.line}` }}>
              <td style={{ padding: '10px 12px', fontFamily: D.mono, color: D.plum }}>{m.order_id}</td>
              <td style={{ padding: '10px 12px' }}>{m.qty}</td>
              <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{fmt.money(m.unit_cost || 0)}</td>
              <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{fmt.money((m.unit_cost || 0) * m.qty)}</td>
              <td style={{ padding: '10px 12px', color: m.settled ? '#3b8760' : D.terra }}>{m.settled ? 'settled' : 'open'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Documents({ org }) {
  const docs = db.useTable('distributor_documents', { where: { owner_org_id: org.id } });
  const ids = db.useTable('distributor_ship_identities', { where: { owner_org_id: org.id } });
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
        <div style={{ fontFamily: D.display, fontSize: 18, marginBottom: 10 }}>Ship-from identities (blind ship)</div>
        {ids.map((i) => (
          <div key={i.id} style={{ fontSize: 13, color: D.ink2, padding: '8px 0', borderTop: `1px solid ${D.line}` }}>
            <b style={{ color: D.ink }}>{i.brand_name}</b>{i.is_default ? ' · default' : ''} — {i.return_address?.city}, {i.return_address?.state}
          </div>
        ))}
        {ids.length === 0 && <div style={{ fontSize: 13, color: D.ink3 }}>No ship-from identity — orders ship neutral/unbranded.</div>}
      </div>
      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
        <div style={{ fontFamily: D.display, fontSize: 18, marginBottom: 10 }}>Packing slips & required inserts</div>
        {docs.map((d) => (
          <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${D.line}` }}>
            <div><div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div><div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>{d.doc_type}</div></div>
            <label style={{ fontSize: 12, color: D.ink2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={d.include_on_every_order} onChange={(e) => db.update('distributor_documents', d.id, { include_on_every_order: e.target.checked })} />
              include on every order
            </label>
          </div>
        ))}
        {docs.length === 0 && <div style={{ fontSize: 13, color: D.ink3 }}>No documents uploaded.</div>}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ padding: 16, background: D.paper, border: `1px solid ${D.line}`, borderRadius: 10, minWidth: 120 }}>
      <div style={{ fontFamily: D.display, fontSize: 24 }}>{value}</div>
      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginTop: 4 }}>{label.toUpperCase()}</div>
    </div>
  );
}

const btnPrimary = (on) => ({ background: D.plum, color: D.paper, border: 'none', padding: '11px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: on ? 'pointer' : 'default', opacity: on ? 1 : 0.5 });
