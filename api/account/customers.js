import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { sendJson } from '../_lib/http.js';
import { buildCustomerWorkspace, CUSTOMER_WORKSPACE_ROLES, CUSTOMER_WORKSPACE_TABLES } from '../_lib/customerWorkspace.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  try {
    const sql = neon(process.env.DATABASE_URL);
    const live = await authorizeLiveRequest(req, sql, { roles: CUSTOMER_WORKSPACE_ROLES });
    if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    const rows = await sql`SELECT tbl,data FROM um_rows WHERE tbl=ANY(${CUSTOMER_WORKSPACE_TABLES}) AND deleted=false`;
    const tables = Object.fromEntries(CUSTOMER_WORKSPACE_TABLES.map(table => [table, []]));
    for (const row of rows) tables[row.tbl].push(row.data);
    return sendJson(res, 200, buildCustomerWorkspace(tables, live.session));
  } catch { return sendJson(res, 500, { error: 'customers_unavailable' }); }
}
