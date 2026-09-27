import { useState } from 'react';
import { D } from '../../tokens.js';

function primary(enabled) {
  return {
    padding: '10px 16px', borderRadius: 7, border: 'none',
    background: enabled ? D.plum : D.line, color: enabled ? D.paper : D.ink3,
    cursor: enabled ? 'pointer' : 'not-allowed', fontWeight: 600,
  };
}

export function DistributorBlindOrder({ overview, navigate }) {
  const ownerOptions = overview?.products || [];
  const paymentOptions = overview?.payment_methods || [];
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState({
    external_reference: '', fulfillment_mode: 'distributor_pickup',
    carrier_name: '', carrier_service: '', carrier_account_ref: '',
    payment_method: paymentOptions[0]?.method || 'net30',
    recipient: '', company: '', line1: '', line2: '', city: '', state: '', zip: '',
    country: 'US', email: '', phone: '',
  });
  const [lines, setLines] = useState([{
    source: 'owner', sku: ownerOptions[0]?.distributor_sku || '', qty: 1,
  }]);
  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setLine = (index, key, value) => setLines((current) => current.map((line, rowIndex) => (
    rowIndex === index ? { ...line, [key]: value } : line
  )));
  async function submit() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/distributor/orders', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          external_reference: form.external_reference,
          fulfillment_mode: form.fulfillment_mode,
          carrier_name: form.carrier_name,
          carrier_service: form.carrier_service || null,
          carrier_account_ref: form.carrier_account_ref || null,
          payment_method: form.payment_method,
          destination: {
            recipient: form.recipient, company: form.company, line1: form.line1,
            line2: form.line2 || null, city: form.city, state: form.state,
            zip: form.zip, country: form.country, email: form.email, phone: form.phone,
          },
          lines: lines.map((line) => ({ source: line.source, sku: line.sku.trim(), qty: Number(line.qty) })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      navigate(`/orders/${body.order.id}/confirmed`);
    } catch (error) {
      setNotice(`Order blocked: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }
  const input = (key, label, type = 'text') => (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3 }}>{label}</span>
      <input
        type={type} value={form[key]} onChange={(event) => setField(key, event.target.value)}
        style={{ padding: '10px 11px', border: `1px solid ${D.line}`, borderRadius: 7, background: D.paper }}
      />
    </label>
  );
  const complete = form.external_reference && form.carrier_name && form.recipient && form.company
    && form.line1 && form.city && form.state && form.zip && form.email
    && lines.length && lines.every((line) => line.sku && Number(line.qty) > 0)
    && (form.fulfillment_mode !== 'third_party_carrier' || form.carrier_account_ref);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontFamily: D.display, fontSize: 24 }}>Blind-ship order</div>
        <p style={{ color: D.ink2, fontSize: 13 }}>Enter your order reference, destination, carrier workflow, and the inventory source for every line. Unite customer PO files are not collected here.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
          {input('external_reference', 'YOUR ORDER REFERENCE')}
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3 }}>FULFILLMENT</span>
            <select value={form.fulfillment_mode} onChange={(event) => setField('fulfillment_mode', event.target.value)} style={{ padding: '10px 11px', border: `1px solid ${D.line}`, borderRadius: 7, background: D.paper }}>
              <option value="distributor_pickup">Distributor pickup</option>
              <option value="third_party_carrier">Third-party carrier</option>
            </select>
          </label>
          {input('carrier_name', 'CARRIER / COURIER')}
          {input('carrier_service', 'SERVICE')}
          {form.fulfillment_mode === 'third_party_carrier' && input('carrier_account_ref', 'CARRIER ACCOUNT REFERENCE')}
          {paymentOptions.length > 0 && (
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3 }}>PAYMENT METHOD</span>
              <select value={form.payment_method} onChange={(event) => setField('payment_method', event.target.value)} style={{ padding: '10px 11px', border: `1px solid ${D.line}`, borderRadius: 7, background: D.paper }}>
                {paymentOptions.map((option) => <option key={option.method} value={option.method}>{option.label}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>

      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontFamily: D.display, fontSize: 20, marginBottom: 12 }}>Destination and receiving contact</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
          {input('recipient', 'RECIPIENT')}{input('company', 'FACILITY')}{input('line1', 'ADDRESS')}{input('line2', 'SUITE / DOCK')}
          {input('city', 'CITY')}{input('state', 'STATE')}{input('zip', 'ZIP')}{input('country', 'COUNTRY')}
          {input('email', 'RECEIVING EMAIL', 'email')}{input('phone', 'RECEIVING PHONE', 'tel')}
        </div>
      </div>

      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ fontFamily: D.display, fontSize: 20 }}>Order lines</div>
          <button type="button" onClick={() => setLines((current) => [...current, { source: 'owner', sku: '', qty: 1 }])} style={primary(true)}>Add line</button>
        </div>
        {lines.map((line, index) => (
          <div key={`${index}-${line.source}`} style={{ display: 'grid', gridTemplateColumns: '150px minmax(160px,1fr) 90px auto', gap: 8, marginTop: 10 }}>
            <select value={line.source} onChange={(event) => setLine(index, 'source', event.target.value)} style={{ padding: 10, border: `1px solid ${D.line}`, borderRadius: 7, background: D.paper }}>
              <option value="owner">My inventory</option><option value="unite">Unite catalog</option>
            </select>
            {line.source === 'owner' ? (
              <select value={line.sku} onChange={(event) => setLine(index, 'sku', event.target.value)} style={{ padding: 10, border: `1px solid ${D.line}`, borderRadius: 7, background: D.paper }}>
                <option value="">Select SKU…</option>
                {ownerOptions.map((product) => <option key={product.id} value={product.distributor_sku}>{product.distributor_sku} · {product.product_name || product.unite_sku}</option>)}
              </select>
            ) : (
              <input value={line.sku} onChange={(event) => setLine(index, 'sku', event.target.value.toUpperCase())} placeholder="Unite SKU" style={{ padding: 10, border: `1px solid ${D.line}`, borderRadius: 7 }} />
            )}
            <input type="number" min="1" step="1" value={line.qty} onChange={(event) => setLine(index, 'qty', event.target.value)} style={{ padding: 10, border: `1px solid ${D.line}`, borderRadius: 7 }} />
            <button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, rowIndex) => rowIndex !== index))} style={{ border: 'none', background: 'transparent', color: D.terra, cursor: 'pointer' }}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={submit} disabled={busy || !complete} style={{ marginTop: 16, ...primary(!busy && complete) }}>{busy ? 'Placing…' : 'Place blind-ship order'}</button>
        {notice && <div style={{ marginTop: 10, color: D.terra, fontSize: 12 }}>{notice}</div>}
      </div>
    </div>
  );
}
