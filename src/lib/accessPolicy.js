const INTERNAL_COMMERCE_ROLES = new Set([
  'admin', 'sales', 'sales_manager', 'customer_service', 'finance', 'sourcing', 'sourcing_manager',
]);

export function commerceAccessFor(session, organization) {
  const authenticated = Boolean(session?.user_id);
  const internal = authenticated && INTERNAL_COMMERCE_ROLES.has(session.role);
  const commerceHold = session?.commerce_hold_reason
    || (organization?.id === session?.org_id ? organization?.commerce_hold_reason : null);
  const approvedAccount = authenticated
    && !commerceHold
    && ['customer', 'distributor'].includes(session.role)
    && (
      session.approval_status === 'approved'
      || (Boolean(organization)
        && organization.id === session.org_id
        && organization.approval_status === 'approved')
    );
  const approved = Boolean(internal || approvedAccount);
  return {
    authenticated,
    approved,
    can_view_prices: approved,
    can_use_cart: approved,
    can_order: approved,
    can_quick_quote: true,
  };
}
