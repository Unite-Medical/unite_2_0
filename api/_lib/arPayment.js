import crypto from 'node:crypto';

function number(value) { return Number(value) || 0; }
function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}

export function planInvoicePayment({ invoice, order = null, input = {}, actorId, now = new Date() } = {}) {
  if (!invoice) return { ok: false, reason: 'invoice_not_found' };
  const provider = String(input.provider || '').trim();
  const reference = String(input.payment_reference || '').trim();
  const method = String(input.method || '').trim();
  const actor = String(actorId || '').trim();
  const amount = number(input.amount);
  if (!['qbo', 'off_platform'].includes(provider) || !reference || !method || !actor || amount <= 0) {
    return { ok: false, reason: 'payment_evidence_required' };
  }
  const evidence = invoice.payment_evidence || [];
  const existing = evidence.find((row) => row.provider === provider && row.payment_reference === reference);
  if (existing) {
    if (Math.abs(number(existing.amount) - amount) > 0.001) return { ok: false, reason: 'payment_reference_conflict' };
    return { ok: true, idempotent: true, invoice, order, payment: existing };
  }
  const balance = number(invoice.balance ?? Math.max(0, number(invoice.amount) - number(invoice.paid_amount)));
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
    status: paid ? 'paid' : 'partial',
    paid_at: paid ? payment.received_at : invoice.paid_at || null,
    payment_evidence: [...evidence, payment],
    updated_at: occurredAt,
  };
  const updatedOrder = order ? {
    ...order,
    paid_amount: +(number(order.paid_amount) + amount).toFixed(2),
    payment_status: paid ? 'paid' : 'partial',
    paid_at: paid ? payment.received_at : order.paid_at || null,
    updated_at: occurredAt,
  } : null;
  return { ok: true, invoice: updatedInvoice, order: updatedOrder, payment };
}
