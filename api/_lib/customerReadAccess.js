// Approved October 26: this existing staff account may read the Unite staging
// customer book. This permission is used only by the customer GET endpoint.
export function canReadUniteCustomerBook(session, env, host) {
  return env.VERCEL_PROJECT_ID === 'prj_PL5BOZooLBtLiPQlrn34SyC0MRKS'
    && env.PUBLIC_APP_ORIGIN === 'https://staging.unitemedical.net'
    && host === 'staging.unitemedical.net'
    && session?.user_id === 'usr_shopify_7337833922726'
    && String(session.email || '').trim().toLowerCase() === 'jacobe@unitemedical.net'
    && ['sales', 'sales_manager'].includes(session.role);
}
