import { sendJson } from '../_lib/http.js';

/**
 * Retired. Shipping inventory may move only through the authoritative custody
 * transaction in POST /api/orders/handoff or POST /api/distributor/pickup-action.
 */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return sendJson(res, 410, {
    error: 'direct_ship_retired',
    canonical_route: '/api/orders/handoff',
  });
}
