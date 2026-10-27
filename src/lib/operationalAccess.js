// Operational capabilities are independent of finance/security administration.
export const ORDER_ENTRY_ROLES = ['admin','sales','sales_manager'];
export const PURCHASE_DRAFT_ROLES = ['admin','sales','sales_manager'];
export const canEnterOrders = session => ORDER_ENTRY_ROLES.includes(session?.role);
export const canPreparePurchases = session => PURCHASE_DRAFT_ROLES.includes(session?.role);
export const canUseOrderAction = (session, action) => session?.role === 'admin' || (canEnterOrders(session) && ['preview','save','submit'].includes(action));
export const orderWorkspacePath = session => session?.role === 'admin' ? '/admin/orders' : '/sales/orders';
export const purchaseWorkspacePath = session => session?.role === 'admin' ? '/admin/purchase-orders' : '/sales/purchase-orders';
