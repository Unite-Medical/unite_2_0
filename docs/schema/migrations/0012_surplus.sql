-- PRD-10 — Hospital surplus inventory network.

CREATE TABLE IF NOT EXISTS surplus_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     TEXT REFERENCES organizations(id),  -- nullable for first-contact
  contact_email   TEXT NOT NULL,
  contact_name    TEXT,
  contact_phone   TEXT,
  hospital_name   TEXT,
  pickup_location TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'new',     -- new | reviewing | offer_sent | accepted | declined | received
  total_lines     INT DEFAULT 0,
  estimated_value NUMERIC(12,2) DEFAULT 0,
  offer_total     NUMERIC(12,2),
  offer_sent_at   TIMESTAMPTZ,
  accepted_at     TIMESTAMPTZ,
  received_at     TIMESTAMPTZ,
  hubspot_deal_id TEXT,
  notes           TEXT,
  attachment_url  TEXT
);

CREATE INDEX IF NOT EXISTS idx_surplus_status ON surplus_submissions (status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS surplus_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id       UUID REFERENCES surplus_submissions(id) ON DELETE CASCADE,
  raw_description     TEXT NOT NULL,
  normalized_name     TEXT,
  category            TEXT,                         -- Orthotics | Diagnostics | PPE | Surgical | Supplements | Other
  matched_sku         TEXT REFERENCES products(sku),
  gtin                TEXT,
  qty                 INT NOT NULL,
  expiry_date         DATE,
  condition           TEXT,                         -- new_in_box | opened | expired | unknown
  est_retail_usd      NUMERIC(10,2),
  offer_usd_per_unit  NUMERIC(10,2),
  offer_usd_total     NUMERIC(12,2),
  decision            TEXT,                         -- want | pass
  decision_reason     TEXT,
  confidence          NUMERIC(3,2)
);

CREATE INDEX IF NOT EXISTS idx_surplus_lines_submission ON surplus_lines (submission_id);
