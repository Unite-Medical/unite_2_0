-- PRD-01 — Core tables: organizations, profiles, addresses, audit_log
-- Idempotent. Run order: first.

CREATE TABLE IF NOT EXISTS organizations (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  segment         TEXT NOT NULL,           -- asc | pharmacy | ems | gov | distributors | retail
  tier            TEXT NOT NULL DEFAULT 'C', -- A | B | C | distributor | gov
  terms           TEXT NOT NULL DEFAULT 'card',
  credit_limit    NUMERIC(12,2) DEFAULT 0,
  total_spend     NUMERIC(14,2) DEFAULT 0,
  account_rep     TEXT,
  dea_number      TEXT,
  npi_number      TEXT,
  tax_exempt_status TEXT,
  hubspot_company_id TEXT,
  qbo_customer_id    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id              TEXT PRIMARY KEY,        -- mirrors Clerk user ID
  email           TEXT UNIQUE NOT NULL,
  name            TEXT,
  role            TEXT NOT NULL DEFAULT 'customer',  -- admin | rep | customer | dealer | gov_buyer
  org_id          TEXT REFERENCES organizations(id),
  title           TEXT,
  phone           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles (org_id);

CREATE TABLE IF NOT EXISTS organization_users (
  user_id         TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  org_id          TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  role_in_org     TEXT NOT NULL DEFAULT 'buyer',  -- admin | buyer | viewer
  invited_at      TIMESTAMPTZ,
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, org_id)
);

CREATE TABLE IF NOT EXISTS addresses (
  id              TEXT PRIMARY KEY,
  org_id          TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,  -- billing | shipping | both
  street1         TEXT NOT NULL,
  street2         TEXT,
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  postal_code     TEXT NOT NULL,
  country         TEXT NOT NULL DEFAULT 'US',
  is_default      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL,   -- e.g. 'qbo.invoice.created'
  ref_id          TEXT,
  actor_id        TEXT,            -- profile id or 'system'
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_kind_created ON audit_log (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_ref ON audit_log (ref_id);
