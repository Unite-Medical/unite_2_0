-- 0018: Stripe Connect rep payouts + interim JSONB row-store.
-- Brief §2 #5 (payout rail) + the durable-persistence bridge.
-- Mirrors localStorage SCHEMA_VERSION 11 (src/lib/db.js).

-- Materialized payout ledger — one row per Stripe Connect transfer.
-- The connected account id is also denormalized onto reps.
ALTER TABLE reps ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;

CREATE TABLE IF NOT EXISTS rep_payouts (
  id                 TEXT PRIMARY KEY,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  rep_id             TEXT NOT NULL REFERENCES reps(id),
  rep_name           TEXT,
  stripe_account_id  TEXT NOT NULL,
  stripe_transfer_id TEXT NOT NULL UNIQUE,
  amount_usd         NUMERIC(12,2) NOT NULL,
  gross_usd          NUMERIC(12,2),
  order_count        INTEGER,
  window_days        INTEGER NOT NULL DEFAULT 30,
  status             TEXT NOT NULL DEFAULT 'paid',  -- paid | simulated | reversed
  paid_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rep_payouts_rep
  ON rep_payouts (rep_id, paid_at DESC);

-- Interim durable persistence: the SPA's runtime rows, mirrored as-is
-- through /api/db/sync (see api/db/sync.js). The endpoint creates this
-- table on first use too; declared here so the blueprint is complete.
CREATE TABLE IF NOT EXISTS um_rows (
  tbl        TEXT NOT NULL,
  id         TEXT NOT NULL,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted    BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (tbl, id)
);

CREATE INDEX IF NOT EXISTS idx_um_rows_updated
  ON um_rows (updated_at DESC);
