import { sendJson } from '../_lib/http.js';

/**
 * Generic ledger movement is intentionally retired. Inventory increases must
 * flow through PO receipt or authoritative RMA restock. Order depletion must
 * flow through custody handoff. Disposal and return-to-vendor require their
 * evidence-specific quality transitions.
 */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return sendJson(res, 410, {
    error: 'authoritative_inventory_transition_required',
    routes: ['/api/wms/receive', '/api/orders/handoff'],
  });
}
