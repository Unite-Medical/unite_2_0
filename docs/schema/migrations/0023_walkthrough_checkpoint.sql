-- 0023_walkthrough_checkpoint.sql
-- Founder walkthrough checkpoint: sourcing, vendor offers, PO communications,
-- PO-only receiving, and product tracking policy.

CREATE TABLE IF NOT EXISTS sourcing_requests (
  id                       TEXT PRIMARY KEY,
  status                   TEXT NOT NULL DEFAULT 'new',
  source_channel           TEXT NOT NULL,
  source_channels          JSONB NOT NULL DEFAULT '[]',
  source_evidence          JSONB,
  organization_id          TEXT REFERENCES organizations(id),
  organization_name        TEXT,
  contact_email            TEXT,
  account_owner_email      TEXT NOT NULL,
  account_owner_name       TEXT,
  product_description      TEXT NOT NULL,
  manufacturer             TEXT,
  part_number              TEXT,
  quantity                 NUMERIC(12,2),
  required_by              TIMESTAMPTZ,
  target_price             NUMERIC(12,4),
  destination              JSONB,
  compliance_requirements  JSONB NOT NULL DEFAULT '[]',
  original_artifact_id     TEXT,
  response_due_at          TIMESTAMPTZ,
  last_seen_at             TIMESTAMPTZ,
  duplicate_count          INT NOT NULL DEFAULT 0,
  selected_vendor_offer_id TEXT,
  purchase_order_id        TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sourcing_requests_owner_status
  ON sourcing_requests (account_owner_email, status, response_due_at);
CREATE INDEX IF NOT EXISTS idx_sourcing_requests_org
  ON sourcing_requests (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS vendor_offers (
  id                    TEXT PRIMARY KEY,
  sourcing_request_id   TEXT NOT NULL REFERENCES sourcing_requests(id) ON DELETE CASCADE,
  vendor_id             TEXT REFERENCES vendors(id),
  vendor_name           TEXT NOT NULL,
  original_artifact_id  TEXT,
  extraction_passes     JSONB NOT NULL DEFAULT '[]',
  extraction_confidence NUMERIC(6,5),
  extraction_consensus  BOOLEAN NOT NULL DEFAULT FALSE,
  line_items            JSONB NOT NULL DEFAULT '[]',
  status                TEXT NOT NULL DEFAULT 'needs_review',
  approved_by           TEXT,
  approved_at           TIMESTAMPTZ,
  purchase_order_id     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vendor_offers_request
  ON vendor_offers (sourcing_request_id, status);

CREATE TABLE IF NOT EXISTS po_communications (
  id          TEXT PRIMARY KEY,
  po_id       TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  actor       TEXT,
  provider    TEXT,
  message_id  TEXT,
  payload     JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_po_communications_po
  ON po_communications (po_id, occurred_at DESC);

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_id TEXT REFERENCES vendors(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_email TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_offer_id TEXT REFERENCES vendor_offers(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sourcing_request_id TEXT REFERENCES sourcing_requests(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_price_valid_until TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sent_by TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sent_to TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE purchase_orders DROP COLUMN IF EXISTS vendor_review_token;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_review_token_hash TEXT UNIQUE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_review_revision INTEGER;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_response TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_response_note TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_responded_by TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_responded_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_acknowledged_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS outbound_message_id TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS outbound_message_status TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS outbound_message_provider TEXT;

-- Audio-backed traceability capture. Blank lot/expiration is never valid. An
-- explicit N/A must carry traceability_attestation in the row JSON/data layer.
ALTER TABLE products ADD COLUMN IF NOT EXISTS lot_tracking TEXT NOT NULL DEFAULT 'optional';
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiration_tracking TEXT NOT NULL DEFAULT 'optional';
ALTER TABLE products ADD COLUMN IF NOT EXISTS serial_tracking TEXT NOT NULL DEFAULT 'not_tracked';
ALTER TABLE products ADD COLUMN IF NOT EXISTS udi_tracking TEXT NOT NULL DEFAULT 'not_tracked';
ALTER TABLE lots ADD COLUMN IF NOT EXISTS expiration_not_applicable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS traceability_attestation JSONB;

CREATE TABLE IF NOT EXISTS quote_signer_challenges (
  id           TEXT PRIMARY KEY,
  quote_id     TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  signer_email TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  attempts     INT NOT NULL DEFAULT 0,
  verified_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quote_signer_challenges_quote
  ON quote_signer_challenges (quote_id, signer_email, expires_at DESC);

-- Distributor-owned stock agreements and customer-safe settlement projection.
ALTER TABLE distributor_products ADD COLUMN IF NOT EXISTS settlement_unit_cost NUMERIC(14,4);
ALTER TABLE distributor_products ADD COLUMN IF NOT EXISTS settlement_currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE distributor_products ADD COLUMN IF NOT EXISTS settlement_effective_from TIMESTAMPTZ;
ALTER TABLE distributor_products ADD COLUMN IF NOT EXISTS settlement_effective_until TIMESTAMPTZ;
ALTER TABLE distributor_products ADD COLUMN IF NOT EXISTS settlement_updated_by TEXT;
ALTER TABLE distributor_products ADD COLUMN IF NOT EXISTS settlement_updated_at TIMESTAMPTZ;
ALTER TABLE distributor_products ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(14,3);
ALTER TABLE distributor_products ADD COLUMN IF NOT EXISTS replenishment_lead_days INT;
ALTER TABLE distributor_products ADD COLUMN IF NOT EXISTS safety_stock_days INT;
ALTER TABLE consignment_movements ADD COLUMN IF NOT EXISTS settlement_po_id TEXT REFERENCES purchase_orders(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_type TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS owner_org_id TEXT REFERENCES organizations(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS settlement_currency TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS agreement_id TEXT;

CREATE TABLE IF NOT EXISTS consignment_settlement_links (
  id                  TEXT PRIMARY KEY,
  owner_org_id        TEXT NOT NULL REFERENCES organizations(id),
  settlement_po_id    TEXT NOT NULL REFERENCES purchase_orders(id),
  internal_order_id   TEXT NOT NULL REFERENCES orders(id),
  movement_ids        JSONB NOT NULL DEFAULT '[]',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consignment_settlement_links_owner
  ON consignment_settlement_links (owner_org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS distributor_notifications (
  id           TEXT PRIMARY KEY,
  owner_org_id TEXT NOT NULL REFERENCES organizations(id),
  product_id   TEXT REFERENCES distributor_products(id),
  kind         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'unread',
  payload      JSONB NOT NULL DEFAULT '{}',
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_distributor_notifications_owner
  ON distributor_notifications (owner_org_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS distributor_pickups (
  id                       TEXT PRIMARY KEY,
  owner_org_id             TEXT NOT NULL REFERENCES organizations(id),
  order_id                 TEXT NOT NULL REFERENCES orders(id),
  status                   TEXT NOT NULL DEFAULT 'requested',
  carrier_name             TEXT NOT NULL,
  third_party_account_ref  TEXT,
  booking_reference        TEXT NOT NULL,
  dispatch_contact         JSONB,
  requested_start          TIMESTAMPTZ NOT NULL,
  requested_end            TIMESTAMPTZ NOT NULL,
  confirmed_start          TIMESTAMPTZ,
  confirmed_end            TIMESTAMPTZ,
  driver_name              TEXT,
  vehicle_id               TEXT,
  custody_signature        TEXT,
  requested_by             TEXT,
  requested_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at             TIMESTAMPTZ,
  arrived_at               TIMESTAMPTZ,
  handed_off_at            TIMESTAMPTZ,
  cancelled_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_distributor_pickups_owner
  ON distributor_pickups (owner_org_id, status, requested_start);

CREATE TABLE IF NOT EXISTS distributor_pickup_events (
  id          TEXT PRIMARY KEY,
  pickup_id   TEXT NOT NULL REFERENCES distributor_pickups(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  actor       TEXT,
  payload     JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_distributor_pickup_events_pickup
  ON distributor_pickup_events (pickup_id, occurred_at);
