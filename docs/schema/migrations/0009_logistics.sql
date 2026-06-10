-- PRD-03 / PRD-04 — Logistics: Flexport shipments + ShipStation labels.

CREATE TABLE IF NOT EXISTS flexport_shipments (
  id                      TEXT PRIMARY KEY,
  flexport_shipment_id    TEXT UNIQUE NOT NULL,
  vendor_id               TEXT REFERENCES vendors(id),
  origin_port             TEXT,                     -- e.g. 'CNSHA'
  destination_port        TEXT,
  mode                    TEXT NOT NULL,            -- LCL | FCL | AIR | TRUCK
  status                  TEXT NOT NULL,            -- booked | departed | arrived | cleared | delivered | exception
  eta                     TIMESTAMPTZ,
  cbm                     NUMERIC(8,2),
  weight_kg               NUMERIC(10,2),
  freight_total_usd       NUMERIC(12,2),
  customs_total_usd       NUMERIC(12,2),
  landed_cost_per_sku     JSONB,                    -- {sku: usd_per_unit}
  qbo_bill_id             TEXT,                     -- PRD-02 hook
  cin7_receipt_id         TEXT,
  customer_facing         BOOLEAN DEFAULT FALSE,
  customer_org_id         TEXT REFERENCES organizations(id),
  raw_events              JSONB[],                  -- append-only
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flexport_status ON flexport_shipments (status);
CREATE INDEX IF NOT EXISTS idx_flexport_vendor ON flexport_shipments (vendor_id);

CREATE TABLE IF NOT EXISTS shipstation_labels (
  id                    TEXT PRIMARY KEY,
  shipstation_order_id  TEXT UNIQUE,
  order_id              TEXT REFERENCES orders(id),
  carrier               TEXT,
  service               TEXT,
  tracking_number       TEXT,
  label_url             TEXT,
  warehouse_id          TEXT REFERENCES warehouses(id),
  weight_lbs            NUMERIC(7,2),
  status                TEXT NOT NULL,             -- label_created | in_transit | delivered | exception
  cost                  NUMERIC(8,2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipstation_order ON shipstation_labels (order_id);
