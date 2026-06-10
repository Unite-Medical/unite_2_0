-- PRD-07 — Vendor approval automation: openFDA + GUDID + GS1 evidence,
-- vendor scoring, product compliance, continuous recall monitoring.

CREATE TABLE IF NOT EXISTS vendors (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  fei_number      TEXT,
  duns_number     TEXT,
  country         TEXT,                             -- ISO-2
  website         TEXT,
  contact_email   TEXT,
  contact_name    TEXT,
  business_age_years INT,
  insurance_on_file BOOLEAN DEFAULT FALSE,
  importgenius_annual_usd NUMERIC(14,2),
  device_classes  TEXT[],
  recall_count_24mo INT DEFAULT 0,
  approval_score  INT,
  approval_decision TEXT,                           -- AUTO_APPROVE | MANUAL_REVIEW | AUTO_REJECT
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | paused
  hubspot_company_id TEXT,
  last_audit      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors (status);
CREATE INDEX IF NOT EXISTS idx_vendors_country ON vendors (country);

CREATE TABLE IF NOT EXISTS vendor_evidence (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       TEXT REFERENCES vendors(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                    -- openfda_registration | openfda_recall | importgenius | gs1 | manual_note
  payload         JSONB NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_evidence_vendor ON vendor_evidence (vendor_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS product_compliance (
  product_sku           TEXT PRIMARY KEY REFERENCES products(sku) ON DELETE CASCADE,
  fda_product_code      TEXT,
  fda_device_class      TEXT,                       -- '1' | '2' | '3'
  hts_code              TEXT,
  gtin                  TEXT,
  gs1_verified_at       TIMESTAMPTZ,
  gudid_submitted_at    TIMESTAMPTZ,
  gudid_status          TEXT,                       -- pending | accepted | rejected
  country_of_origin     TEXT,
  recall_open_count     INT DEFAULT 0,
  last_compliance_check TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_product_compliance_gtin ON product_compliance (gtin);

CREATE TABLE IF NOT EXISTS compliance_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL,                    -- recall | warning_letter | classification_change
  source          TEXT NOT NULL,                    -- openfda | gs1 | manual
  vendor_id       TEXT REFERENCES vendors(id),
  product_sku     TEXT REFERENCES products(sku),
  severity        TEXT NOT NULL,                    -- class_i | class_ii | class_iii | info
  external_id     TEXT,                             -- FDA recall ID etc.
  payload         JSONB,
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_compliance_events_unresolved ON compliance_events (detected_at DESC) WHERE resolved_at IS NULL;
