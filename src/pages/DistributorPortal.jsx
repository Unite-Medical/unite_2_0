import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { DistributorBlindOrder } from '../components/distributor/DistributorBlindOrder.jsx';
import { auth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { consignment } from '../lib/consignment.js';
import { distributorPickups } from '../lib/distributorPickups.js';
import { shippingRates } from '../lib/shippingRates.js';

// Load-time timestamp for near-expiry checks; render must stay pure.
const PAGE_LOADED_AT = Date.now();

const TABS = [['inventory', 'My inventory'], ['po', 'Place blind-ship order'], ['shipping', 'Shipping & pickups'], ['settlement', 'Settlement POs'], ['activity', 'Activity'], ['documents', 'Documents']];

function resolveDistributorOrg(session) {
  if (session?.role !== 'distributor') return null;
  const org = session?.org_id ? db.get('organizations', session.org_id) : null;
  if (org && (org.segment === 'distributors' || db.list('distributor_products', { where: { owner_org_id: org.id } }).length)) return org;
  return null;
}

export function DistributorPortal() {
  const navigate = useNavigate();
  const session = auth.use();
  const { isMobile } = useViewport();
  useSEO({ title: 'Distributor portal', canonical: '/distributor', noindex: true });
  const localOrg = useMemo(() => resolveDistributorOrg(session), [session]);
  const [overview, setOverview] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [tab, setTab] = useState('inventory');

  useEffect(() => {
    let active = true;
    if (session?.role !== 'distributor') return () => { active = false; };
    fetch('/api/distributor/overview', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((value) => { if (active) { setOverview(value); setLoadState('ready'); } })
      .catch(() => {
        if (!active) return;
        setOverview(null);
        setLoadState(import.meta.env.DEV && localOrg ? 'ready' : 'forbidden');
      });
    return () => { active = false; };
  }, [session, localOrg]);

  const org = overview?.organization || (import.meta.env.DEV ? localOrg : null);
  const effectiveLoadState = session?.role === 'distributor' ? loadState : 'forbidden';

  if (effectiveLoadState === 'loading') {
    return <div style={{ background: D.paper, minHeight: '100vh' }}><Nav /><main style={{ maxWidth: 760, margin: '0 auto', padding: '72px 24px' }}>Loading distributor account…</main></div>;
  }

  if (!org) {
    return (
      <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
        <Nav />
        <main id="main" style={{ maxWidth: 760, margin: '0 auto', padding: '72px 24px' }}>
          <h1 style={{ fontFamily: D.display, fontSize: 42, fontWeight: 400 }}>Distributor access required</h1>
          <p style={{ color: D.ink2 }}>Sign in with an approved distributor account. This portal never falls back to another organization's inventory.</p>
        </main>
      </div>
    );
  }

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main" style={{ maxWidth: 1100, margin: '0 auto', padding: `${isMobile ? 32 : 52}px ${isMobile ? 20 : 40}px 80px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum }}>DISTRIBUTOR PORTAL · {org?.name?.toUpperCase()}</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px,6vw,60px)', fontWeight: 400, letterSpacing: -1.2, margin: '8px 0 6px', lineHeight: 1 }}>Your warehouse</h1>
        <p style={{ color: D.ink2, marginBottom: 20, maxWidth: 640 }}>Order against your consignment stock and the Unite catalog, blind-ship under your brand, and track sell-through from one owner-isolated portal.</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ padding: '9px 16px', borderRadius: 4, border: `1.5px solid ${tab === id ? D.plum : D.line}`, background: tab === id ? D.plum : D.card, color: tab === id ? D.paper : D.ink2, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{label}</button>
          ))}
        </div>

        {tab === 'inventory' && <Inventory org={org} overview={overview} navigate={navigate} />}
        {tab === 'po' && <DistributorBlindOrder overview={overview} navigate={navigate} />}
        {tab === 'shipping' && <Shipping org={org} overview={overview} />}
        {tab === 'settlement' && <Settlement org={org} overview={overview} />}
        {tab === 'activity' && <Activity org={org} overview={overview} />}
        {tab === 'documents' && <Documents org={org} overview={overview} />}
      </main>
    </div>
  );
}

function Inventory({ org, overview }) {
  db.useTable('inventory_lots');
  db.useTable('consignment_movements');
  const inv = overview ? overview.products.map((product) => {
    const lots = overview.inventory.filter((lot) => lot.product_id === product.id);
    return {
      id: product.id,
      distributor_sku: product.distributor_sku,
      name: product.product_name || product.distributor_sku,
      on_hand: lots.reduce((sum, lot) => sum + Number(lot.on_hand || 0), 0),
      available: lots.reduce((sum, lot) => sum + Number(lot.available || 0), 0),
      nearest_expiry: lots.map((lot) => lot.expiration_date).filter(Boolean).sort()[0] || null,
    };
  }) : consignment.inventoryFor(org.id);
  const metricRows = overview ? overview.metrics.map((metric) => ({
    ...metric,
    run_rate: Number(metric.run_rate_units_per_day || 0).toFixed(2),
    days_cover: metric.days_of_cover == null ? null : Number(metric.days_of_cover).toFixed(1),
  })) : consignment.metricsFor(org.id);
  const metrics = new Map(metricRows.map((row) => [row.product_id, row]));
  const soon = (d) => d && (new Date(d) - PAGE_LOADED_AT) < 60 * 86400000;
  return (
    <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden' }}>
      <div className="um-scroll-x">
        <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{['SKU', 'NAME', 'ON HAND', 'AVAILABLE', '30D RUN RATE', 'DAYS COVER', 'LOW AT', 'NEAREST EXPIRY'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
          <tbody>
            {inv.map((p) => {
              const metric = metrics.get(p.id) || {};
              return (
                <tr key={p.id} style={{ borderTop: `1px solid ${D.line}`, background: metric.low_stock ? 'rgba(195,56,45,.04)' : 'transparent' }}>
                  <td style={{ padding: '10px 12px', fontFamily: D.mono, color: D.plum }}>{p.distributor_sku}</td>
                  <td style={{ padding: '10px 12px', color: D.ink2 }}>{p.name}</td>
                  <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{p.on_hand}</td>
                  <td style={{ padding: '10px 12px', fontFamily: D.mono, color: metric.low_stock ? D.terra : D.ink }}>{p.available}</td>
                  <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{metric.run_rate ?? 0}/day</td>
                  <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{metric.days_cover ?? '—'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{metric.low_stock_threshold ?? '—'}{metric.low_stock ? ' · LOW' : ''}</td>
                  <td style={{ padding: '10px 12px', color: soon(p.nearest_expiry) ? D.terra : D.ink2 }}>{p.nearest_expiry || '—'}{soon(p.nearest_expiry) ? ' ⚠ near-dated' : ''}</td>
                </tr>
              );
            })}
            {inv.length === 0 && <tr><td colSpan={8} style={{ padding: 16, color: D.ink3 }}>No owner-isolated stock on file.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Shipping({ org, overview }) {
  const [cmp, setCmp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [submittedPickups, setSubmittedPickups] = useState([]);
  db.useTable('distributor_pickups');
  db.useTable('distributor_pickup_events');
  const orders = db.useTable('orders');
  const eligibleOrders = overview?.eligible_pickups || orders
    .filter((order) => (order.on_behalf_of_org_id || order.customer_id) === org.id && order.blind_ship && order.status === 'ready_for_pickup')
    .map((order) => ({ reference: order.id, status: order.status }));
  const pickups = [...(overview?.pickups || distributorPickups.listForDistributor(org.id)), ...submittedPickups];
  const [requestForm, setRequestForm] = useState({
    order_id: '', carrier_name: '', booking_reference: '', third_party_account_ref: '',
    requested_start: '', requested_end: '', dispatch_name: '', dispatch_phone: '',
  });
  const markup = shippingRates.markupPctFor(org.id);
  async function run() {
    setBusy(true);
    try { setCmp(await shippingRates.compareForDistributor({ id: 'preview', customer_id: org.id, on_behalf_of_org_id: org.id }, { to_zip: '30301' })); }
    finally { setBusy(false); }
  }
  async function requestPickup() {
    setBusy(true);
    let result;
    try {
      const response = await fetch('/api/distributor/pickups', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_reference: requestForm.order_id, carrier_name: requestForm.carrier_name,
          third_party_account_ref: requestForm.third_party_account_ref || null,
          booking_reference: requestForm.booking_reference,
          dispatch_contact: { name: requestForm.dispatch_name, phone: requestForm.dispatch_phone },
          requested_start: requestForm.requested_start, requested_end: requestForm.requested_end,
        }),
      });
      const body = await response.json().catch(() => ({}));
      result = response.ok ? body : { ok: false, reason: body.error || 'request_failed' };
    } catch {
      result = import.meta.env.DEV ? await distributorPickups.request({
        owner_org_id: org.id, order_id: requestForm.order_id,
        carrier_name: requestForm.carrier_name, third_party_account_ref: requestForm.third_party_account_ref || null,
        booking_reference: requestForm.booking_reference,
        dispatch_contact: { name: requestForm.dispatch_name, phone: requestForm.dispatch_phone },
        requested_start: requestForm.requested_start, requested_end: requestForm.requested_end,
        requested_by: auth.current()?.email || org.contact_email,
      }) : { ok: false, reason: 'request_unavailable' };
    }
    if (result.ok && result.pickup) setSubmittedPickups((rows) => [...rows, result.pickup]);
    setNotice(result.ok ? 'Pickup requested. The window remains requested until Unite confirms warehouse readiness.' : `Pickup request blocked: ${result.reason}`);
    setBusy(false);
  }
  const field = (key, label, type = 'text') => (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3 }}>{label}</span>
      <input type={type} value={requestForm[key]} onChange={(event) => setRequestForm((current) => ({ ...current, [key]: event.target.value }))} style={{ padding: '10px 11px', border: `1px solid ${D.line}`, borderRadius: 7, background: D.paper }} />
    </label>
  );
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, color: D.ink2 }}>Your markup is <b>{markup}%</b> on Unite rates. Compare Unite carrier rates with a third-party-billed carrier account.</div>
        <button onClick={run} disabled={busy} style={{ marginTop: 12, ...btnPrimary(!busy) }}>{busy ? 'Working…' : 'Quote a sample shipment'}</button>
      </div>
      {cmp && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {cmp.options.map((option) => (
            <div key={option.kind} style={{ background: D.card, border: `1.5px solid ${option.kind === 'unite_rate' ? D.plum : D.line}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{option.label.toUpperCase()}</div>
              <div style={{ fontFamily: D.display, fontSize: 34, letterSpacing: -1, margin: '6px 0' }}>{option.cost ? fmt.money(option.cost) : '—'}</div>
              <div style={{ fontSize: 12, color: D.ink2 }}>{option.carrier}{option.account ? ` · ${option.account}` : ''}</div>
              <div style={{ fontSize: 12, color: D.ink3, marginTop: 6 }}>{option.bills}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontFamily: D.display, fontSize: 22 }}>Request your carrier or courier pickup</div>
        <p style={{ color: D.ink2, fontSize: 13 }}>Available only after Unite marks the blind-ship order ready. Your requested window is not confirmed until the warehouse accepts it.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3 }}>READY ORDER</span>
            <select value={requestForm.order_id} onChange={(event) => setRequestForm((current) => ({ ...current, order_id: event.target.value }))} style={{ padding: '10px 11px', border: `1px solid ${D.line}`, borderRadius: 7, background: D.paper }}>
              <option value="">Select an order…</option>
              {eligibleOrders.map((order) => <option key={order.reference} value={order.reference}>{order.reference}</option>)}
            </select>
          </label>
          {field('carrier_name', 'CARRIER / COURIER')}
          {field('booking_reference', 'BOOKING REFERENCE')}
          {field('third_party_account_ref', 'ACCOUNT REFERENCE / LAST 4')}
          {field('dispatch_name', 'DISPATCH CONTACT')}
          {field('dispatch_phone', 'DISPATCH PHONE', 'tel')}
          {field('requested_start', 'REQUESTED START', 'datetime-local')}
          {field('requested_end', 'REQUESTED END', 'datetime-local')}
        </div>
        <button onClick={requestPickup} disabled={busy || !requestForm.order_id || !requestForm.carrier_name || !requestForm.booking_reference || !requestForm.requested_start || !requestForm.requested_end} style={{ marginTop: 14, ...btnPrimary(!busy) }}>Request pickup</button>
        {notice && <div style={{ marginTop: 10, color: D.ink2, fontSize: 12 }}>{notice}</div>}
      </div>

      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontFamily: D.display, fontSize: 20 }}>Pickup status</div>
        {pickups.map((pickup) => (
          <div key={pickup.id} style={{ padding: '10px 0', borderTop: `1px solid ${D.line}`, fontSize: 13 }}>
            <span style={{ fontFamily: D.mono, color: D.plum }}>{pickup.public_order_reference || pickup.order_id}</span> · {pickup.carrier_name} · {pickup.status.replaceAll('_', ' ')}
            <div style={{ color: D.ink3, marginTop: 3 }}>{pickup.confirmed_start ? `Confirmed ${pickup.confirmed_start}` : `Requested ${pickup.requested_start}`}</div>
          </div>
        ))}
        {!pickups.length && <div style={{ color: D.ink3, fontSize: 13, marginTop: 8 }}>No pickup requests.</div>}
      </div>
    </div>
  );
}

function Settlement({ org, overview }) {
  db.useTable('consignment_movements');
  db.useTable('purchase_orders');
  const s = overview ? (() => {
    const movements = overview.settlement_purchase_orders.flatMap((po) => po.line_items.map((line, index) => ({
      id: `${po.id}:${index}`,
      settlement_po_id: po.id,
      distributor_sku: line.sku,
      lot_number: null,
      expiration_date: null,
      qty: line.qty,
      agreed_unit_price: line.cost,
      amount: Number(line.qty || 0) * Number(line.cost || 0),
      status: po.paid_at ? 'settled' : po.status,
    })));
    return {
      movements,
      owed: overview.settlement_purchase_orders.filter((po) => !po.paid_at).reduce((sum, po) => sum + Number(po.total_cost || 0), 0),
      settled: overview.settlement_purchase_orders.filter((po) => po.paid_at).reduce((sum, po) => sum + Number(po.total_cost || 0), 0),
      units: movements.reduce((sum, movement) => sum + Number(movement.qty || 0), 0),
    };
  })() : consignment.settlementForDistributor(org.id);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 12 }}>
          <Stat label="Open settlement" value={fmt.money(s.owed)} />
          <Stat label="Settled" value={fmt.money(s.settled)} />
          <Stat label="Units sold" value={String(s.units)} />
        </div>
        <div style={{ fontSize: 12, color: D.ink3 }}>Settlement POs show only your SKU, lots, units, agreed price, and payment status. Unite customer POs and customer commercial data are never included.</div>
      </div>
      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{['SETTLEMENT PO', 'SKU / LOT', 'QTY', 'AGREED PRICE', 'AMOUNT', 'STATUS'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
          <tbody>
            {s.movements.length === 0 && <tr><td colSpan={6} style={{ padding: 16, color: D.ink3 }}>No sell-through yet.</td></tr>}
            {s.movements.slice().reverse().map((movement) => (
              <tr key={movement.id} style={{ borderTop: `1px solid ${D.line}` }}>
                <td style={{ padding: '10px 12px', fontFamily: D.mono, color: D.plum }}>{movement.settlement_po_id}</td>
                <td style={{ padding: '10px 12px' }}>{movement.distributor_sku}<div style={{ color: D.ink3, fontSize: 11 }}>lot {movement.lot_number || 'N/A'} · exp {movement.expiration_date || 'N/A'}</div></td>
                <td style={{ padding: '10px 12px' }}>{movement.qty}</td>
                <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{fmt.money(movement.agreed_unit_price)}</td>
                <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{fmt.money(movement.amount)}</td>
                <td style={{ padding: '10px 12px', color: movement.status === 'settled' ? '#3b8760' : D.terra }}>{movement.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Activity({ org, overview }) {
  const localNotifications = db.useTable('distributor_notifications', { where: { owner_org_id: org.id }, orderBy: 'created_at', dir: 'desc' });
  const notifications = overview?.notifications || localNotifications;
  db.useTable('consignment_movements');
  const service = overview?.service_history || consignment.metricsFor(org.id)
    .flatMap((metric) => metric.service_history.map((event) => ({ ...event, distributor_sku: metric.distributor_sku })))
    .sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || '')));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
        <div style={{ fontFamily: D.display, fontSize: 20 }}>Notifications</div>
        {notifications.map((notification) => (
          <div key={notification.id} style={{ padding: '11px 0', borderTop: `1px solid ${D.line}`, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{notification.kind.replaceAll('_', ' ')}</span>
              {!overview && <button type="button" onClick={() => db.update('distributor_notifications', notification.id, { status: 'read', read_at: new Date().toISOString() })} style={{ border: 'none', background: 'transparent', color: D.plum, cursor: 'pointer', fontSize: 11 }}>{notification.status === 'read' ? 'READ' : 'MARK READ'}</button>}
            </div>
            <div style={{ color: D.ink3, marginTop: 4 }}>{notification.message || notification.title || notification.payload?.distributor_sku}{notification.payload?.remaining_inventory != null ? ` · ${notification.payload.remaining_inventory} remaining` : ''}{notification.payload?.days_cover != null ? ` · ${notification.payload.days_cover} days cover` : ''}</div>
          </div>
        ))}
        {!notifications.length && <div style={{ color: D.ink3, marginTop: 8, fontSize: 13 }}>No notifications.</div>}
      </div>
      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
        <div style={{ fontFamily: D.display, fontSize: 20 }}>Service history</div>
        {service.map((event) => (
          <div key={event.id} style={{ padding: '11px 0', borderTop: `1px solid ${D.line}`, fontSize: 13 }}>
            <span style={{ fontFamily: D.mono, color: D.plum }}>{event.distributor_sku}</span> · {event.kind.replaceAll('_', ' ')} · {event.quantity ?? event.qty} units
            <div style={{ color: D.ink3, marginTop: 3 }}>{event.occurred_at ? fmt.date(event.occurred_at, { year: true }) : 'Date unavailable'}{(event.settlement_reference || event.settlement_po_id) ? ` · ${event.settlement_reference || event.settlement_po_id}` : ''}</div>
          </div>
        ))}
        {!service.length && <div style={{ color: D.ink3, marginTop: 8, fontSize: 13 }}>No service events in the current run-rate window.</div>}
      </div>
    </div>
  );
}

function Documents({ org, overview }) {
  const localDocs = db.useTable('distributor_documents', { where: { owner_org_id: org.id } });
  const localIds = db.useTable('distributor_ship_identities', { where: { owner_org_id: org.id } });
  const docs = overview?.documents || localDocs;
  const ids = overview?.ship_identities || localIds;
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
              <input type="checkbox" checked={d.include_on_every_order} disabled={Boolean(overview)} onChange={(e) => db.update('distributor_documents', d.id, { include_on_every_order: e.target.checked })} />
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

const btnPrimary = (on) => ({ background: D.plum, color: D.paper, border: 'none', padding: '11px 18px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: on ? 'pointer' : 'default', opacity: on ? 1 : 0.5 });

