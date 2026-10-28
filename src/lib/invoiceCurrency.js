// Legacy invoices without a currency use USD, matching the payment planner.
export const invoiceCurrency = invoice => invoice.currency || 'USD';
export const invoiceBalance = invoice => Number(invoice.balance ?? Math.max(0, Number(invoice.amount ?? invoice.total ?? 0) - Number(invoice.paid_amount || 0)));
export function formatInvoiceMoney(value, currency) {
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat('en-US', {style:'currency', currency, currencyDisplay:'code'}).format(amount);
  } catch {
    // Keep an unrecognized currency visible instead of relabelling it as USD.
    return `${currency} ${amount.toFixed(2)}`;
  }
}
export function invoiceBalanceTotals(invoices) {
  const totals = new Map();
  for (const invoice of invoices) {
    const currency = invoiceCurrency(invoice);
    totals.set(currency, (totals.get(currency) || 0) + invoiceBalance(invoice));
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b));
}
