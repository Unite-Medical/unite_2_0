import { shopifyCatchupHash } from './shopifyCatchup.js';
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

// Matches the existing authenticated staging identity read on October 26.
// A retargeted database must not inherit this account's read exception.
export async function approvedCustomerDatabase(sql, connection) {
  const [identity] = await sql`SELECT current_database() AS database_name, current_schema() AS schema_name`;
  const url = new URL(connection);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !identity) return false;
  return shopifyCatchupHash({ host: url.hostname.toLowerCase().replace(/-pooler(?=\.)/, ''), port: url.port || '5432',
    database: decodeURIComponent(url.pathname.slice(1)), actual_database: identity.database_name, schema: identity.schema_name,
  }) === '6cf2357148ca8c7c686bf3bfde0db65e61a2a44ef823fcc0e2e5dd6e2f051aaa';
}
