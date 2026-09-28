import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { sendJson } from '../_lib/http.js';
import { evidenceParameters, readEvidencePage } from '../_lib/inventoryEvidence.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  try {
    const sql = neon(process.env.DATABASE_URL);
    const auth = await authorizeLiveRequest(req, sql, { roles: ['admin'] });
    if (!auth.ok) return sendJson(res, auth.reason === 'authentication_required' ? 401 : 403, { error: auth.reason });
    const input = evidenceParameters(new URL(req.url, 'https://local').searchParams);
    return sendJson(res, 200, await readEvidencePage(sql, input));
  } catch (error) {
    const safe = /^[a-z0-9_]+$/.test(error.message) ? error.message : 'inventory_evidence_failed';
    return sendJson(res, safe === 'source_rate_limited' ? 429 : 400, { error: safe, ...(error.details ? { details: error.details } : {}) });
  }
}
