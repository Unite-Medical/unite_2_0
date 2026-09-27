-- 0024_owner_aware_wms.sql
-- Fold mapped distributor consignment stock into the active WMS ledger.
-- IMPORTANT: blueprint only. Validate exception rows and counts before applying.

-- Every active WMS stock entity carries the same owner identity.
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS owner_type TEXT NOT NULL DEFAULT 'unite';
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS owner_org_id TEXT REFERENCES organizations(id);
ALTER TABLE lots ADD COLUMN IF NOT EXISTS owner_type TEXT NOT NULL DEFAULT 'unite';
ALTER TABLE lots ADD COLUMN IF NOT EXISTS owner_org_id TEXT REFERENCES organizations(id);
ALTER TABLE lots ADD COLUMN IF NOT EXISTS legacy_inventory_lot_id TEXT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS owner_type TEXT NOT NULL DEFAULT 'unite';
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS owner_org_id TEXT REFERENCES organizations(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS owner_type TEXT NOT NULL DEFAULT 'unite';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS owner_org_id TEXT REFERENCES organizations(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS inventory_id TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS inventory_lot_id BIGINT REFERENCES lots(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS distributor_sku TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS distributor_flow TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS settlement_eligible BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS ledger_migrated_at TIMESTAMPTZ;
ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS legacy_read_only BOOLEAN NOT NULL DEFAULT FALSE;

-- Owner consistency. Existing Unite rows satisfy these checks through defaults.
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_owner_consistency;
ALTER TABLE inventory ADD CONSTRAINT inventory_owner_consistency CHECK (
  (owner_type='unite' AND owner_org_id IS NULL)
  OR (owner_type='distributor' AND owner_org_id IS NOT NULL)
);
ALTER TABLE lots DROP CONSTRAINT IF EXISTS lots_owner_consistency;
ALTER TABLE lots ADD CONSTRAINT lots_owner_consistency CHECK (
  (owner_type='unite' AND owner_org_id IS NULL)
  OR (owner_type='distributor' AND owner_org_id IS NOT NULL)
);
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_owner_consistency;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_owner_consistency CHECK (
  (owner_type='unite' AND owner_org_id IS NULL)
  OR (owner_type='distributor' AND owner_org_id IS NOT NULL)
);
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_owner_consistency;
ALTER TABLE reservations ADD CONSTRAINT reservations_owner_consistency CHECK (
  (owner_type='unite' AND owner_org_id IS NULL)
  OR (owner_type='distributor' AND owner_org_id IS NOT NULL)
);

-- Replace ownerless uniqueness with owner-aware pool identity.
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_product_sku_warehouse_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_owner_pool
  ON inventory (product_sku, warehouse_id, owner_type, COALESCE(owner_org_id, ''));
ALTER TABLE lots DROP CONSTRAINT IF EXISTS lots_product_sku_lot_number_warehouse_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lots_owner_pool
  ON lots (product_sku, lot_number, COALESCE(expiration_date, DATE '9999-12-31'), warehouse_id, owner_type, COALESCE(owner_org_id, ''));
CREATE UNIQUE INDEX IF NOT EXISTS uq_lots_legacy_inventory_lot
  ON lots (legacy_inventory_lot_id) WHERE legacy_inventory_lot_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reservations_idempotency
  ON reservations (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_owner_availability
  ON inventory (owner_type, owner_org_id, product_sku, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_lots_owner_fefo
  ON lots (owner_type, owner_org_id, product_sku, warehouse_id, expiration_date);
CREATE INDEX IF NOT EXISTS idx_movements_owner
  ON stock_movements (owner_type, owner_org_id, product_sku, warehouse_id);

-- Warehouse-only owner SKUs without a mapped Unite SKU cannot enter the active
-- product-keyed ledger. Quarantine them for explicit mapping rather than merging
-- or silently dropping them.
CREATE TABLE IF NOT EXISTS consignment_migration_exceptions (
  inventory_lot_id TEXT PRIMARY KEY REFERENCES inventory_lots(id),
  owner_org_id TEXT NOT NULL REFERENCES organizations(id),
  distributor_sku TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'needs_mapping',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);
INSERT INTO consignment_migration_exceptions (inventory_lot_id, owner_org_id, distributor_sku, reason)
SELECT il.id, il.owner_org_id, il.distributor_sku, 'mapped_unite_sku_required'
FROM inventory_lots il
WHERE il.owner_type='distributor' AND il.owner_org_id IS NOT NULL AND il.product_sku IS NULL
ON CONFLICT (inventory_lot_id) DO NOTHING;

-- Backfill mapped owner lots into active FEFO lots. Existing legacy IDs provide
-- deterministic replay and reconciliation.
INSERT INTO lots (
  product_sku, lot_number, expiration_date, warehouse_id, qty_received,
  qty_remaining, received_at, owner_type, owner_org_id, legacy_inventory_lot_id
)
SELECT
  il.product_sku,
  COALESCE(NULLIF(il.lot_number,''), 'N/A'),
  il.expiration_date,
  il.warehouse_id,
  il.qty_on_hand,
  il.qty_on_hand,
  il.created_at,
  'distributor',
  il.owner_org_id,
  il.id
FROM inventory_lots il
WHERE il.owner_type='distributor'
  AND il.owner_org_id IS NOT NULL
  AND il.product_sku IS NOT NULL
  AND il.warehouse_id IS NOT NULL
ON CONFLICT (legacy_inventory_lot_id) DO NOTHING;

-- Backfill owner projections. IDs are deterministic and cannot collide with
-- legacy Unite inventory IDs.
INSERT INTO inventory (
  id, product_sku, warehouse_id, on_hand, reserved, owner_type, owner_org_id
)
SELECT
  'owner:' || il.owner_org_id || ':' || il.product_sku || ':' || il.warehouse_id,
  il.product_sku,
  il.warehouse_id,
  SUM(il.qty_on_hand),
  SUM(il.qty_reserved),
  'distributor',
  il.owner_org_id
FROM inventory_lots il
WHERE il.owner_type='distributor'
  AND il.owner_org_id IS NOT NULL
  AND il.product_sku IS NOT NULL
  AND il.warehouse_id IS NOT NULL
GROUP BY il.owner_org_id, il.product_sku, il.warehouse_id
ON CONFLICT (product_sku, warehouse_id, owner_type, (COALESCE(owner_org_id, '')))
DO UPDATE SET on_hand=EXCLUDED.on_hand, reserved=EXCLUDED.reserved;

-- Opening movements make the backfilled balance auditable. Reserved is a
-- reservation projection and is intentionally not added to qty_delta.
INSERT INTO stock_movements (
  product_sku, warehouse_id, lot_id, qty_delta, reason, ref_type, ref_id,
  actor_id, idempotency_key, note, owner_type, owner_org_id
)
SELECT
  lot.product_sku,
  lot.warehouse_id,
  lot.id,
  lot.qty_remaining,
  'opening_count',
  'consignment_migration',
  lot.legacy_inventory_lot_id,
  'migration:0024',
  'consignment-opening:' || lot.legacy_inventory_lot_id,
  'Mapped distributor opening balance from legacy inventory_lots',
  'distributor',
  lot.owner_org_id
FROM lots lot
WHERE lot.owner_type='distributor' AND lot.legacy_inventory_lot_id IS NOT NULL
ON CONFLICT (idempotency_key) DO NOTHING;

-- Mark only successfully mapped rows read-only. Runtime compatibility reads may
-- continue during rollout, but new quantity mutation must use the active ledger.
UPDATE inventory_lots il
SET ledger_migrated_at=NOW(), legacy_read_only=TRUE
WHERE EXISTS (SELECT 1 FROM lots lot WHERE lot.legacy_inventory_lot_id=il.id);

-- Consignment movements distinguish owner fulfillment from Unite sell-through.
ALTER TABLE consignment_movements DROP CONSTRAINT IF EXISTS consignment_movements_movement_check;
ALTER TABLE consignment_movements ADD CONSTRAINT consignment_movements_movement_check
  CHECK (movement IN ('sold_by_unite','fulfilled_for_owner','shipped_for_distributor','adjust'));
ALTER TABLE consignment_movements ADD COLUMN IF NOT EXISTS settlement_eligible BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE consignment_movements ADD COLUMN IF NOT EXISTS agreement_id TEXT;
ALTER TABLE consignment_movements ADD COLUMN IF NOT EXISTS settlement_currency TEXT;
ALTER TABLE consignment_movements ADD COLUMN IF NOT EXISTS handoff_reference TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_consignment_handoff_movement
  ON consignment_movements (owner_org_id, inventory_lot_id, handoff_reference)
  WHERE handoff_reference IS NOT NULL;

-- Settlement payment evidence is distinct from receipt evidence.
CREATE TABLE IF NOT EXISTS settlement_payments (
  id TEXT PRIMARY KEY,
  settlement_po_id TEXT NOT NULL REFERENCES purchase_orders(id),
  provider TEXT NOT NULL CHECK (provider IN ('qbo','off_platform')),
  payment_reference TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  recorded_by TEXT NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, payment_reference)
);
