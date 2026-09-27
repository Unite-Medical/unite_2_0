import crypto from 'node:crypto';

function number(value) { return Number(value) || 0; }
function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}

export function planSettlementPayment({ purchaseOrder, movements = [], input = {}, actorId, now = new Date() } = {}) {
  if (!purchaseOrder || purchaseOrder.po_type !== 'consignment_settlement') return { ok: false, reason: 'settlement_po_required' };
  const provider = String(input.provider || '').trim();
  const reference = String(input.payment_reference || '').trim();
  const actor = String(actorId || '').trim();
  const amount = number(input.amount);
  if (!['qbo', 'off_platform'].includes(provider) || !reference || !actor || amount <= 0) {
    return { ok: false, reason: 'payment_evidence_required' };
  }
  const existingEvidence = purchaseOrder.payment_evidence || [];
  const duplicate = existingEvidence.find((row) => row.provider === provider && row.payment_reference === reference);
  if (duplicate) return { ok: true, idempotent: true, purchase_order: purchaseOrder, movements, payment: duplicate };
  const expectedIds = [...new Set(purchaseOrder.eligible_movement_ids || [])].sort();
  const linked = movements.filter((row) => expectedIds.includes(row.id) && row.settlement_po_id === purchaseOrder.id);
  if (!expectedIds.length || linked.length !== expectedIds.length) return { ok: false, reason: 'settlement_movement_evidence_incomplete' };
  const total = number(purchaseOrder.total_cost);
  const paidBefore = number(purchaseOrder.paid_amount);
  if (paidBefore + amount > total + 0.001) return { ok: false, reason: 'settlement_overpayment' };
  const occurredAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const payment = {
    id: stableId('settlement_payment', `${purchaseOrder.id}:${provider}:${reference}`),
    settlement_po_id: purchaseOrder.id,
    provider,
    payment_reference: reference,
    amount,
    currency: purchaseOrder.settlement_currency || purchaseOrder.currency || 'USD',
    recorded_by: actor,
    paid_at: input.paid_at || occurredAt,
    created_at: occurredAt,
  };
  const paidAmount = +(paidBefore + amount).toFixed(2);
  const fullyPaid = paidAmount + 0.001 >= total;
  const updatedPo = {
    ...purchaseOrder,
    paid_amount: paidAmount,
    balance: +Math.max(0, total - paidAmount).toFixed(2),
    status: fullyPaid ? 'closed' : 'partially_paid',
    paid_at: fullyPaid ? payment.paid_at : purchaseOrder.paid_at || null,
    payment_evidence: [...existingEvidence, payment],
    updated_at: occurredAt,
  };
  const updatedMovements = movements.map((movement) => {
    if (!fullyPaid || !expectedIds.includes(movement.id)) return { ...movement };
    return {
      ...movement,
      settled: true,
      settled_at: payment.paid_at,
      settled_by: actor,
      settlement_payment_reference: reference,
      settlement_payment_provider: provider,
    };
  });
  return { ok: true, purchase_order: updatedPo, movements: updatedMovements, payment };
}
