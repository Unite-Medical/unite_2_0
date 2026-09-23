const clean = value => String(value ?? '').trim().toLowerCase();
const pick = (row, fields) => Object.fromEntries(fields.filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]]));
export const CUSTOMER_WORKSPACE_ROLES = ['admin', 'sales', 'sales_manager', 'customer_service'];
export const CUSTOMER_WORKSPACE_TABLES = ['organizations', 'orders', 'quotes', 'backorders', 'reps'];

// Explicit assignments take precedence over the older name-based rep attribution.
export function buildCustomerWorkspace(tables, session) {
  if (!CUSTOMER_WORKSPACE_ROLES.includes(session?.role)) return { ok: false, error: 'forbidden' };
  const who = clean(session.email), userId = session.user_id;
  const roster = (tables.reps || []).filter(rep => who && clean(rep.email) === who && !['inactive', 'disabled', 'terminated'].includes(rep.status));
  const names = new Set(roster.filter(rep => (tables.reps || []).filter(other => clean(other.name) === clean(rep.name)).length === 1).map(rep => clean(rep.name)).filter(Boolean));
  const ids = new Set(roster.map(rep => rep.id).filter(Boolean));
  const organizations = (tables.organizations || []).filter(org => {
    if (org.status === 'merged') return false;
    if (session.role === 'admin') return true;
    const ownerEmail = clean(org.account_owner_email || org.owner_email);
    const ownerId = org.account_owner_id || org.owner_id;
    if (ownerEmail || ownerId) return Boolean((who && ownerEmail === who) || (userId && ownerId === userId));
    if (org.rep_id || org.account_rep_id) return ids.has(org.rep_id || org.account_rep_id);
    return names.has(clean(org.account_rep));
  });
  const accounts = organizations.map(org => {
    const belongs = row => (row.customer_id || row.org_id) === org.id;
    const newest = (a, b) => (Date.parse(b.created_at || b.placed_at) || 0) - (Date.parse(a.created_at || a.placed_at) || 0);
    return {
      ...pick(org, ['id', 'name', 'status', 'approval_status', 'segment', 'tier', 'terms', 'commerce_hold_reason', 'account_owner_email']),
      orders: (tables.orders || []).filter(belongs).sort(newest).map(row => pick(row, ['id', 'order_number', 'source_order_number', 'status', 'payment_status', 'total', 'created_at', 'placed_at', 'tracking_number'])),
      quotes: (tables.quotes || []).filter(belongs).sort(newest).map(row => pick(row, ['id', 'status', 'total', 'created_at', 'expires_at'])),
      backorders: (tables.backorders || []).filter(belongs).filter(row => !['closed', 'resolved', 'cancelled', 'fulfilled'].includes(row.status)).map(row => pick(row, ['id', 'order_id', 'sku', 'status', 'due_at', 'expected_at'])),
    };
  }).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
  return { ok: true, accounts, scope: session.role === 'admin' ? 'all' : 'assigned', generated_at: new Date().toISOString() };
}
