// Historical Shopify labels are source history; only verified accounting establishes balances.
export function verifiedCommerceAccounting(order = {}) {
  const p = order.accounting_reconciliation;
  return p?.source === 'quickbooks_online' && p.status === 'verified'
    && order.payment_reconciliation_status === 'matched_quickbooks'
    && /^\d+$/.test(p.invoice_id || '') && Boolean(p.customer_id)
    && p.currency === order.currency && Number.isFinite(p.total) && p.total === Number(order.total)
    && Number.isFinite(p.balance) && p.balance >= 0 && p.balance <= p.total
    && /^[a-f0-9]{64}$/.test(p.source_sha256 || '') && Boolean(p.realm_fingerprint)
    && Number.isFinite(Date.parse(p.retrieved_at));
}
export function commercePaymentStatus(order = {}) {
  if (order.historical === true) {
    if (!verifiedCommerceAccounting(order)) return 'payment_review_needed';
    const p = order.accounting_reconciliation;
    return p.balance === 0 ? 'paid' : p.balance === p.total ? 'unpaid' : 'partially_paid';
  }
  return order.financial_status || 'payment_review_needed';
}
export function commercePaymentEvidence(order) {
  if (!order || order.historical !== true) return order;
  const verified = verifiedCommerceAccounting(order);
  return {
    ...order,
    source_financial_status: order.source_financial_status ?? order.financial_status ?? null,
    source_total_outstanding: order.source_total_outstanding ?? order.total_outstanding ?? null,
    financial_status: commercePaymentStatus(order),
    total_outstanding: verified ? order.accounting_reconciliation.balance : null,
    payment_reconciliation_status: verified ? 'matched_quickbooks' : 'pending_quickbooks',
  };
}
