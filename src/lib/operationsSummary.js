export function currentMonthOrders(orders, now = new Date()) {
  return orders.filter((order) => {
    const date = new Date(order.placed_at);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
}
export function operationQueues({ orders = [], inventory = [], organizations = [], invoices = [] }, now = new Date()) {
  return {
    orders: orders.filter((o) => ['pending', 'processing', 'payment_pending', 'awaiting_payment', 'pending_shopify_ack'].includes(o.status)).length,
    inventory: inventory.filter((i) => i.physical_count_required || i.reconciliation_status === 'physical_count_required').length,
    customers: organizations.filter((o) => o.approval_status === 'manual_review' || o.status === 'pending_activation').length,
    invoices: invoices.filter((i) => i.status === 'open' && Date.parse(i.due_date) < now.getTime()).length,
  };
}
