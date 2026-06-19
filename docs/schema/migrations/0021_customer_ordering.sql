-- 0021_customer_ordering.sql — PRD-26 Customer Order Management
-- (0019 = UniteWMS/PRD-25; 0020 reserved by PRD-24 fulfillment; this is next.)

-- Per-customer contract pricing (highest precedence in the resolver).
CREATE TABLE IF NOT EXISTS customer_contract_prices (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_sku     TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  unit_price      NUMERIC(10,2) NOT NULL,
  min_qty         INT DEFAULT 1,            -- price applies at/above this qty (qty banding)
  effective_from  DATE,
  effective_to    DATE,
  created_by      TEXT,                     -- profile.id of the admin/rep who set it
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, product_sku, min_qty)
);
CREATE INDEX IF NOT EXISTS idx_contract_prices_org ON customer_contract_prices (org_id, product_sku);

-- Volume breaks (SKU-level, org-tier-independent ladder).
CREATE TABLE IF NOT EXISTS volume_breaks (
  id              TEXT PRIMARY KEY,
  product_sku     TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  min_qty         INT NOT NULL,
  unit_price      NUMERIC(10,2),            -- absolute price, OR
  discount_pct    NUMERIC(5,2),             -- percent off list (one of the two)
  UNIQUE (product_sku, min_qty)
);

-- Per-account allowlist of payment rails Unite pre-approved.
CREATE TABLE IF NOT EXISTS account_payment_methods (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  method          TEXT NOT NULL CHECK (method IN ('card','ach','wire','net15','net30','net60')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  stripe_pm_id    TEXT,                     -- saved card / ACH token, if any
  credit_limit    NUMERIC(12,2),            -- for net-terms methods
  approved_by     TEXT,                     -- profile.id of approving admin
  approved_at     TIMESTAMPTZ,
  UNIQUE (org_id, method)
);

-- Multi-recipient order notifications per account.
CREATE TABLE IF NOT EXISTS account_notification_recipients (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  events          TEXT[] NOT NULL DEFAULT '{order_placed,shipped,delivered,invoice,backorder}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, email)
);

-- Saved reorder lists (named SKU+qty sets a buyer reuses).
CREATE TABLE IF NOT EXISTS reorder_lists (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reorder_list_items (
  id              TEXT PRIMARY KEY,
  list_id         TEXT NOT NULL REFERENCES reorder_lists(id) ON DELETE CASCADE,
  product_sku     TEXT NOT NULL REFERENCES products(sku),
  qty             INT NOT NULL
);

-- Rep order-entry authority grants (extends PRD-14 team roles).
CREATE TABLE IF NOT EXISTS rep_order_grants (
  id                TEXT PRIMARY KEY,
  rep_id            TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  grant             TEXT NOT NULL CHECK (grant IN
                      ('place_order','price_override','discount','shipping_override',
                       'add_payment_method','place_on_terms','override_credit_hold','override_payment_gate')),
  max_discount_pct  NUMERIC(5,2),           -- bound for the 'discount' grant
  price_floor_pct   NUMERIC(5,2),           -- bound for 'price_override' (min margin)
  granted_by        TEXT,
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rep_id, grant)
);

-- Order provenance + reorder lineage (additive columns on orders).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT
  CHECK (order_source IN ('catalog','quick_order','reorder','quote_acceptance','rep_entry'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS placed_by_rep_id TEXT REFERENCES profiles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reordered_from TEXT REFERENCES orders(id);
