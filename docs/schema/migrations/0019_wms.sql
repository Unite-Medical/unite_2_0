-- PRD-25 — UniteWMS Phase 0: the stock-movement ledger + supporting tables.
--
-- This is the relational-tier blueprint (applied by scripts/migrate.mjs to
-- Neon). At runtime the SPA persists the same logical rows through the JSONB
-- row-store (api/db/sync, um_rows) where the product key is `sku`; here, in
-- line with 0003_inventory.sql, the relational column is `product_sku`.
--
-- Architectural rule (PRD §4.1): on_hand is a PROJECTION of this ledger.
-- `stock_movements` is APPEND-ONLY and is written ONLY by src/lib/wms/ledger.js.
-- inventory.on_hand is updated in the SAME transaction as the movement.

-- 5.3 Bins / locations (created first: stock_movements + lots reference it) -
CREATE TABLE IF NOT EXISTS bins (
  id            TEXT PRIMARY KEY,             -- e.g. ATL-A12-3
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id),
  zone          TEXT,
  aisle         TEXT,
  shelf         TEXT,
  position      TEXT,
  pickable      BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_bins_warehouse ON bins (warehouse_id);

-- 5.4 Lots (receive-time lots; FEFO source) -------------------------------
CREATE TABLE IF NOT EXISTS lots (
  id                     BIGSERIAL PRIMARY KEY,
  product_sku            TEXT NOT NULL REFERENCES products(sku),
  lot_number             TEXT NOT NULL,
  expiration_date        DATE,
  warehouse_id           TEXT NOT NULL REFERENCES warehouses(id),
  bin_id                 TEXT REFERENCES bins(id),
  qty_received           INT NOT NULL,
  qty_remaining          INT NOT NULL,                -- decremented FEFO at ship
  unit_cost              NUMERIC(12,4),
  received_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_from_shipment TEXT,
  received_by            TEXT,
  UNIQUE (product_sku, lot_number, warehouse_id)
);
CREATE INDEX IF NOT EXISTS idx_lots_lot  ON lots (lot_number);
CREATE INDEX IF NOT EXISTS idx_lots_fefo ON lots (product_sku, warehouse_id, expiration_date);

-- 5.1 The ledger — append-only, the source of truth -----------------------
CREATE TABLE IF NOT EXISTS stock_movements (
  id              BIGSERIAL PRIMARY KEY,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  product_sku     TEXT NOT NULL REFERENCES products(sku),
  warehouse_id    TEXT NOT NULL REFERENCES warehouses(id),
  bin_id          TEXT REFERENCES bins(id),
  lot_id          BIGINT REFERENCES lots(id),
  qty_delta       INT  NOT NULL,                 -- signed: +receipt / -ship
  reason          TEXT NOT NULL,                 -- receipt|ship|adjust_damage|
                                                 -- adjust_loss|found|transfer_out|
                                                 -- transfer_in|count_variance|
                                                 -- reservation_commit|return_restock|
                                                 -- opening_count
  ref_type        TEXT,                          -- purchase_order|order|transfer|count|manual
  ref_id          TEXT,
  unit_cost       NUMERIC(12,4),                 -- landed cost at receipt (FIFO/FEFO)
  actor_id        TEXT,                          -- profile.id / station id
  idempotency_key TEXT,                          -- a repeated key is a no-op (PRD §11)
  note            TEXT
);
CREATE INDEX IF NOT EXISTS idx_mov_sku_wh ON stock_movements (product_sku, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_mov_ref    ON stock_movements (ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_mov_lot    ON stock_movements (lot_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mov_idem ON stock_movements (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 5.2 Inventory projection (kept current from the ledger) ------------------
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS bin_id TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS in_transit INT NOT NULL DEFAULT 0;
-- on_hand + reserved already exist; available = on_hand - reserved (view below)

CREATE OR REPLACE VIEW v_availability AS
  SELECT product_sku, warehouse_id,
         SUM(on_hand)  AS on_hand,
         SUM(reserved) AS reserved,
         SUM(on_hand) - SUM(reserved) AS available
  FROM inventory GROUP BY product_sku, warehouse_id;

-- 5.5 Purchase orders (evolve existing) -----------------------------------
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
  -- draft -> approved -> sent -> partial -> received -> closed -> cancelled
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

-- 5.6 Reservations --------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  id            BIGSERIAL PRIMARY KEY,
  order_id      TEXT NOT NULL,
  product_sku   TEXT NOT NULL REFERENCES products(sku),
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id),
  qty           INT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'held',  -- held -> committed -> released
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_resv_order ON reservations (order_id);

-- 5.7 Counts & transfers --------------------------------------------------
CREATE TABLE IF NOT EXISTS count_sessions (
  id            TEXT PRIMARY KEY,
  warehouse_id  TEXT,
  status        TEXT DEFAULT 'open',
  started_by    TEXT,
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  closed_at     TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS count_lines (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT REFERENCES count_sessions(id),
  product_sku TEXT,
  bin_id      TEXT,
  system_qty  INT,
  counted_qty INT,
  variance    INT
);
CREATE TABLE IF NOT EXISTS transfers (
  id          TEXT PRIMARY KEY,
  from_wh     TEXT,
  to_wh       TEXT,
  status      TEXT DEFAULT 'draft',            -- draft -> in_transit -> received
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  shipped_at  TIMESTAMPTZ,
  received_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS transfer_lines (
  id          BIGSERIAL PRIMARY KEY,
  transfer_id TEXT REFERENCES transfers(id),
  product_sku TEXT,
  qty         INT,
  lot_id      BIGINT
);
