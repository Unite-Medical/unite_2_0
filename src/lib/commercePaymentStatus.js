// Historical Shopify payment labels may have been manual fulfillment overrides.
// No current accounting join exists here: never turn that label into cash evidence.
export function commercePaymentStatus(order = {}) {
  return order.historical === true ? 'payment_review_needed' : order.financial_status || 'payment_review_needed';
}

// Present one current payment value consistently without rewriting source history.
export function commercePaymentEvidence(order) {
  if (!order || order.historical !== true) return order;
  return {
    ...order,
    source_financial_status: order.source_financial_status ?? order.financial_status ?? null,
    source_total_outstanding: order.source_total_outstanding ?? order.total_outstanding ?? null,
    financial_status: commercePaymentStatus(order),
    total_outstanding: null,
    payment_reconciliation_status: 'pending_quickbooks',
  };
}
