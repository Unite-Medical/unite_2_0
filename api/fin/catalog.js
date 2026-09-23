import { readFile } from 'node:fs/promises';
import { searchFinCatalog } from '../_lib/fin.js';
import { sendJson } from '../_lib/http.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (process.env.UNITE_ENVIRONMENT !== 'staging') return sendJson(res, 404, { error: 'not_available' });
  const q = new URL(req.url, 'https://staging.unitemedical.net').searchParams.get('query') || '';
  if (q.trim().length < 2 || q.length > 120) return sendJson(res, 400, { error: 'query_must_be_2_to_120_characters' });
  try {
    const catalog = JSON.parse(await readFile(new URL('../../src/data/shopifyLaunchCatalog.generated.json', import.meta.url), 'utf8'));
    return sendJson(res, 200, { environment: 'staging', source: 'approved_launch_catalog_snapshot', freshness: 'snapshot_not_live_inventory', checked_at: new Date().toISOString(), products: searchFinCatalog(catalog.products, q) });
  } catch { return sendJson(res, 503, { error: 'catalog_temporarily_unavailable' }); }
}
