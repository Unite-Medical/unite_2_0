-- PRD-05 — Gmail/Resend outbox (transactional + drafted-by-AI emails)
-- and the CEO daily digest table.

CREATE TABLE IF NOT EXISTS gmail_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address      TEXT NOT NULL,
  cc              TEXT[],
  bcc             TEXT[],
  from_address    TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  body_format     TEXT NOT NULL DEFAULT 'text',    -- text | html | markdown
  status          TEXT NOT NULL DEFAULT 'queued',  -- queued | sent | failed | bounced
  drafted_by      TEXT,                            -- 'human' | 'ai:vendor/outreach_email' etc.
  approved_by     TEXT REFERENCES profiles(id),
  approved_at     TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  resend_id       TEXT,
  error           TEXT,
  template_key    TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON gmail_outbox (status, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_digests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date     DATE NOT NULL,
  recipient       TEXT NOT NULL,
  bullets         JSONB NOT NULL,                  -- [{priority, headline, summary, why_it_matters, deep_link, severity}]
  ai_usage_id     UUID REFERENCES ai_usage(id),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,
  UNIQUE (digest_date, recipient)
);
