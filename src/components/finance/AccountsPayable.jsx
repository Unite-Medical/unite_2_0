import { useEffect, useMemo, useState } from 'react';
import { D } from '../../tokens.js';
import { fmt } from '../../lib/format.js';

const fieldStyle = { padding: '9px 10px', border: `1px solid ${D.line}`, borderRadius: 6, background: D.paper };

const apError = code => ({qbo_not_configured:'QuickBooks is not connected. The matched invoice remains saved; no accounting bill was posted.',invoice_key_reused_with_different_payload:'This invoice number already has different details. Review the saved invoice before submitting again.',work_unavailable:'Supplier bills are temporarily unavailable. Try again.'}[code] || code);

function parseLines(lines) {
  if (!lines.length) throw new Error('Add at least one invoice line.');
  return lines.map((line,index)=>{
    const parsed={sku:line.sku.trim(),qty:Number(line.qty),unit_cost:Number(line.unit_cost)};
    if(!parsed.sku||!Number.isFinite(parsed.qty)||parsed.qty<=0||line.unit_cost===''||!Number.isFinite(parsed.unit_cost)||parsed.unit_cost<0) throw new Error(`Check the SKU, quantity and unit cost on line ${index+1}.`);
    return parsed;
  });
}

export function AccountsPayable({onDirtyChange}) {
  const [data, setData] = useState({ vendor_bills: [], purchase_orders: [], ap_intake: [] });
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState({ po_id: '', vendor_invoice_number: '', invoice_date: '', lines: [] });
  const [savedForm,setSavedForm]=useState(JSON.stringify({ po_id: '', vendor_invoice_number: '', invoice_date: '', lines: [] }));
  const dirty=JSON.stringify(form)!==savedForm;
  useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
  function discard(){const value={po_id:'',vendor_invoice_number:'',invoice_date:'',lines:[]};setForm(value);setSavedForm(JSON.stringify(value));setNotice(null);}
  const [payment, setPayment] = useState({ settlement_po_id: '', provider: 'accounting', payment_reference: '', amount: '' });

  async function load() {
    const response = await fetch('/api/ap/vendor-bills', { credentials: 'include' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(apError(body.error) || `HTTP ${response.status}`);
    setData(body);
    setState('ready');
  }
  useEffect(() => {
    let active = true;
    fetch('/api/ap/vendor-bills', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(apError(body.error) || `HTTP ${response.status}`);
        return body;
      })
      .then((body) => { if (active) { setData(body); setState('ready'); } })
      .catch((error) => { if (active) { setNotice(error.message); setState('error'); } });
    return () => { active = false; };
  }, []);

  const selectedPo = useMemo(() => data.purchase_orders.find((po) => po.id === form.po_id) || null, [data.purchase_orders, form.po_id]);
  function selectPo(poId) {
    const po = data.purchase_orders.find((row) => row.id === poId);
    const lines = (po?.line_items || [])
      .filter((line) => Number(line.billable_qty || 0) > 0 || po.po_type === 'consignment_settlement')
      .map((line) => ({sku:line.sku,qty:po.po_type === 'consignment_settlement' ? line.qty : line.billable_qty,unit_cost:line.cost}));
    setForm((current) => ({ ...current, po_id: poId, lines }));
  }
  async function submit(event) {
    event.preventDefault();
    setBusy('submit'); setNotice(null);
    try {
      const response = await fetch('/api/ap/vendor-bills', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit', po_id: form.po_id,
          vendor_invoice_number: form.vendor_invoice_number,
          invoice_date: form.invoice_date || null,
          lines: parseLines(form.lines),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apError(body.error) || `HTTP ${response.status}`);
      setSavedForm(JSON.stringify(form));
      setNotice(`Invoice ${body.vendor_bill.vendor_invoice_number} matched. ${fmt.money(body.match.approved_amount)} eligible for approval, ${fmt.money(body.match.held_amount)} held.`);
      await load();
    } catch (error) {
      setNotice(`Submission blocked: ${error.message}`);
    } finally { setBusy(null); }
  }
  async function approve(bill) {
    setBusy(bill.id); setNotice(null);
    try {
      const response = await fetch('/api/ap/vendor-bills', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', vendor_bill_id: bill.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 202) throw new Error(apError(body.error) || `HTTP ${response.status}`);
      setNotice(response.status === 202
        ? `Accounting-system outcome needs reconciliation for ${bill.vendor_invoice_number}. Retry checks for the existing bill before creating one.`
        : `${bill.vendor_invoice_number} approved for ${fmt.money(body.match?.approved_amount || body.vendor_bill?.approved_amount || 0)}.`);
      await load();
    } catch (error) {
      setNotice(`Approval blocked: ${error.message}`);
    } finally { setBusy(null); }
  }
  async function recordSettlementPayment(event) {
    event.preventDefault();
    setBusy('settlement-payment'); setNotice(null);
    try {
      const response = await fetch('/api/ap/settlement-payment', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payment, amount: Number(payment.amount) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apError(body.error) || `HTTP ${response.status}`);
      setNotice(`Settlement payment recorded. ${body.purchase_order.status === 'closed' ? 'Supplier PO closed.' : `${fmt.money(body.purchase_order.balance)} remains.`}`);
      setPayment({ settlement_po_id: '', provider: 'accounting', payment_reference: '', amount: '' });
      await load();
    } catch (error) {
      setNotice(`Settlement payment blocked: ${error.message}`);
    } finally { setBusy(null); }
  }

  if (state === 'loading') return <div style={{ color: D.ink3 }}>Loading accounts payable…</div>;
  const settlementPos = data.purchase_orders.filter((po) => po.po_type === 'consignment_settlement' && po.status !== 'closed');
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {notice && <div role="status" style={{ padding: '11px 14px', background: D.paperAlt, border: `1px solid ${D.line}`, borderRadius: 8, fontSize: 13 }}>{notice}</div>}

      {state === 'error' && <button className="uw-button" onClick={()=>load().catch(error=>setNotice(error.message))}>Try loading supplier bills again</button>}
      {dirty&&<button type="button" className="uw-button quiet" onClick={discard}>Discard invoice draft</button>}
      <form onSubmit={submit} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
        <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>VENDOR INVOICE INTAKE</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: 10, marginTop: 12 }}>
          <label>Purchase order<select required value={form.po_id} onChange={(event) => selectPo(event.target.value)} style={fieldStyle}>
            <option value="">Select payable PO…</option>
            {data.purchase_orders.map((po) => <option key={po.id} value={po.id}>{po.id} · {po.vendor_name || po.vendor_id || po.po_type} · {po.status}</option>)}
          </select></label>
          <label>Supplier invoice number<input required value={form.vendor_invoice_number} onChange={(event) => setForm((current) => ({ ...current, vendor_invoice_number: event.target.value }))} placeholder="Vendor invoice number" style={fieldStyle} /></label>
          <label>Invoice date<input type="date" value={form.invoice_date} onChange={(event) => setForm((current) => ({ ...current, invoice_date: event.target.value }))} style={fieldStyle} /></label>
        </div>
        {selectedPo && <div style={{ marginTop: 8, fontSize: 12, color: D.ink3 }}>{selectedPo.vendor_name || selectedPo.vendor_id} · {(selectedPo.po_type||'standard').replaceAll('_', ' ')} · {fmt.money(selectedPo.total_cost)}</div>}
        <p style={{fontSize:13}}>Select a purchase order to fill in received quantities. Compare each line with the supplier invoice before matching.</p>
        {form.lines.map((line,index)=><div key={index} className="uw-ap-line">{[['sku','SKU','text'],['qty','Quantity','number'],['unit_cost','Unit cost','number']].map(([key,label,type])=><label key={key}>{label}<input aria-label={`${label} line ${index+1}`} required type={type} min={key==='qty'?'0.01':key==='unit_cost'?'0':undefined} step="any" value={line[key]??''} onChange={event=>setForm(current=>({...current,lines:current.lines.map((r,i)=>i===index?{...r,[key]:event.target.value}:r)}))} style={fieldStyle}/></label>)}<button type="button" className="uw-button quiet" aria-label={`Remove line ${index+1}`} onClick={()=>setForm(current=>({...current,lines:current.lines.filter((_,i)=>i!==index)}))}>Remove</button></div>)}
        {form.po_id&&<button type="button" className="uw-button" onClick={()=>setForm(current=>({...current,lines:[...current.lines,{sku:'',qty:'',unit_cost:''}]}))}>Add invoice line</button>}

        <button type="submit" disabled={busy === 'submit'||!form.po_id||!form.lines.length} style={{ marginTop: 10, padding: '9px 16px', border: 0, borderRadius: 6, background: D.plum, color: D.paper, cursor: 'pointer', fontWeight: 600 }}>{busy === 'submit' ? 'Matching…' : 'Match vendor invoice'}</button>
      </form>

      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
          <thead><tr style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>{['INVOICE', 'PO', 'STATUS', 'ELIGIBLE', 'HELD', 'LINE REVIEW', 'ACTION'].map((label) => <th key={label} style={{ padding: 11, textAlign: 'left' }}>{label}</th>)}</tr></thead>
          <tbody>
            {data.vendor_bills.map((bill) => (
              <tr key={bill.id} style={{ borderTop: `1px solid ${D.line}` }}>
                <td style={{ padding: 11, fontFamily: D.mono }}>{bill.vendor_invoice_number}</td>
                <td style={{ padding: 11, fontFamily: D.mono }}>{bill.po_id}</td>
                <td style={{ padding: 11 }}>{bill.status.replaceAll('_', ' ')}</td>
                <td style={{ padding: 11 }}>{fmt.money(bill.approved_amount)}</td>
                <td style={{ padding: 11, color: bill.held_amount > 0 ? D.terra : D.ink2 }}>{fmt.money(bill.held_amount)}</td>
                <td style={{ padding: 11 }}>
                  {(bill.match?.lines || []).map((line) => <div key={line.sku}><span style={{ fontFamily: D.mono }}>{line.sku}</span> · {line.approved_qty}/{line.vendor_billed_qty} eligible · {fmt.money(line.held_amount)} held</div>)}
                  {(bill.match?.unexpected_lines || []).map((line) => <div key={`unexpected-${line.sku}`} style={{ color: D.terra }}>{line.sku} unexpected · {fmt.money(line.held_amount)} held</div>)}
                </td>
                <td style={{ padding: 11 }}>
                  {!bill.accounting_bill_id && ['matched', 'variance_review', 'reconciliation_required'].includes(bill.status) && (
                    <button type="button" onClick={() => approve(bill)} disabled={busy === bill.id} style={{ padding: '7px 12px', border: 0, borderRadius: 5, background: D.plum, color: D.paper, cursor: 'pointer' }}>{bill.status === 'reconciliation_required' ? 'Reconcile' : bill.held_amount > 0 ? 'Approve short-pay' : 'Approve'}</button>
                  )}
                  {bill.accounting_bill_id && <span style={{ fontFamily: D.mono, color: '#2d6a4f' }}>Posted · {bill.accounting_bill_id}</span>}
                </td>
              </tr>
            ))}
            {!data.vendor_bills.length && <tr><td colSpan={7} style={{ padding: 18, color: D.ink3 }}>No vendor invoices submitted.</td></tr>}
          </tbody>
        </table>
      </div>

      <details><summary>Settlement payment evidence{!settlementPos.length&&' · No open settlement orders'}</summary>{settlementPos.length>0&&<form onSubmit={recordSettlementPayment} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
        <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>SETTLEMENT PAYMENT EVIDENCE</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: 10, marginTop: 12 }}>
          <select required value={payment.settlement_po_id} onChange={(event) => setPayment((current) => ({ ...current, settlement_po_id: event.target.value }))} style={fieldStyle}>
            <option value="">Select settlement PO…</option>
            {settlementPos.map((po) => <option key={po.id} value={po.id}>{po.id} · {fmt.money(po.total_cost - po.paid_amount)} open</option>)}
          </select>
          <select value={payment.provider} onChange={(event) => setPayment((current) => ({ ...current, provider: event.target.value }))} style={fieldStyle}><option value="accounting">Accounting system</option><option value="off_platform">Off-platform</option></select>
          <input required value={payment.payment_reference} onChange={(event) => setPayment((current) => ({ ...current, payment_reference: event.target.value }))} placeholder="Payment reference" style={fieldStyle} />
          <input required type="number" min="0.01" step="0.01" value={payment.amount} onChange={(event) => setPayment((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount" style={fieldStyle} />
          <button type="submit" disabled={busy === 'settlement-payment'} style={{ padding: '9px 14px', border: 0, borderRadius: 6, background: D.plum, color: D.paper, cursor: 'pointer' }}>Record</button>
        </div>
      </form>}</details>
    </div>
  );
}
