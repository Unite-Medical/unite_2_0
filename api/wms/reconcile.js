/**
 * POST /api/wms/reconcile — nightly reconciliation (PRD-25 §11).
 *
 * Recomputes on_hand = SUM(stock_movements.qty_delta) per (sku, warehouse) from
 * the durable um_rows ledger and repairs any drift in the inventory projection
 * (the ledger is the source of truth). Returns a drift report. Intended to be
 * hit by a nightly scheduler (cron / Trigger.dev). Token-guarded.
 */
import { handleWmsRoute } from '../_lib/wms.js';

export default function handler(req, res) {
  return handleWmsRoute(req, res, async (sql) => {
    const movements = await sql`SELECT data FROM um_rows WHERE tbl='stock_movements' AND deleted=false`;
    const sums = new Map();
    for (const { data } of movements) {
      const s = data.sku || data.product_sku; const wh = data.warehouse_id;
      if (!s || !wh) continue;
      sums.set(`${s}|${wh}`, (sums.get(`${s}|${wh}`) || 0) + (Number(data.qty_delta) || 0));
    }

    const invRows = await sql`SELECT data FROM um_rows WHERE tbl='inventory' AND deleted=false`;
    const byKey = new Map();
    for (const { data } of invRows) byKey.set(`${data.sku}|${data.warehouse_id}`, data);

    const keys = new Set([...sums.keys(), ...byKey.keys()]);
    const details = [];
    let repaired = 0;
    for (const key of keys) {
      const [s, wh] = key.split('|');
      const ledgerSum = sums.get(key) || 0;
      const row = byKey.get(key);
      const projected = row ? (Number(row.on_hand) || 0) : 0;
      if (projected !== ledgerSum) {
        details.push({ sku: s, warehouse_id: wh, projected, ledger: ledgerSum, delta: ledgerSum - projected });
        const id = row?.id || `inv_${String(wh).replace(/^wh_/, '')}_${s}`;
        const next = { ...(row || { id, sku: s, warehouse_id: wh, reserved: 0, reorder_at: 0, reorder_qty: 0 }), on_hand: ledgerSum, updated_at: new Date().toISOString() };
        await sql`
          INSERT INTO um_rows (tbl, id, data, deleted, updated_at)
          VALUES ('inventory', ${id}, ${JSON.stringify(next)}::jsonb, false, now())
          ON CONFLICT (tbl, id) DO UPDATE SET data = EXCLUDED.data, deleted = false, updated_at = now()`;
        repaired += 1;
      }
    }

    return { ok: true, checked: keys.size, drift: details.length, repaired, details: details.slice(0, 100) };
  });
}
