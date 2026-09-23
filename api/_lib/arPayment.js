import crypto from 'node:crypto';
import {shipmentBillFingerprint} from './shipmentExecution.js';

function number(value) { return Number(value) || 0; }
function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}

export function planInvoicePayment({ invoice, order = null, input = {}, actorId, now = new Date() } = {}) {
  if(invoice?.kind==='shipment_freight'&&(!order||invoice.customer_approval?.fingerprint!==shipmentBillFingerprint(invoice)||invoice.customer_approval?.actor_email!=='jacobe@unitemedical.net'))return {ok:false,reason:'customer_freight_approval_required'};
  if (!invoice) return { ok: false, reason: 'invoice_not_found' };
  const provider = String(input.provider || '').trim();
  const reference = String(input.payment_reference || '').trim();
  const method = String(input.method || '').trim();
  const actor = String(actorId || '').trim();
  const amount = number(input.amount);
  if (!['qbo', 'off_platform'].includes(provider) || !reference || !method || !actor || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'payment_evidence_required' };
  }
  const evidence = invoice.payment_evidence || [];
  const existing = evidence.find((row) => row.provider === provider && row.payment_reference === reference);
  if (existing) {
    if (Math.abs(number(existing.amount) - amount) > 0.001 || existing.method!==method) return { ok: false, reason: 'payment_reference_conflict' };
    return { ok: true, idempotent: true, invoice, order, payment: existing };
  }
  if(['void','voided','cancelled','canceled','refunded','written_off','settled'].includes(invoice.status))return {ok:false,reason:'invoice_closed'};
  if(order&&['cancelled','canceled','refunded'].includes(order.status))return {ok:false,reason:'cancelled_order_payment_requires_reconciliation'};
  if(invoice.kind==='shipment_freight'&&order?.shipment_plan?.find(s=>s.id===invoice.shipment_id)?.status==='cancelled')return {ok:false,reason:'cancelled_order_payment_requires_reconciliation'};
  if(!Number.isSafeInteger(Math.round(amount*100))||Math.abs(amount*100-Math.round(amount*100))>0.00001)return {ok:false,reason:'payment_amount_requires_cents'};
  if(invoice.currency&&invoice.currency!=='USD')return {ok:false,reason:'invoice_currency_requires_reconciliation'};
  const total=Number(invoice.amount??invoice.total),previousPaid=Number(invoice.paid_amount||0),writtenOff=Number(invoice.written_off_amount||0);
  const balance=Number(invoice.balance??total-previousPaid-writtenOff);
  if(![total,previousPaid,writtenOff,balance].every(n=>Number.isFinite(n)&&n>=0)||Math.abs(total-previousPaid-writtenOff-balance)>0.01)return {ok:false,reason:'invoice_balance_requires_reconciliation'};
  if (amount > balance + 0.001) return { ok: false, reason: 'invoice_overpayment' };
  const occurredAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const payment = {
    id: stableId('payment', `${invoice.id}:${provider}:${reference}`),
    invoice_id: invoice.id,
    order_id: invoice.order_id || null,
    customer_id: invoice.customer_id || null,
    provider,
    payment_reference: reference,
    method,
    amount,
    currency: invoice.currency || 'USD',
    recorded_by: actor,
    received_at: input.received_at || occurredAt,
  };
  const newBalance = +Math.max(0, balance - amount).toFixed(2);
  const paidAmount = +(number(invoice.paid_amount) + amount).toFixed(2);
  const paid = newBalance <= 0.001;
  const updatedInvoice = {
    ...invoice,
    paid_amount: paidAmount,
    balance: newBalance,
    status: paid ? (number(invoice.written_off_amount)>0?'settled':'paid') : 'partial',
    paid_at: paid&&number(invoice.written_off_amount)===0 ? payment.received_at : invoice.paid_at || null,
    payment_evidence: [...evidence, payment],
    updated_at: occurredAt,
  };
  const orderPaidAmount=+(number(order?.paid_amount)+amount).toFixed(2);
  const orderPaid=order&&Number.isFinite(Number(order.total))&&orderPaidAmount>=Number(order.total)-0.001;
  let updatedOrder = order ? {
    ...order,
    paid_amount: orderPaidAmount,
    payment_status: orderPaid ? 'paid' : order.payment_status==='terms_approved'?'terms_approved':'partial',
    paid_at: orderPaid ? payment.received_at : order.paid_at || null,
    updated_at: occurredAt,
  } : null;
  if(invoice.kind==='shipment_freight'){
    const shipment=order.shipment_plan?.find(s=>s.id===invoice.shipment_id);
    if(!shipment||shipment.charge?.final_amount!==invoice.freight)return {ok:false,reason:'shipment_invoice_changed'};
    updatedOrder={...order,shipment_plan:order.shipment_plan.map(s=>s.id===invoice.shipment_id?{...s,charge:{...s.charge,payment_status:paid?'paid':'partial',payment_reference:reference,invoice_id:invoice.id}}:s),shipping_plan_revision:Number(order.shipping_plan_revision||0)+1,updated_at:occurredAt};
  }
  return { ok: true, invoice: updatedInvoice, order: updatedOrder, payment };
}
