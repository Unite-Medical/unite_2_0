-- 0017: 1099 rep network, surplus marketplace, calendar mirror.
-- Brief §2 #5 (reps), §8 Phase 2 (marketplace), §5 (meeting sync).
-- Mirrors the localStorage tables added in src/lib/db.js SCHEMA_VERSION 10.

-- Rep roster. Commission entries are computed from orders at read time
-- (orders.customer_id → organizations.account_rep), so no ledger table
-- yet; a materialized payout ledger lands with Stripe Connect payouts.
CREATE TABLE IF NOT EXISTS reps (
  id             TEXT PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  territory      TEXT,
  segment_focus  TEXT,                  -- asc | pharmacy | ems | gov | distributors
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 5.0,
  status         TEXT NOT NULL DEFAULT 'active',  -- active | ramping | principal | inactive
  calendly_url   TEXT,
  started_at     TIMESTAMPTZ
);

-- Buyer offers on published surplus lots. The listing itself lives on
-- surplus_lines (listed, ask_usd_per_unit, listing_status) added below.
CREATE TABLE IF NOT EXISTS surplus_offers (
  id                 TEXT PRIMARY KEY,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  line_id            UUID NOT NULL REFERENCES surplus_lines(id),
  submission_id      UUID REFERENCES surplus_submissions(id),
  buyer_name         TEXT,
  buyer_email        TEXT NOT NULL,
  buyer_org          TEXT,
  qty                INTEGER NOT NULL,
  offer_usd_per_unit NUMERIC(12,2) NOT NULL,
  offer_usd_total    NUMERIC(12,2) NOT NULL,
  message            TEXT,
  status             TEXT NOT NULL DEFAULT 'open',  -- open | accepted | declined
  decided_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_surplus_offers_line
  ON surplus_offers (line_id, status, created_at DESC);

-- Marketplace listing fields on the existing surplus_lines table.
ALTER TABLE surplus_lines ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE surplus_lines ADD COLUMN IF NOT EXISTS listed_at TIMESTAMPTZ;
ALTER TABLE surplus_lines ADD COLUMN IF NOT EXISTS ask_usd_per_unit NUMERIC(12,2);
ALTER TABLE surplus_lines ADD COLUMN IF NOT EXISTS listing_status TEXT;  -- open | pending_fulfillment | withdrawn
ALTER TABLE surplus_lines ADD COLUMN IF NOT EXISTS sold_offer_id TEXT;

-- Google Calendar / Calendly meeting mirror (one row per meeting,
-- regardless of source) so rep dashboards render one feed.
CREATE TABLE IF NOT EXISTS calendar_events (
  id                 TEXT PRIMARY KEY,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  google_event_id    TEXT,
  calendly_event_uri TEXT,
  summary            TEXT NOT NULL,
  description        TEXT,
  start_at           TIMESTAMPTZ,
  end_at             TIMESTAMPTZ,
  attendees          JSONB NOT NULL DEFAULT '[]'::jsonb,
  rep_email          TEXT,
  source             TEXT NOT NULL,    -- google | calendly | stub
  canceled           BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_rep
  ON calendar_events (rep_email, start_at DESC);

-- Account-approval audit fields (§6.2 confidence scoring) on organizations.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS approval_score INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS approval_reasons JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Password hashes replace plaintext (salted SHA-256 client-side today;
-- argon2id server-side when auth moves behind the API).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_salt TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;
