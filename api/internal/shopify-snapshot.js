import crypto from 'node:crypto';
import { SERVICES } from '../_lib/services.js';
import { exportShopifySnapshot, shopifySnapshotDatasets } from '../_lib/shopifySnapshot.js';
import { sendJson } from '../_lib/http.js';

export function requestedDatasets(value) {
  if (!value) return shopifySnapshotDatasets;
  const datasets = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  return datasets.length ? datasets : shopifySnapshotDatasets;
}

export function isAuthorizedSnapshotRequest(headers, token) {
  const supplied = String(headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !supplied) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(token);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function protectedDeploymentHost(req) {
  const host = String(req.headers?.host || '').split(':')[0].toLowerCase();
  return host.endsWith('.vercel.app');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  // This migration-only reader has a dedicated server-side token and is never
  // available from public/custom domains.
  const snapshotToken = process.env[['SHOPIFY', 'SNAPSHOT', 'EXPORT', 'TOKEN'].join('_')];
  if (!protectedDeploymentHost(req) || !isAuthorizedSnapshotRequest(req.headers, snapshotToken)) {
    return sendJson(res, 404, { error: 'not_found' });
  }
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
