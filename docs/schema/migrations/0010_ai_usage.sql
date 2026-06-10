-- PRD-11 — AI usage tracking. Every call through the prompt registry
-- logs a row here for the admin dashboard + budget alerts.

CREATE TABLE IF NOT EXISTS ai_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key      TEXT NOT NULL,                    -- e.g. 'quoting/cover_letter'
  prompt_version  TEXT NOT NULL,                    -- e.g. '1'
  model           TEXT NOT NULL,                    -- claude-sonnet-4-6 | claude-haiku-4
  input_tokens    INT NOT NULL DEFAULT 0,
  output_tokens   INT NOT NULL DEFAULT 0,
  usd_cost        NUMERIC(10,4) NOT NULL DEFAULT 0,
  duration_ms     INT,
  status          TEXT NOT NULL,                    -- ok | error | stub | rate_limited
  error           TEXT,
  source          TEXT,                             -- 'webhook:fathom' | 'cron:digest' | 'quoting-engine' etc.
  caller_user_id  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_prompt ON ai_usage (prompt_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_cost ON ai_usage (created_at DESC, usd_cost DESC);
