import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody, sendJson } from '../_lib/http.js';
import { buildBusinessReport, getBusinessReport, saveBusinessReport } from '../_lib/businessIntelligence.js';
import { readQboCredential } from '../_lib/qboTokens.js';
import { SERVICES } from '../_lib/services.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (!['GET', 'POST'].includes(req.method)) return sendJson(res, 405, { error: 'Method not allowed.' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'The workspace database is not configured.' });
  try {
    const sql = neon(process.env.DATABASE_URL), live = await authorizeLiveRequest(req, sql, { roles: ['admin'] });
    if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    if (req.method === 'POST') {
      if (!req.headers.origin || new URL(req.headers.origin).origin !== new URL(process.env.PUBLIC_APP_ORIGIN).origin) return sendJson(res, 403, { error: 'Generate reports from this workspace.' });
      const raw = await readRawBody(req);
      if (raw.length > 2000) return sendJson(res, 413, { error: 'Request too large.' });
      const input = JSON.parse(raw.toString('utf8'));
      const report = await buildBusinessReport(sql, input);
      return sendJson(res, 200, { report: await saveBusinessReport(sql, report, live.session.user_id) });
    }
    if (req.query.id) return sendJson(res, 200, { report: await getBusinessReport(sql, String(req.query.id)) });
    const [history, credential] = await Promise.all([
      sql`SELECT id,data->'period' AS period,data->>'created_at' AS created_at,data->'qbo'->>'status' AS qbo_status,data->'shopify'->>'status' AS shopify_status FROM um_rows WHERE tbl='business_reports' AND deleted=false ORDER BY updated_at DESC LIMIT 20`,
      readQboCredential(sql),
    ]);
    return sendJson(res, 200, {
      history,
      report: history[0] ? await getBusinessReport(sql, history[0].id) : null,
      connections: { shopify_configured: SERVICES.shopify.configured(), qbo_app_configured: Boolean(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET && process.env.QBO_TOKEN_ENCRYPTION_KEY), qbo_status: credential?.status || 'not_connected', qbo_environment: credential?.environment || null },
    });
  } catch (error) {
    const message = /^(Choose |This BI report)/.test(error.message) ? error.message : 'Unable to complete the BI request. Try again or check the connections.';
    return sendJson(res, 400, { error: message });
  }
}
