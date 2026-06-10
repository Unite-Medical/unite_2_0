-- PRD-08 — Quoting engine v2. Quotes link to vendors (PRD-07) +
-- products (catalog) + freight (PRD-03) once those PRDs are live.

CREATE TABLE IF NOT EXISTS quotes (
  id              TEXT PRIMARY KEY,                 -- Q-26-NNNNN
  vendor_id       TEXT,
  customer_org_id TEXT REFERENCES organizations(id),
  customer_name   TEXT,
  contact_name    TEXT,
  contact_email   TEXT,
  line_count      INT NOT NULL,
  total           NUMERIC(12,2) NOT NULL,
  margin_target   NUMERIC(4,3) NOT NULL,
  margin_tier     TEXT,                             -- A | B | C | distributor | gov
  freight_total   NUMERIC(10,2),
  freight_mode    TEXT,                             -- LCL | FCL | AIR | TRUCK
  freight_quote_id TEXT,
  cover_letter    TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',    -- draft | sent | accepted | countered | declined | expired
  eta             TIMESTAMPTZ,
  valid_until     TIMESTAMPTZ,
  acceptance_token TEXT UNIQUE,
  pdf_url         TEXT,
  hubspot_deal_id TEXT,
  qbo_invoice_id  TEXT,                             -- populated when accepted (PRD-02 hook)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes (customer_org_id);

CREATE TABLE IF NOT EXISTS quote_items (
  id              TEXT PRIMARY KEY,
  quote_id        TEXT REFERENCES quotes(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  fda_product_code TEXT,
  hts_code        TEXT,
  fda_validated   BOOLEAN DEFAULT FALSE,
  hts_validated   BOOLEAN DEFAULT FALSE,
  gtin            TEXT,
  gtin_validated  BOOLEAN DEFAULT FALSE,
  country_of_origin TEXT,
  fob             NUMERIC(10,2),
  duty_pct        NUMERIC(5,2),
  landed_per_unit NUMERIC(10,2),
  sell_per_unit   NUMERIC(10,2),
  target_qty      INT,
  moq             INT,
  ext_sell        NUMERIC(12,2),
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items (quote_id);
