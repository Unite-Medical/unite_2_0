-- PRD-01 — Orders, carts, shipments. Cross-cuts with PRD-02 (QBO),
-- PRD-03 (Flexport for inbound), PRD-04 (ShipStation for outbound).

CREATE TABLE IF NOT EXISTS carts (
  id              TEXT PRIMARY KEY,
  user_id         TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  org_id          TEXT REFERENCES organizations(id),
  status          TEXT NOT NULL DEFAULT 'active',  -- active | checking_out | ordered | abandoned
  subtotal        NUMERIC(12,2) DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id              TEXT PRIMARY KEY,
  cart_id         TEXT REFERENCES carts(id) ON DELETE CASCADE,
  product_sku     TEXT REFERENCES products(sku),
  variant_id      TEXT,
  qty             INT NOT NULL,
  unit_price      NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,                 -- UM-26-NNNNN
  org_id          TEXT REFERENCES organizations(id),
  user_id         TEXT REFERENCES profiles(id),
  segment         TEXT,
  status          TEXT NOT NULL,                    -- pending | processing | shipped | in_transit | delivered | cancelled
  placed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  subtotal        NUMERIC(12,2) NOT NULL,
  freight         NUMERIC(10,2) DEFAULT 0,
  tax             NUMERIC(10,2) DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL,
  payment_terms   TEXT,
  payment_status  TEXT,                             -- paid | invoiced | pending | refunded
  ship_from_warehouse TEXT REFERENCES warehouses(id),
  ship_to_address_id  TEXT REFERENCES addresses(id),
  tracking_number TEXT,
  carrier         TEXT,
  eta             TIMESTAMPTZ,
  qbo_invoice_id  TEXT,                             -- PRD-02 hook
  qbo_synced_at   TIMESTAMPTZ,
  hubspot_deal_id TEXT,                             -- PRD-06 hook
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_org_placed ON orders (org_id, placed_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id              TEXT PRIMARY KEY,
  order_id        TEXT REFERENCES orders(id) ON DELETE CASCADE,
  product_sku     TEXT REFERENCES products(sku),
  variant_id      TEXT,
  qty             INT NOT NULL,
  unit_price      NUMERIC(10,2) NOT NULL,
  ext             NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS shipments (
  id              TEXT PRIMARY KEY,
  order_id        TEXT REFERENCES orders(id) ON DELETE CASCADE,
  carrier         TEXT,
  tracking_number TEXT,
  status          TEXT,                             -- label_created | in_transit | delivered | exception
  weight_lbs      NUMERIC(7,2),
  cartons         INT,
  shipstation_label_id TEXT,                        -- PRD-04 hook
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipment_items (
  id              TEXT PRIMARY KEY,
  shipment_id     TEXT REFERENCES shipments(id) ON DELETE CASCADE,
  order_item_id   TEXT REFERENCES order_items(id),
  qty             INT NOT NULL
);
