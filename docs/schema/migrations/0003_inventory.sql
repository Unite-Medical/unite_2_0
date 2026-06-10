-- PRD-04 — Inventory + lot tracking. Mirror of Cin7 with our enrichment.
-- See docs/schema/lot_tracking.sql for the standalone lot DDL (kept
-- there for reference; this file is the canonical migration).

CREATE TABLE IF NOT EXISTS warehouses (
  id              TEXT PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  country         TEXT NOT NULL DEFAULT 'US',
  utilization     NUMERIC(3,2) DEFAULT 0,
  capacity_units  INT,
  lat             NUMERIC(8,4),
  lng             NUMERIC(9,4),
  cin7_location_id TEXT,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  id              TEXT PRIMARY KEY,
  product_sku     TEXT REFERENCES products(sku) ON DELETE CASCADE,
  warehouse_id    TEXT REFERENCES warehouses(id) ON DELETE CASCADE,
  on_hand         INT NOT NULL DEFAULT 0,
  reserved        INT NOT NULL DEFAULT 0,
  reorder_at      INT,
  reorder_qty     INT,
  last_synced_at  TIMESTAMPTZ,
  UNIQUE (product_sku, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON inventory (warehouse_id, product_sku) WHERE on_hand <= reorder_at;

CREATE TABLE IF NOT EXISTS lot_tracking (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_sku           TEXT REFERENCES products(sku),
  lot_number            TEXT NOT NULL,
  expiration_date       DATE,
  qty                   INT NOT NULL,
  warehouse_id          TEXT REFERENCES warehouses(id),
  received_at           TIMESTAMPTZ,
  received_from_shipment TEXT,
  scanned_by            TEXT,                      -- profile.id at receive
  order_id              TEXT,                      -- when shipped to a customer
  customer_id           TEXT,
  shipped_at            TIMESTAMPTZ,
  shipped_by            TEXT
);

CREATE INDEX IF NOT EXISTS idx_lot_tracking_lot ON lot_tracking (lot_number);
CREATE INDEX IF NOT EXISTS idx_lot_tracking_product_lot ON lot_tracking (product_sku, lot_number);
CREATE INDEX IF NOT EXISTS idx_lot_tracking_customer ON lot_tracking (customer_id);
