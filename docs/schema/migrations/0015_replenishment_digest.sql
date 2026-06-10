-- 0015: replenishment POs, CEO digests, trade-data discovery mirrors.
-- PRD-12 (run-rate model), PRD-05 Phase 5 (morning brief), brief §7.

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                TEXT PRIMARY KEY,
  vendor_name       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | confirmed | received | cancelled
  created_by        TEXT,                            -- 'run-rate-model' | user id
  line_items        JSONB NOT NULL DEFAULT '[]',     -- [{sku, name, qty, cost}]
  total_cost        NUMERIC(12,2),
  wms_po_id         TEXT,                            -- Cin7 purchase ID once pushed
  expected_delivery TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders (status);

CREATE TABLE IF NOT EXISTS daily_digests (
  id            TEXT PRIMARY KEY,
  date          DATE NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by  TEXT NOT NULL DEFAULT 'heuristic',   -- heuristic | claude
  source        TEXT NOT NULL DEFAULT 'cron',        -- cron | manual
  bullets       JSONB NOT NULL DEFAULT '[]',
  signal_counts JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_daily_digests_date ON daily_digests (date DESC);

CREATE TABLE IF NOT EXISTS trade_records (
  id                 TEXT PRIMARY KEY,
  role               TEXT NOT NULL,                  -- shipper | consignee
  company            TEXT NOT NULL,
  country            TEXT,
  port               TEXT,
  hs_code            TEXT,
  product_keyword    TEXT,
  shipments_12mo     INTEGER,
  teu_12mo           NUMERIC(8,1),
  est_annual_usd     NUMERIC(14,2),
  last_shipment      TIMESTAMPTZ,
  sample_description TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_records_company ON trade_records (company);
