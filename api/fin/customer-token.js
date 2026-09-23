import { neon } from '@neondatabase/serverless';
import { sessionFromRequest } from '../_lib/auth.js';
import { finCustomerContext, issueFinToken } from '../_lib/fin.js';
import { sendJson } from '../_lib/http.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (process.env.UNITE_ENVIRONMENT !== 'staging' || process.env.UNITE_FIN_CUSTOMER_ENABLED !== 'true') return sendJson(res, 404, { error: 'not_enabled' });
  if (req.headers.origin !== 'https://staging.unitemedical.net') return sendJson(res, 403, { error: 'forbidden' });
  const session = sessionFromRequest(req);
  if (!session || !['customer', 'distributor'].includes(session.role)) return sendJson(res, 401, { error: 'customer_sign_in_required' });
  try {
    const context = await finCustomerContext(neon(process.env.DATABASE_URL), session);
    if (!context) return sendJson(res, 403, { error: 'account_not_authorized' });
    return sendJson(res, 200, { token: issueFinToken(session, { secret: process.env.SESSION_SECRET }), expires_in: 900 });
  } catch { return sendJson(res, 503, { error: 'customer_verification_unavailable' }); }
}
