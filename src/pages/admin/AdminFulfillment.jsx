/**
 * Admin · Fulfillment — PRD-24.
 *
 * The zero-touch order orchestrator made observable. Pick an order, run
 * the full pipeline (validate → reserve → payment → invoice → shipping →
 * packing slip → notify → delivered), and watch each step resolve with
 * its retry/circuit-breaker state. Backorders + the live circuit-breaker
 * panel surface where the chain is degraded.
 */

import { useMemo, useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';

import { useViewport } from '../../lib/viewport.js';
import {
  breakerStatus, fulfillBackorders, PIPELINE_STEPS,
} from '../../lib/fulfillment.js';

const STEP_CHIP = {
  pending:    [D.ink3, '○'],
  processing: ['#9a7b1e', '◐'],
  completed:  ['#2d6a4f', '●'],
  failed:     ['#c3382d', '✕'],
};

export function AdminFulfillment() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const orders = db.useTable('orders', { orderBy: 'placed_at', dir: 'desc' });
  const shipments = db.useTable('shipments');
  const orderItems = db.useTable('order_items');
  const distributorProducts = db.useTable('distributor_products');
  const ownerLots = db.useTable('inventory_lots');
  const organizations = db.useTable('organizations');
  const distributorPickups = db.useTable('distributor_pickups', { orderBy: 'created_at', dir: 'desc' });
  const pipeline = db.useTable('fulfillment_pipeline');
  const backorders = db.useTable('backorders', { orderBy: 'created_at', dir: 'desc' });
  const rmas = db.useTable('rmas', { orderBy: 'requested_at', dir: 'desc' });
  const [busy, setBusy] = useState(null);
  const [selected, setSelected] = useState(null);
  const [log, setLog] = useState([]);
  const [freightByBackorder, setFreightByBackorder] = useState({});
  const [handoffReference, setHandoffReference] = useState('');
  const [ownerByItem, setOwnerByItem] = useState({});
  const [readinessEvidence, setReadinessEvidence] = useState({ document_type: 'booking', provider_reference: '' });
  const [pickupEvidence, setPickupEvidence] = useState({});
  const [rmaDisposition, setRmaDisposition] = useState({});
  const [rmaEvidence, setRmaEvidence] = useState({});
  const [rmaRefundEvidence, setRmaRefundEvidence] = useState({});

  const breakers = breakerStatus();

  const stepsByOrder = useMemo(() => {
    const m = new Map();
    for (const s of pipeline) {
      if (!m.has(s.order_id)) m.set(s.order_id, {});
      m.get(s.order_id)[s.step] = s;
    }
    return m;
  }, [pipeline]);

  async function handleRun(orderId) {
    setBusy(orderId);
    setSelected(orderId);
    setLog([]);
    try {
      const response = await fetch('/api/orders/label', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'Server fulfillment is not ready for label creation.');
      db.applyRemoteSnapshot({ orders: result.order ? [result.order] : [], shipments: result.shipment ? [result.shipment] : [] });
      setLog((rows) => [...rows, { step: 'shipping', status: 'completed', label: result.idempotent ? 'Existing label loaded.' : 'Server label created. Inventory remains reserved.' }]);
    } catch (err) {
      setLog((l) => [...l, { step: 'error', status: 'failed', label: err.message }]);
    }
    setBusy(null);
  }

  async function releaseBackorder(backorder) {
    const freight = Number(freightByBackorder[backorder.id]);
    if (!Number.isFinite(freight) || freight < 0) return;
    setBusy(backorder.id);
    const result = await fulfillBackorders(backorder.sku, { shipping_cost: freight });
    setLog((rows) => [...rows, { label: result.suborders.length ? `Created ${result.suborders.map((order) => order.id).join(', ')}` : 'Backorder still waiting for allocatable stock.' }]);
    setBusy(null);
  }

  async function confirmHandoff(orderId) {
    setBusy(`handoff:${orderId}`);
    const response = await fetch('/api/orders/handoff', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, handoff_reference: handoffReference }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.ok) db.applyRemoteSnapshot({ orders: [result.order], shipments: [result.shipment] });
    setLog((rows) => [...rows, {
      label: response.ok && result.ok
        ? `Carrier handoff confirmed for ${orderId}. Inventory and shipment status updated.`
        : `Handoff blocked: ${result.error || 'request failed'}`,
    }]);
    if (response.ok && result.ok) setHandoffReference('');
    setBusy(null);
  }

  async function allocateOwner(orderId, itemId) {
    const ownerOrgId = ownerByItem[itemId];
    if (!ownerOrgId) return;
    setBusy(`owner:${itemId}`);
    const response = await fetch('/api/orders/allocate-owner', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, order_item_id: itemId, owner_org_id: ownerOrgId }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.ok) db.applyRemoteSnapshot({ orders: [result.order], order_items: [result.item] });
    setLog((rows) => [...rows, {
      label: response.ok && result.ok
        ? `Owner pool allocated for ${result.item.sku}. Stock will reserve only after payment release.`
        : `Owner allocation blocked: ${result.error || 'request failed'}`,
    }]);
    setBusy(null);
  }

  async function markDistributorReady(orderId) {
    setBusy(`ready:${orderId}`);
    const response = await fetch('/api/distributor/readiness', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, ...readinessEvidence }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.ok) db.applyRemoteSnapshot({ orders: [result.order], shipments: [result.shipment] });
    setLog((rows) => [...rows, { label: response.ok && result.ok ? `Warehouse readiness recorded for ${orderId}.` : `Readiness blocked: ${result.error || 'request failed'}` }]);
    if (response.ok && result.ok) setReadinessEvidence({ document_type: 'booking', provider_reference: '' });
    setBusy(null);
  }

  async function advancePickup(pickup, action) {
    const evidence = pickupEvidence[pickup.id] || { evidence_type: 'provider_scan', evidence_reference: '' };
    setBusy(`pickup:${pickup.id}`);
    const response = await fetch('/api/distributor/pickup-action', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickup_id: pickup.id, action,
        confirmed_start: pickup.requested_start, confirmed_end: pickup.requested_end,
        ...evidence,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.ok) {
      db.applyRemoteSnapshot({
        distributor_pickups: [result.pickup],
        orders: result.order ? [result.order] : [],
      });
    }
    setLog((rows) => [...rows, { label: response.ok && result.ok ? `Pickup ${pickup.id} advanced to ${result.pickup.status}.` : `Pickup blocked: ${result.error || 'request failed'}` }]);
    setBusy(null);
  }

  async function advanceRma(rma) {
    setBusy(rma.id);
    const action = rma.status === 'requested' ? 'approve'
      : rma.status === 'approved' ? 'receive'
        : rma.status === 'quarantined' ? 'inspect'
          : rma.status === 'refund_pending' ? 'record_refund' : null;
    if (!action) { setBusy(null); return; }
    const refundEvidence = rmaRefundEvidence[rma.id] || {};
    const response = await fetch('/api/returns/action', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rma_id: rma.id, action, expected_revision: Number(rma.revision || 0),
        ...(action === 'inspect' ? {
          disposition: rmaDisposition[rma.id] || 'quality_hold', accepted_items: rma.items,
          disposition_evidence: rmaEvidence[rma.id] ? { reference: rmaEvidence[rma.id] } : null,
        } : {}),
        ...(action === 'record_refund' ? {
          refund_evidence: { provider: refundEvidence.provider || 'stripe', reference: refundEvidence.reference || '', amount: Number(rma.refund_total || 0) },
        } : {}),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.rma) db.applyRemoteSnapshot({ rmas: [result.rma] });
    setLog((rows) => [...rows, { label: response.ok ? `${rma.id} advanced to ${result.rma?.status}.` : `${rma.id} blocked: ${result.error || 'request failed'}.` }]);
    setBusy(null);
  }

  const btn = (primary) => ({
    padding: '7px 14px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: primary ? 'none' : `1.5px solid ${D.ink}`,
    background: primary ? D.plum : 'transparent', color: primary ? D.paper : D.ink,
  });

  function progress(orderId) {
    const steps = stepsByOrder.get(orderId) || {};
    const done = PIPELINE_STEPS.filter((s) => steps[s]?.status === 'completed').length;
    return { done, total: PIPELINE_STEPS.length };
  }
  const selectedShipment = shipments.find((shipment) => shipment.order_id === selected) || null;
  const selectedOrder = orders.find((order) => order.id === selected) || null;
  const selectedItems = orderItems.filter((item) => item.order_id === selected);
  const ownerOptionsFor = (item) => distributorProducts
    .filter((product) => product.unite_sellable === true && product.mapped_unite_sku === item.sku)
    .filter((product) => ownerLots
      .filter((lot) => lot.owner_org_id === product.owner_org_id
        && (lot.product_sku === item.sku || lot.distributor_sku === product.distributor_sku))
      .reduce((sum, lot) => sum + Math.max(0, Number(lot.qty_on_hand || 0) - Number(lot.qty_reserved || 0)), 0) >= Number(item.qty || 0));

  return (
    <AdminShell active="fulfillment">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>ORDERS · ORCHESTRATOR</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>Fulfillment</h1>
        <div style={{ marginTop: 10, fontSize: 13, color: D.ink2, maxWidth: 680 }}>
          Payment or approved credit releases the current in-stock batch. Backordered units remain uncharged until stock arrives and a separately rated suborder is created.
        </div>
      </div>

      <div style={{ padding: isMobile ? 20 : 32 }}>
        {/* Circuit breakers */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {breakers.length === 0 && <div style={{ fontSize: 12, color: D.ink3 }}>All integration circuits closed (healthy).</div>}
          {breakers.map((b) => (
            <span key={b.integration} style={{ fontFamily: D.mono, fontSize: 11, padding: '4px 10px', borderRadius: 4, background: b.open ? 'rgba(195,56,45,.12)' : 'rgba(45,106,79,.12)', color: b.open ? '#c3382d' : '#2d6a4f' }}>
              {b.integration}: {b.open ? 'OPEN' : 'closed'} ({b.recent_failures})
            </span>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 20 }}>
          {/* Orders + pipeline */}
          <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                  {['ORDER', 'CUSTOMER', 'STATUS', 'PIPELINE', ''].map((h) => <th key={h} style={{ padding: 12 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 40).map((o) => {
                  const { done, total } = progress(o.id);
                  const steps = stepsByOrder.get(o.id) || {};
                  return (
                    <tr key={o.id} style={{ borderTop: `1px solid ${D.line}`, background: selected === o.id ? 'rgba(29,92,77,.05)' : 'transparent', cursor: 'pointer' }} onClick={() => setSelected(o.id)}>
                      <td style={{ padding: 12, fontFamily: D.mono, fontSize: 12 }}>{o.id}</td>
                      <td style={{ padding: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name}</td>
                      <td style={{ padding: 12, color: D.ink2 }}>{o.status}</td>
                      <td style={{ padding: 12 }}>
                        <span style={{ display: 'inline-flex', gap: 3 }}>
                          {PIPELINE_STEPS.map((s) => {
                            const [color, glyph] = STEP_CHIP[steps[s]?.status || 'pending'];
                            return <span key={s} title={`${s}: ${steps[s]?.status || 'pending'}`} style={{ color, fontSize: 13 }}>{glyph}</span>;
                          })}
                        </span>
                        <span style={{ marginLeft: 8, fontSize: 11, color: D.ink3 }}>{done}/{total}</span>
                      </td>
                      <td style={{ padding: 12 }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleRun(o.id); }} disabled={busy === o.id} style={btn(true)}>
                          {busy === o.id ? 'Running…' : (done > 0 ? 'Re-run' : 'Run')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 && <tr><td colSpan={5} style={{ padding: 24, color: D.ink3 }}>No orders yet.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Detail / live log */}
          <div>
            <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>PIPELINE DETAIL</div>
              {!selected && <div style={{ fontSize: 13, color: D.ink3, marginTop: 10 }}>Select an order to inspect its steps.</div>}
              {selected && (
                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                  {selectedOrder?.status === 'payment_pending' && selectedItems.map((item) => {
                    const options = ownerOptionsFor(item);
                    if (!options.length) return null;
                    return (
                      <div key={`owner-${item.id}`} style={{ padding: 10, border: `1px solid ${D.line}`, borderRadius: 7 }}>
                        <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>FLOW 2 OWNER · {item.sku} × {item.qty}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 7 }}>
                          <select value={ownerByItem[item.id] || ''} onChange={(event) => setOwnerByItem((current) => ({ ...current, [item.id]: event.target.value }))} style={{ flex: 1, padding: 7, border: `1px solid ${D.line}`, borderRadius: 5 }}>
                            <option value="">Use Unite stock</option>
                            {options.map((option) => (
                              <option key={option.id} value={option.owner_org_id}>{organizations.find((org) => org.id === option.owner_org_id)?.name || option.owner_org_id} · {option.distributor_sku}</option>
                            ))}
                          </select>
                          <button type="button" disabled={!ownerByItem[item.id] || busy === `owner:${item.id}`} onClick={() => allocateOwner(selected, item.id)} style={btn(true)}>Allocate</button>
                        </div>
                      </div>
                    );
                  })}
                  {selectedOrder?.distributor_flow === 'blind_ship' && selectedOrder.status === 'inventory_reserved' && (
                    <div style={{ padding: 10, border: `1px solid ${D.line}`, borderRadius: 7 }}>
                      <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>DISTRIBUTOR WAREHOUSE READINESS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr auto', gap: 8, marginTop: 7 }}>
                        <select value={readinessEvidence.document_type} onChange={(event) => setReadinessEvidence((current) => ({ ...current, document_type: event.target.value }))} style={{ padding: 7, border: `1px solid ${D.line}`, borderRadius: 5 }}>
                          <option value="booking">Booking</option><option value="label">Label</option><option value="bol">BOL</option><option value="pro">PRO</option>
                        </select>
                        <input value={readinessEvidence.provider_reference} onChange={(event) => setReadinessEvidence((current) => ({ ...current, provider_reference: event.target.value }))} placeholder="Provider reference" style={{ padding: 7, border: `1px solid ${D.line}`, borderRadius: 5 }} />
                        <button type="button" onClick={() => markDistributorReady(selected)} disabled={!readinessEvidence.provider_reference.trim() || busy === `ready:${selected}`} style={btn(true)}>Mark ready</button>
                      </div>
                    </div>
                  )}
                  {PIPELINE_STEPS.map((s) => {
                    const row = (stepsByOrder.get(selected) || {})[s];
                    const [color, glyph] = STEP_CHIP[row?.status || 'pending'];
                    return (
                      <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                        <span style={{ color, width: 16 }}>{glyph}</span>
                        <span style={{ fontFamily: D.mono, fontSize: 12, width: 110 }}>{s}</span>
                        <span style={{ color: D.ink3, fontSize: 12 }}>
                          {row ? `${row.status}${row.attempt_count ? ` · ${row.attempt_count} try` : ''}` : 'pending'}
                          {row?.error_message ? ` · ${row.error_message}` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {log.length > 0 && (
                <div style={{ marginTop: 14, padding: 12, background: D.paperAlt, borderRadius: 8, fontFamily: D.mono, fontSize: 11, color: D.ink2, maxHeight: 160, overflow: 'auto' }}>
                  {log.map((l, i) => <div key={i}>{l.label}</div>)}
                </div>
              )}
              {selected && selectedShipment?.status === 'label_created' && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${D.line}` }}>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>PHYSICAL HANDOFF</div>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 6 }}>
                    Label created. Inventory remains reserved until a carrier scan, signed BOL, or custody reference is recorded.
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <input value={handoffReference} onChange={(event) => setHandoffReference(event.target.value)} placeholder="Carrier scan / BOL / custody reference" style={{ flex: 1, minWidth: 0, padding: '8px 10px', border: `1px solid ${D.line}`, borderRadius: 4 }} />
                    <button type="button" onClick={() => confirmHandoff(selected)} disabled={!handoffReference.trim() || busy === `handoff:${selected}`} style={btn(true)}>
                      {busy === `handoff:${selected}` ? 'Confirming…' : 'Confirm handoff'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Backorders */}
            <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18, marginTop: 20 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>BACKORDERS</div>
              {backorders.length === 0 && <div style={{ fontSize: 13, color: D.ink3, marginTop: 10 }}>No backorders — all lines reserved from stock.</div>}
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {backorders.slice(0, 12).map((bo) => (
                  <div key={bo.id} style={{ fontSize: 12, padding: '9px 0', borderTop: `1px solid ${D.line}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{bo.product_name || bo.sku} ×{bo.quantity}<span style={{ color: D.ink3 }}> · {bo.estimated_restock ? new Date(bo.estimated_restock).toLocaleDateString() : 'Date pending'}</span></span>
                      <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '2px 8px', borderRadius: 4, background: bo.status === 'suborder_created' ? 'rgba(45,106,79,.12)' : 'rgba(154,123,30,.14)', color: bo.status === 'suborder_created' ? '#2d6a4f' : '#9a7b1e' }}>{(bo.status || 'pending').toUpperCase()}</span>
                    </div>
                    {bo.status === 'stock_arrived' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <input type="number" min="0" step="0.01" value={freightByBackorder[bo.id] || ''} onChange={(e) => setFreightByBackorder((current) => ({ ...current, [bo.id]: e.target.value }))} placeholder="New freight" style={{ width: 120, padding: '7px 9px', border: `1px solid ${D.line}`, borderRadius: 4 }} />
                        <button type="button" onClick={() => releaseBackorder(bo)} disabled={busy === bo.id || freightByBackorder[bo.id] === undefined} style={btn(true)}>{busy === bo.id ? 'Creating…' : 'Create suborder'}</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18, marginTop: 20 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>DISTRIBUTOR PICKUPS · 09:00–16:00 ET</div>
              {distributorPickups.length === 0 && <div style={{ fontSize: 13, color: D.ink3, marginTop: 10 }}>No pickup requests.</div>}
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {distributorPickups.slice(0, 12).map((pickup) => {
                  const action = pickup.status === 'requested' ? 'confirm' : pickup.status === 'confirmed' ? 'arrival' : pickup.status === 'arrived' ? 'handoff' : null;
                  const evidence = pickupEvidence[pickup.id] || { evidence_type: action === 'handoff' ? 'signed_bol' : 'provider_scan', evidence_reference: '' };
                  return (
                    <div key={pickup.id} style={{ padding: '9px 0', borderTop: `1px solid ${D.line}`, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span><span style={{ fontFamily: D.mono }}>{pickup.public_order_reference || pickup.order_id}</span> · {pickup.carrier_name}</span>
                        <span style={{ fontFamily: D.mono, fontSize: 9, color: D.plum }}>{String(pickup.status).toUpperCase()}</span>
                      </div>
                      <div style={{ color: D.ink3, marginTop: 3 }}>{pickup.confirmed_start || pickup.requested_start} to {pickup.confirmed_end || pickup.requested_end}</div>
                      {action && (
                        <div style={{ display: 'grid', gridTemplateColumns: action === 'confirm' ? '1fr' : '130px 1fr auto', gap: 8, marginTop: 7 }}>
                          {action !== 'confirm' && <select value={evidence.evidence_type} onChange={(event) => setPickupEvidence((current) => ({ ...current, [pickup.id]: { ...evidence, evidence_type: event.target.value } }))} style={{ padding: 7, border: `1px solid ${D.line}`, borderRadius: 5 }}><option value="provider_scan">Provider scan</option><option value="signed_bol">Signed BOL</option><option value="pro">PRO</option><option value="custody_signature">Custody signature</option></select>}
                          {action !== 'confirm' && <input value={evidence.evidence_reference} onChange={(event) => setPickupEvidence((current) => ({ ...current, [pickup.id]: { ...evidence, evidence_reference: event.target.value } }))} placeholder="Evidence reference" style={{ padding: 7, border: `1px solid ${D.line}`, borderRadius: 5 }} />}
                          <button type="button" onClick={() => advancePickup(pickup, action)} disabled={(action !== 'confirm' && !evidence.evidence_reference.trim()) || busy === `pickup:${pickup.id}`} style={btn(true)}>{action === 'confirm' ? 'Confirm window' : action === 'arrival' ? 'Record arrival' : 'Confirm handoff'}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18, marginTop: 20 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>RMA QUEUE</div>
              {rmas.length === 0 && <div style={{ fontSize: 13, color: D.ink3, marginTop: 10 }}>No return requests.</div>}
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {rmas.slice(0, 10).map((rma) => {
                  const label = rma.status === 'requested' ? 'Approve RMA'
                    : rma.status === 'approved' ? 'Receive to quarantine'
                      : rma.status === 'quarantined' ? 'Record inspection'
                        : rma.status === 'refund_pending' ? 'Finance refund' : null;
                  return (
                    <div key={rma.id} style={{ padding: '9px 0', borderTop: `1px solid ${D.line}`, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span><span style={{ fontFamily: D.mono }}>{rma.id}</span> · {rma.order_id}</span>
                        <span style={{ fontFamily: D.mono, fontSize: 9, color: D.plum }}>{String(rma.status).toUpperCase()}</span>
                      </div>
                      <div style={{ marginTop: 4, color: D.ink3 }}>{rma.reason}{rma.restocking_fee != null ? ` · restocking ${rma.restocking_fee}` : ''}{rma.refund_total != null ? ` · refund ${rma.refund_total}` : ''}</div>
                      {rma.status === 'quarantined' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                          <select value={rmaDisposition[rma.id] || 'quality_hold'} onChange={(event) => setRmaDisposition((current) => ({ ...current, [rma.id]: event.target.value }))} style={{ padding: '7px 9px', border: `1px solid ${D.line}`, borderRadius: 4 }}>
                            <option value="quality_hold">Keep on quality hold</option>
                            <option value="investigation_hold">Investigation hold</option>
                            <option value="restock_sellable">Admin release as sellable</option>
                            <option value="expired_disposal">Admin approve expired disposal</option>
                            <option value="return_to_vendor">Admin approve return to vendor</option>
                          </select>
                          <input value={rmaEvidence[rma.id] || ''} onChange={(event) => setRmaEvidence((current) => ({ ...current, [rma.id]: event.target.value }))} placeholder="Evidence reference if disposed/returned" style={{ padding: '7px 9px', border: `1px solid ${D.line}`, borderRadius: 4 }} />
                        </div>
                      )}
                      {rma.status === 'refund_pending' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, marginTop: 8 }}>
                          <select value={rmaRefundEvidence[rma.id]?.provider || 'stripe'} onChange={(event) => setRmaRefundEvidence((current) => ({ ...current, [rma.id]: { ...(current[rma.id] || {}), provider: event.target.value } }))} style={{ padding: '7px 9px', border: `1px solid ${D.line}`, borderRadius: 4 }}>
                            <option value="stripe">Stripe refund</option>
                            <option value="qbo">QBO credit memo</option>
                            <option value="ach">ACH credit</option>
                            <option value="check">Check</option>
                            <option value="manual_credit">Manual account credit</option>
                          </select>
                          <input value={rmaRefundEvidence[rma.id]?.reference || ''} onChange={(event) => setRmaRefundEvidence((current) => ({ ...current, [rma.id]: { ...(current[rma.id] || {}), reference: event.target.value } }))} placeholder="Provider refund or credit reference" style={{ padding: '7px 9px', border: `1px solid ${D.line}`, borderRadius: 4 }} />
                        </div>
                      )}
                      {label && <button type="button" onClick={() => advanceRma(rma)} disabled={busy === rma.id} style={{ ...btn(true), marginTop: 8 }}>{busy === rma.id ? 'Working…' : label}</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
