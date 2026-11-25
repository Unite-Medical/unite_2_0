// Exact imported profile ID verified in the live staff roster. The apostrophe
// is part of the stored ID; do not normalize IDs or admit its lookalike.
export const UNITE_CUSTOMER_READ_USER_ID = "usr_shopify_'7337833922726";
export function isUniteCustomerReadIdentity(session) {
  // login_email is only set server-side by the staging alias map (never signed into tokens).
  return (session?.user_id === UNITE_CUSTOMER_READ_USER_ID || Boolean(session?.login_email))
    && String(session.email || '').trim().toLowerCase() === 'jacobe@unitemedical.net'
    && ['sales','sales_manager'].includes(session.role);
}
