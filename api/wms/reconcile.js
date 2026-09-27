import crypto from 'node:crypto';
import { handleWmsRoute } from '../_lib/wms.js';

function owner(row = {}) {
  const ownerType = row.inventory_owner_type || row.owner_type || 'unite';
  const ownerOrgId = row.inventory_owner_org_id || row.owner_org_id || null;
  return { owner_type: ownerType, owner_org_id: ownerType === 'distributor' ? ownerOrgId : null };
}
export function ownerInventoryKey(row = {}) {
  const sku = row.sku || row.product_sku;
  const warehouseId = row.warehouse_id;
  const identity = owner(row);
  if (!sku || !warehouseId || (identity.owner_type === 'distributor' && !identity.owner_org_id)) return null;
  return `${sku}|${warehouseId}|${identity.owner_type}|${identity.owner_org_id || ''}`;
}
function inventoryId(key) {
  return `inv_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

export default function handler(req, res) {
  return handleWmsRoute(req, res, async (sql) => {
    const movements = await sql`SELECT data FROM um_rows WHERE tbl='stock_movements' AND deleted=false`;
    const sums = new Map();
    for (const { data } of movements) {
      const key = ownerInventoryKey(data);
      if (!key) continue;
      sums.set(key, (sums.get(key) || 0) + (Number(data.qty_delta) || 0));
    }

    const invRows = await sql`SELECT data FROM um_rows WHERE tbl='inventory' AND deleted=false`;
    const pools = new Map();
    for (const { data } of invRows) {
      const key = ownerInventoryKey(data);
      if (!key) continue;
      const existing = pools.get(key) || [];
      existing.push(data);
      pools.set(key, existing);
    }

    const keys = new Set([...sums.keys(), ...pools.keys()]);
    const details = [];
    const conflicts = [];
    let repaired = 0;
    for (const key of keys) {
      const rows = pools.get(key) || [];
      if (rows.length > 1) {
        conflicts.push({ key, inventory_ids: rows.map((row) => row.id), reason: 'duplicate_owner_inventory_pool' });
        continue;
      }
      const [sku, warehouseId, ownerType, ownerOrgId] = key.split('|');
      const ledgerSum = sums.get(key) || 0;
      const row = rows[0];
      const projected = Number(row?.on_hand) || 0;
      if (projected === ledgerSum) continue;
      const id = row?.id || inventoryId(key);
      const next = {
        ...(row || { id, sku, warehouse_id: warehouseId, reserved: 0, reorder_at: 0, reorder_qty: 0 }),
        owner_type: ownerType,
        owner_org_id: ownerOrgId || null,
        inventory_owner_type: ownerType,
        inventory_owner_org_id: ownerOrgId || null,
        on_hand: ledgerSum,
        updated_at: new Date().toISOString(),
      };
      details.push({ sku, warehouse_id: warehouseId, owner_type: ownerType, owner_org_id: ownerOrgId || null, projected, ledger: ledgerSum, delta: ledgerSum - projected });
      await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        VALUES ('inventory',${id},${JSON.stringify(next)}::jsonb,false,now())
        ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()`;
      repaired += 1;
    }

    return {
      ok: conflicts.length === 0,
      checked: keys.size, drift: details.length, repaired,
      conflicts: conflicts.slice(0, 100), details: details.slice(0, 100),
    };
  }, { roles: ['admin'], allowSyncToken: true });
}
