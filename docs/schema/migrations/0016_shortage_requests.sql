-- 0016: No-EDI shortage-list intake (Cato-gap feature).
-- A buyer pastes/uploads their backorder list on /shortage-list; we parse
-- each line, match it against the stocked catalog (exact SKU, HCPCS, or
-- fuzzy description), and store the full request for sales follow-up.

CREATE TABLE IF NOT EXISTS shortage_requests (
  id           TEXT PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  email        TEXT,                  -- requester contact (optional until submit)
  organization TEXT,
  raw_text     TEXT NOT NULL,         -- the pasted/uploaded list, verbatim
  line_count   INTEGER NOT NULL DEFAULT 0,
  matched      INTEGER NOT NULL DEFAULT 0,  -- lines matched to stocked SKUs
  substitutes  INTEGER NOT NULL DEFAULT 0,  -- lines covered only by equivalents
  unmatched    INTEGER NOT NULL DEFAULT 0,
  lines        JSONB NOT NULL DEFAULT '[]'::jsonb, -- parsed + matched line detail
  status       TEXT NOT NULL DEFAULT 'new'  -- new | quoted | won | closed
);

CREATE INDEX IF NOT EXISTS idx_shortage_requests_status
  ON shortage_requests (status, created_at DESC);
