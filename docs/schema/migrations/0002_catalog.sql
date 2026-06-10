-- PRD-01 / PRD-04 — Catalog: categories, products, variants, pricing.
-- Source of truth for catalog metadata. Inventory lives separately
-- (0003_inventory.sql).

CREATE TABLE IF NOT EXISTS categories (
  slug            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  parent_slug     TEXT REFERENCES categories(slug),
  display_order   INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  sku             TEXT PRIMARY KEY,
  handle          TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  category_slug   TEXT REFERENCES categories(slug),
  tier            TEXT,
  pack_size       TEXT,
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,
  cogs            NUMERIC(10,2) DEFAULT 0,
  landed_cost     NUMERIC(10,2) DEFAULT 0,   -- updated by PRD-03 Phase 4
  hcpcs           TEXT,
  fda_product_code TEXT,
  hts_code        TEXT,
  gtin            TEXT,
  country_of_origin TEXT,
  vendor_id       TEXT,
  fda_registered  BOOLEAN DEFAULT FALSE,
  pdac_approved   BOOLEAN DEFAULT FALSE,
  taa_compliant   BOOLEAN DEFAULT FALSE,
  berry_compliant BOOLEAN DEFAULT FALSE,
  mspv_listed     BOOLEAN DEFAULT FALSE,
  latex_free      BOOLEAN DEFAULT FALSE,
  product_type    TEXT,
  bundle_components JSONB,                    -- [{sku, qty}] per PRD-04 Phase 6
  hero_image      TEXT,
  images          JSONB,                      -- [{src, alt}]
  tags            TEXT[],
  cin7_product_id TEXT,
  qbo_item_id     TEXT,
  shopify_product_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_slug);
CREATE INDEX IF NOT EXISTS idx_products_vendor ON products (vendor_id);
CREATE INDEX IF NOT EXISTS idx_products_gtin ON products (gtin);

CREATE TABLE IF NOT EXISTS product_variants (
  id              TEXT PRIMARY KEY,
  product_sku     TEXT REFERENCES products(sku) ON DELETE CASCADE,
  sku             TEXT,
  title           TEXT,
  price           NUMERIC(10,2),
  compare_at_price NUMERIC(10,2),
  options         JSONB,
  inventory_quantity INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pricing (
  id              TEXT PRIMARY KEY,
  product_sku     TEXT REFERENCES products(sku) ON DELETE CASCADE,
  tier            INT NOT NULL,
  min_qty         INT NOT NULL DEFAULT 1,
  unit_price      NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pricing_sku_tier ON pricing (product_sku, tier);
