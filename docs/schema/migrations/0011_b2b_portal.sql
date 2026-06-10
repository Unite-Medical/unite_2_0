-- PRD-14 — B2B portal: role-based pricing + catalog gating.
-- Replaces Shopify apps Locksmith + Helium Customer Fields.

CREATE TABLE IF NOT EXISTS tier_pricing (
  product_sku     TEXT REFERENCES products(sku) ON DELETE CASCADE,
  tier            TEXT NOT NULL,                    -- A | B | C | distributor | gov
  price           NUMERIC(10,2) NOT NULL,
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to    DATE,
  PRIMARY KEY (product_sku, tier, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_tier_pricing_lookup ON tier_pricing (product_sku, tier) WHERE effective_to IS NULL OR effective_to >= CURRENT_DATE;

CREATE TABLE IF NOT EXISTS catalog_visibility (
  product_sku     TEXT REFERENCES products(sku) ON DELETE CASCADE,
  segment         TEXT NOT NULL,                    -- asc | pharmacy | ems | gov | distributors | retail
  visible         BOOLEAN NOT NULL DEFAULT TRUE,
  reason          TEXT,
  set_by          TEXT REFERENCES profiles(id),
  set_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_sku, segment)
);

-- Org-level custom fields land in organizations table via 0001_core.sql.
-- This file ONLY covers the role-based-pricing + gating tables.

CREATE TABLE IF NOT EXISTS credit_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  requested_terms TEXT NOT NULL,                    -- net30 | net60
  requested_limit NUMERIC(12,2),
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | declined
  reviewed_by     TEXT REFERENCES profiles(id),
  reviewed_at     TIMESTAMPTZ,
  documents       JSONB,                            -- [{name, r2_key}]
  decision_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
