-- PRD-06 — CRM: leads, contacts, activities, tasks. Bidirectional with
-- HubSpot. Our DB is the source of truth for in-app records; HubSpot
-- is the source of truth for sales workflow + reporting.

CREATE TABLE IF NOT EXISTS leads (
  id              TEXT PRIMARY KEY,
  org_name        TEXT NOT NULL,
  contact_email   TEXT,
  contact_name    TEXT,
  segment         TEXT,
  source          TEXT,                             -- openfda | importgenius | inbound | rep_sourced | zoominfo
  status          TEXT NOT NULL DEFAULT 'new',      -- new | qualifying | qualified | won | lost
  hot             BOOLEAN DEFAULT FALSE,
  est_annual_value NUMERIC(12,2),
  hubspot_contact_id TEXT,
  hubspot_deal_id TEXT,
  assigned_to     TEXT REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads (assigned_to);

CREATE TABLE IF NOT EXISTS contacts (
  id              TEXT PRIMARY KEY,
  org_id          TEXT REFERENCES organizations(id),
  email           TEXT,
  first_name      TEXT,
  last_name       TEXT,
  role            TEXT,                             -- buyer | ops | clinician | finance | exec
  decision_authority TEXT,                          -- economic | technical | user | gatekeeper
  phone           TEXT,
  hubspot_contact_id TEXT UNIQUE,
  last_call_at    TIMESTAMPTZ,
  last_call_summary TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL,                    -- call | email | meeting | note
  source          TEXT,                             -- fathom | gmail | calendly | manual
  external_id     TEXT,
  who             TEXT,                             -- rep email
  org_id          TEXT REFERENCES organizations(id),
  contact_id      TEXT REFERENCES contacts(id),
  deal_id         TEXT,                             -- HubSpot deal ID
  subject         TEXT,
  body            TEXT,
  duration_min    INT,
  transcript_url  TEXT,
  recording_url   TEXT,
  action_items    JSONB,
  insights        JSONB,
  raw_payload     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_org ON activities (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_who ON activities (who, created_at DESC);

CREATE TABLE IF NOT EXISTS tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        TEXT REFERENCES profiles(id),
  org_id          TEXT REFERENCES organizations(id),
  contact_id      TEXT REFERENCES contacts(id),
  deal_id         TEXT,
  title           TEXT NOT NULL,
  notes           TEXT,
  due_date        DATE,
  status          TEXT NOT NULL DEFAULT 'open',     -- open | done | cancelled
  source          TEXT,                             -- fathom | workflow | manual
  hubspot_task_id TEXT,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_owner_open ON tasks (owner_id, due_date) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS hubspot_contacts (
  id              TEXT PRIMARY KEY,
  properties      JSONB,
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
