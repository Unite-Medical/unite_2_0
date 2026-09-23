import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { sendJson, logEvent } from '../_lib/http.js';
import { qboAccessContext } from '../_lib/qboTokens.js';

export function publicQboCompanyInfo(info = {}) {
  return {
    company_name: info.CompanyName || null,
    legal_name: info.LegalName || null,
    country: info.Country || null,
    email: info.Email?.Address || null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'read_only_endpoint' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const live = await authorizeLiveRequest(req, sql, { roles: ['admin'] });
    if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    const context = await qboAccessContext(sql);
    const root = context.environment === 'production'
      ? 'https://quickbooks.api.intuit.com/v3'
      : 'https://sandbox-quickbooks.api.intuit.com/v3';
    const url = new URL(`${root}/company/${encodeURIComponent(context.realmId)}/companyinfo/${encodeURIComponent(context.realmId)}`);
    url.searchParams.set('minorversion', '75');
    const upstream = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${context.accessToken}`, Accept: 'application/json' },
    });
    if (!upstream.ok) {
      logEvent('qbo.company_info', 'failed', { status: upstream.status, actor_id: live.session.user_id });
      return sendJson(res, 502, { error: 'qbo_company_info_failed', status: upstream.status });
    }
    const payload = await upstream.json();
    const company = publicQboCompanyInfo(payload?.CompanyInfo || {});
    logEvent('qbo.company_info', 'read', { actor_id: live.session.user_id, environment: context.environment });
    return sendJson(res, 200, { ok: true, environment: context.environment, company });
  } catch (error) {
    return sendJson(res, 502, { error: error.message === 'qbo_reauthorization_required' ? error.message : 'qbo_company_info_unavailable' });
  }
}
