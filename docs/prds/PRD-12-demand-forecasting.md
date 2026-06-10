# PRD-12 — Demand Forecasting Model

**Source:** CTO Brief §9 — "where the CTO's mathematics background creates direct business value"
**Owner:** Alex (CTO)
**Status:** draft
**Depends on:** PRD-01 (Platform), PRD-02 (QBO orders history), PRD-04 (Cin7 real inventory)
**Used by:** PRD-04 (reorder points), PRD-07 (vendor capacity planning)

> "Per-SKU demand forecasting → reorder point + safety stock → auto-draft PO." — Brief §9

---

## 1. North star

Every SKU has a forecast for 30/60/90 days that auto-updates daily,
drives reorder points, and produces a draft PO before a human notices
the dip. Seasonal cyclicality (orthotics in winter, diagnostics in
flu season) is captured automatically.

---

## 2. Current state

- No forecasting. Reorder points are static / hand-set.
- Order history exists in `orders` + `order_items` tables (currently
  localStorage-seeded; once PRD-02 + PRD-04 land, this is real QBO + Cin7 data)

---

## 3. Scope

### In scope

- Python forecasting sidecar service (FastAPI), brief §9 implies this
  + matches PRD-01 architecture decision
- Per-SKU and per-category time-series models
- Outputs: predicted demand (30/60/90), reorder point, safety stock
- Daily retraining (incremental)
- Reorder triggers: when on-hand ≤ reorder point → draft PO in QBO +
  notify procurement
- Seasonal adjustment knobs
- Backtesting harness: compare last-90-day forecast to last-90-day
  actuals; report MAPE per SKU

### Out of scope

- Model serving at sub-second latency (forecasts are precomputed nightly)
- Marketplace-level forecasting (single-tenant for now)
- Promotional uplift modeling (sales/promos aren't a big enough
  driver for v1)

---

## 4. Model approach

A two-layer model:

1. **Baseline per SKU**: Prophet (Facebook's library) — handles
   seasonality and trend with minimal tuning, robust to sparse data
2. **Hierarchical adjustment**: roll up to category level for SKUs
   with < 6 months of history; borrow category-level seasonality

Per the brief: "Prophet, statsmodels SARIMA, or custom". Prophet
ships fastest with good results out of the box. Switch to SARIMA or
neural (DeepAR, Chronos) only if Prophet's MAPE > acceptable
threshold (TBD per category).

**Inputs per SKU:**

- Daily aggregated unit sales for the last 24 months
- Day-of-week, month, holiday flags (Prophet handles)
- Optional: external regressor for known events (e.g., flu-season
  CDC index for diagnostics — add only if useful)

**Outputs per SKU:**

- `forecast_30/60/90`: point forecast in units
- `forecast_lower/upper`: 80% prediction interval
- `reorder_point`: `lead_time_demand + safety_stock`
- `safety_stock`: `Z * sigma * sqrt(lead_time)` where Z = 1.65 for
  95% service level
- `recommended_order_qty`: economic order quantity or simple
  `forecast_60 - on_hand`

---

## 5. Architecture

```
unite-api (Node)
    │
    │  POST /api/forecast/run    (admin trigger)
    │  GET  /api/forecast/{sku}  (read latest)
    ▼
forecasting (Python · FastAPI · Fly.io sidecar)
    │
    │  Reads from Postgres directly (read replica or main)
    │  Writes forecasts to forecasts table
    │  Pulls daily order-history snapshot for retraining
    ▼
Postgres
```

The Python service is small (one Dockerfile, < 500 lines of code).
Lives in `forecasting/` directory in the monorepo.

---

## 6. Data model

```sql
CREATE TABLE forecasts (
  sku                 TEXT NOT NULL,
  forecast_run_id     UUID NOT NULL,
  generated_at        TIMESTAMPTZ NOT NULL,
  horizon_days        INT NOT NULL,
  forecast_units      INT NOT NULL,
  forecast_lower      INT NOT NULL,
  forecast_upper      INT NOT NULL,
  PRIMARY KEY (sku, generated_at, horizon_days)
);

CREATE TABLE reorder_points (
  sku                  TEXT PRIMARY KEY,
  computed_at          TIMESTAMPTZ,
  reorder_point        INT NOT NULL,
  safety_stock         INT NOT NULL,
  recommended_qty      INT NOT NULL,
  service_level        NUMERIC(3,2) DEFAULT 0.95,
  lead_time_days       INT,
  is_seasonal          BOOLEAN,
  model_metadata       JSONB
);

CREATE TABLE forecast_runs (
  id              UUID PRIMARY KEY,
  started_at      TIMESTAMPTZ NOT NULL,
  finished_at     TIMESTAMPTZ,
  status          TEXT, -- 'running' / 'ok' / 'partial' / 'failed'
  sku_count       INT,
  errors          JSONB
);

CREATE TABLE forecast_evals (
  sku             TEXT NOT NULL,
  eval_date       DATE NOT NULL,
  horizon_days    INT NOT NULL,
  predicted       INT,
  actual          INT,
  mape            NUMERIC,
  PRIMARY KEY (sku, eval_date, horizon_days)
);
```

---

## 7. Phases

### Phase 1 — Sidecar scaffold

- `forecasting/` directory with FastAPI app, Dockerfile, Fly config
- Connects to Postgres in read mode
- One endpoint: `GET /forecast/{sku}` returns the latest forecast
- Healthcheck + Sentry

**Exit:** Deployed to Fly. `curl forecasting.unitemedical.net/health`
returns 200.

### Phase 2 — Prophet baseline

- Pull 24 months of `order_items` aggregated by SKU + day
- Fit Prophet per SKU; persist forecasts to `forecasts` table
- Compute `reorder_points`
- Daily cron at 2am ET retrains

**Exit:** All active SKUs (~87 today, more after PRD-04) have a
forecast row from yesterday. MAPE for top-20 SKUs computed.

### Phase 3 — Reorder-point integration with Cin7 (depends on PRD-04)

- Read on-hand from Cin7-mirrored `inventory` table
- When `on_hand <= reorder_point`: create draft PO in QBO (PRD-02) +
  HubSpot task to procurement
- `/admin/inventory` shows forecast vs. on-hand visually (sparkline +
  trigger line)

**Exit:** Draft POs auto-generated for SKUs hitting reorder point;
no false positives in 30 days.

### Phase 4 — Backtest + eval

- `forecast_evals` table populated daily: yesterday's actual vs. the
  forecast made N days ago for several horizons
- `/admin/analytics/forecast` shows MAPE distribution + worst SKUs
- For consistently-poor SKUs (MAPE > threshold), flag for manual
  review (Damon may know about a discontinuation, etc.)

**Exit:** Backtest table populated; weekly review meeting has data to
work from.

### Phase 5 — Seasonal & external regressors

- Identify SKUs with strong seasonality (auto-detected via Prophet)
- Optional: add external regressors (CDC flu-index, calendar holidays
  unique to medical procurement like fiscal year-end)
- Re-evaluate MAPE

**Exit:** Seasonal SKUs show meaningfully lower MAPE with seasonality
flag on vs. off.

### Phase 6 — Vendor capacity planning

- Roll forecasts up to vendor: "Vendor X will need to ship N units of
  Class II diagnostics in Q3"
- Surface in `/admin/vendors/{id}` so we can pre-negotiate volume
  pricing

**Exit:** First quarterly vendor planning conversation uses these
roll-ups as the basis.

---

## 8. Verifier

`scripts/forecast_check.py` (daily):

- Assert yesterday's `forecast_run_status = ok`
- Assert MAPE of top-20 SKUs is below configured threshold
- Alert if reorder point dropped below current on-hand without a
  corresponding draft PO created
- Alert on forecast_run failure

---

## 9. Open questions

1. **Service level (Z value)**: 95% is standard. Some products (PPE,
   diagnostics during flu season) may justify 99%. Default 95%,
   tunable per category.
2. **Lead time source**: vendor-stated vs. measured-from-Flexport-data.
   Default: measured (Flexport milestones give us actuals).
3. **Cold start for new SKUs**: how do we forecast something with <
   30 days of data? Default: borrow category-level seasonality +
   conservative safety stock for the first 90 days.
4. **PRD-10 surplus stock**: surplus inventory has irregular
   arrival; do we forecast it separately? Default: pool with main
   inventory for forecasting; track its margin separately.

---

## 10. Out-of-band

- Fly.io app provisioned for forecasting sidecar
- Database read replica (optional; for v1 the main DB is fine)
- New env vars: `FORECASTING_DATABASE_URL`, `FORECASTING_SENTRY_DSN`

---

## 11. Definition of done

- Daily forecast run for every active SKU
- Reorder points updated daily; draft POs auto-generated
- MAPE for top-50 SKUs is under the configured threshold (per category)
- Vendor capacity planning meetings happen quarterly with forecast data
- Procurement spends fewer hours per week on "when do we need to reorder"
