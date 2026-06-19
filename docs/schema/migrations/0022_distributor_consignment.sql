-- 0022_distributor_consignment.sql — PRD-27 Distributor / 3PL Consignment
--
-- Reconciliation note (PRD-25 UniteWMS): the preferred implementation is to
-- extend the WMS ledger (stock_movements + lots) with owner_type/owner_org_id
-- rather than create a parallel store. The tables below capture the REQUIRED
-- fields; the client implementation in src/lib/consignment.js layers an owner
-- dimension over the existing inventory/lots surface.

-- Owner-tagged, lot-level inventory.
CREATE TABLE IF NOT EXISTS inventory_lots (
  id                  TEXT PRIMARY KEY,
  owner_type          TEXT NOT NULL DEFAULT 'unite' CHECK (owner_type IN ('unite','distributor')),
  owner_org_id        TEXT REFERENCES organizations(id),       -- null when owner_type='unite'
  product_sku         TEXT REFERENCES products(sku),           -- Unite SKU when applicable
  distributor_sku     TEXT,                                    -- distributor's own part # (warehouse-only items)
  lot_number          TEXT,
  expiration_date     DATE,
  qty_on_hand         INT NOT NULL DEFAULT 0,
  qty_reserved        INT NOT NULL DEFAULT 0,
  warehouse_id        TEXT REFERENCES warehouses(id),
  bin_location        TEXT,
  attributes          JSONB,                                   -- arbitrary per-product key details
  received_via_scan_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invlots_owner ON inventory_lots (owner_type, owner_org_id, product_sku);
CREATE INDEX IF NOT EXISTS idx_invlots_expiry ON inventory_lots (expiration_date) WHERE qty_on_hand > 0;

-- Distributor product listing: visibility + whether Unite may sell it.
CREATE TABLE IF NOT EXISTS distributor_products (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  distributor_sku     TEXT NOT NULL,
  name                TEXT NOT NULL,
  mapped_unite_sku    TEXT REFERENCES products(sku),
  visibility          TEXT NOT NULL DEFAULT 'warehouse_only'
                        CHECK (visibility IN ('storefront','warehouse_only')),
  unite_sellable      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_org_id, distributor_sku)
);

-- Scan events — provenance for receive + pick (zero-manual-entry proof).
CREATE TABLE IF NOT EXISTS scan_events (
  id                  TEXT PRIMARY KEY,
  kind                TEXT NOT NULL CHECK (kind IN ('receive','pick','adjust')),
  inventory_lot_id    TEXT REFERENCES inventory_lots(id),
  order_id            TEXT REFERENCES orders(id),
  raw_barcode         TEXT,
  parsed              JSONB,                                   -- { gtin, lot, expiration } from GS1 AIs
  capture_method      TEXT CHECK (capture_method IN ('gs1_scan','unite_barcode','photo_ocr','manual')),
  photo_url           TEXT,
  scanned_by          TEXT,
  station             TEXT,
  scanned_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scan_lot ON scan_events (inventory_lot_id);

-- Sell-through movements for consignment settlement.
CREATE TABLE IF NOT EXISTS consignment_movements (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id),
  inventory_lot_id    TEXT REFERENCES inventory_lots(id),
  order_id            TEXT REFERENCES orders(id),
  qty                 INT NOT NULL,
  unit_cost           NUMERIC(10,2),
  movement            TEXT NOT NULL CHECK (movement IN ('sold_by_unite','shipped_for_distributor','adjust')),
  settled             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Distributor ship-from identities (blind / white-label).
CREATE TABLE IF NOT EXISTS distributor_ship_identities (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brand_name          TEXT NOT NULL,
  return_address      JSONB NOT NULL,
  logo_url            TEXT,
  is_default          BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Distributor-supplied paperwork that must ship with their orders.
CREATE TABLE IF NOT EXISTS distributor_documents (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  doc_type            TEXT NOT NULL CHECK (doc_type IN ('packing_slip_template','insert','coa','ifu','other')),
  name                TEXT NOT NULL,
  file_url            TEXT NOT NULL,
  include_on_every_order BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Distributor carrier accounts for third-party billing.
CREATE TABLE IF NOT EXISTS distributor_carrier_accounts (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  carrier             TEXT NOT NULL,                           -- fedex | ups | usps | dhl
  account_number      TEXT NOT NULL,
  billing_zip         TEXT NOT NULL,
  is_default          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shipping markup config (global default + per-distributor override).
CREATE TABLE IF NOT EXISTS shipping_markup_config (
  id                  TEXT PRIMARY KEY,
  scope               TEXT NOT NULL CHECK (scope IN ('global','distributor')),
  owner_org_id        TEXT REFERENCES organizations(id),       -- null when scope='global'
  markup_pct          NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  updated_by          TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope, owner_org_id)
);

-- Customer-PO ingestion: uploaded source + parsed/learned mappings.
CREATE TABLE IF NOT EXISTS distributor_po_uploads (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_url            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'parsing'
                        CHECK (status IN ('parsing','needs_mapping','ready','ordered','failed')),
  parsed              JSONB,
  draft_order_id      TEXT REFERENCES orders(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS distributor_sku_map (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_sku        TEXT NOT NULL,
  resolved_sku        TEXT,
  resolved_kind       TEXT CHECK (resolved_kind IN ('unite','distributor')),
  UNIQUE (owner_org_id, external_sku)
);

-- Order additions for blind ship + ownership routing.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS on_behalf_of_org_id TEXT REFERENCES organizations(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS blind_ship BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_identity_id TEXT REFERENCES distributor_ship_identities(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_bill_to TEXT
  CHECK (shipping_bill_to IN ('unite_rate','third_party'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_account_id TEXT REFERENCES distributor_carrier_accounts(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_po_upload_id TEXT REFERENCES distributor_po_uploads(id);
