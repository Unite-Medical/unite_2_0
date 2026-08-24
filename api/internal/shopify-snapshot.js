import { SERVICES } from '../_lib/services.js';
import { exportShopifySnapshot, shopifySnapshotDatasets } from '../_lib/shopifySnapshot.js';
import { sendJson } from '../_lib/http.js';

export function requestedDatasets(value) {
  if (!value) return shopifySnapshotDatasets;
  const datasets = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  return datasets.length ? datasets : shopifySnapshotDatasets;
}

function protectedDeploymentHost(req) {
  const host = String(req.headers?.host || '').split(':')[0].toLowerCase();
  return host.endsWith('.vercel.app');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  // This migration-only reader is available solely through Vercel's protected
  // deployment hostname. It is not reachable from public/custom domains.
  if (!protectedDeploymentHost(req)) return sendJson(res, 404, { error: 'not_found' });
  const service = SERVICES.shopify;
  if (!service.configured()) return sendJson(res, 503, { error: 'shopify_not_configured' });
  try {
    const endpoint = service.buildUrl(`/admin/api/${process.env.SHOPIFY_API_VERSION || '2026-04'}/graphql.json`, {});
    const headers = await service.headers();
    const snapshot = await exportShopifySnapshot({ endpoint, token: headers['X-Shopify-Access-Token'], datasets: requestedDatasets(req.query?.datasets) });
    return sendJson(res, 200, { ok: true, read_only: true, snapshot });
  } catch (error) {
    return sendJson(res, 502, { error: 'shopify_snapshot_failed', detail: error.message });
  }
}
