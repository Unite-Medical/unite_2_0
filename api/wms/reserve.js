import { sendJson } from '../_lib/http.js';

/**
 * Generic browser reservation was retired because SKU+warehouse reservation
 * cannot preserve lot, owner, expiry, quarantine, payment, or race invariants.
 * Paid customer orders use releasePaidOrder. Explicit consignment allocation
 * uses /api/orders/allocate-owner.
 */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return sendJson(res, 410, {
    error: 'authoritative_order_allocation_required',
    routes: ['/api/orders/place', '/api/orders/allocate-owner'],
  });
}
