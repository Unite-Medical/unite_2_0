/**
 * POST /api/wms/movement — server-authoritative ledger post (PRD-25 §4.3).
 * Body: { sku, warehouse_id, qty_delta, reason, ref_type?, ref_id?, lot_id?,
 *         unit_cost?, actor_id?, idempotency_key?, note? }
 */
import { handleWmsRoute, postMovement } from '../_lib/wms.js';

export default function handler(req, res) {
  return handleWmsRoute(req, res, (sql, body) => postMovement(sql, body));
}
