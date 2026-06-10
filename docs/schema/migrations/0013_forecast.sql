-- PRD-12 — Demand forecasting (Prophet-based per-SKU model).

CREATE TABLE IF NOT EXISTS forecast_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'running', -- running | ok | partial | failed
  sku_count       INT,
  errors          JSONB
);

CREATE TABLE IF NOT EXISTS forecasts (
  product_sku     TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  forecast_run_id UUID REFERENCES forecast_runs(id),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  horizon_days    INT NOT NULL,                    -- 30 | 60 | 90
  forecast_units  INT NOT NULL,
  forecast_lower  INT NOT NULL,                    -- 80% PI lower
  forecast_upper  INT NOT NULL,                    -- 80% PI upper
  PRIMARY KEY (product_sku, generated_at, horizon_days)
);

CREATE INDEX IF NOT EXISTS idx_forecasts_sku ON forecasts (product_sku, generated_at DESC);

CREATE TABLE IF NOT EXISTS reorder_points (
  product_sku       TEXT PRIMARY KEY REFERENCES products(sku) ON DELETE CASCADE,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reorder_point     INT NOT NULL,
  safety_stock      INT NOT NULL,
  recommended_qty   INT NOT NULL,
  service_level     NUMERIC(3,2) DEFAULT 0.95,
  lead_time_days    INT,
  is_seasonal       BOOLEAN DEFAULT FALSE,
  model_metadata    JSONB
);

CREATE TABLE IF NOT EXISTS forecast_evals (
  product_sku     TEXT REFERENCES products(sku) ON DELETE CASCADE,
  eval_date       DATE NOT NULL,
  horizon_days    INT NOT NULL,
  predicted       INT,
  actual          INT,
  mape            NUMERIC(6,3),
  PRIMARY KEY (product_sku, eval_date, horizon_days)
);

CREATE INDEX IF NOT EXISTS idx_forecast_evals_date ON forecast_evals (eval_date DESC);
