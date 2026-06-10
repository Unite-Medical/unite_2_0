-- PRD-02 / PRD-09 — Finance: invoices, payments, QBO + Stripe state.

CREATE TABLE IF NOT EXISTS invoices (
  id                  TEXT PRIMARY KEY,
  order_id            TEXT REFERENCES orders(id),
  org_id              TEXT REFERENCES organizations(id),
  amount              NUMERIC(12,2) NOT NULL,
  balance             NUMERIC(12,2) NOT NULL,
  terms               TEXT NOT NULL,                   -- card | ach | net30 | net60 | wire | edi
  status              TEXT NOT NULL,                   -- draft | open | paid | past_due | void | uncollectible
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date            DATE NOT NULL,
  paid_at             TIMESTAMPTZ,
  payment_method      TEXT,
  qbo_invoice_id      TEXT,
  stripe_invoice_id   TEXT,
  dunning_sequence_id TEXT,
  dunning_stage       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON invoices (org_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices (status, due_date) WHERE status IN ('open', 'past_due');

CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY,
  invoice_id      TEXT REFERENCES invoices(id),
  amount          NUMERIC(12,2) NOT NULL,
  method          TEXT NOT NULL,                       -- ach | card | wire | check
  stripe_payment_id TEXT,
  qbo_payment_id  TEXT,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PRD-02: QBO OAuth state. Tokens encrypted at rest (handled at app layer).
CREATE TABLE IF NOT EXISTS qbo_oauth (
  realm_id        TEXT PRIMARY KEY,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  last_refreshed  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qbo_invoices (
  id              TEXT PRIMARY KEY,                    -- our wrapper id
  qbo_invoice_id  TEXT UNIQUE NOT NULL,                -- QBO's Invoice.Id
  order_id        TEXT REFERENCES orders(id),
  customer_id     TEXT,
  doc_number      TEXT,
  amount          NUMERIC(12,2) NOT NULL,
  balance         NUMERIC(12,2) NOT NULL,
  terms           TEXT,
  status          TEXT,
  due_date        DATE,
  paid_at         TIMESTAMPTZ,
  payment_method  TEXT,
  raw_payload     JSONB,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stripe_payments (
  id              TEXT PRIMARY KEY,
  stripe_pi_id    TEXT UNIQUE,
  amount          NUMERIC(12,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'usd',
  metadata        JSONB,
  status          TEXT NOT NULL,
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id              TEXT PRIMARY KEY,
  org_id          TEXT REFERENCES organizations(id),
  stripe_pm_id    TEXT UNIQUE,
  kind            TEXT NOT NULL,                       -- card | us_bank_account
  is_default      BOOLEAN DEFAULT FALSE,
  last4           TEXT,
  brand_or_bank   TEXT,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
