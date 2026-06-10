# Forecasting sidecar — PRD-12

Per-SKU demand forecasting service. FastAPI + Prophet. Reads order
history from Postgres, writes forecasts back. Triggered by a daily
cron from the Node API (PRD-01).

## Why Python

The brief recommends Node for everything *except* forecasting, which
goes to Python. Prophet (and its alternatives — statsmodels SARIMA,
DeepAR, Chronos) are mature in Python and weak/non-existent in JS.

Keeping the forecasting service as a small sidecar means the rest of
the stack stays uniformly TypeScript.

## Layout

```
forecasting/
├── README.md             — this file
├── pyproject.toml        — dependencies
├── Dockerfile            — multi-stage Python 3.12 + Fly.io target
├── fly.toml              — deploy config (created when account exists)
└── app/
    ├── main.py           — FastAPI app
    ├── forecaster.py     — Prophet model fitting + reorder logic
    ├── db.py             — Postgres client (psycopg)
    └── eval.py           — backtest / MAPE harness
```

## Endpoints (planned)

| Method | Path | Use |
|---|---|---|
| `GET`  | `/health` | liveness + version |
| `GET`  | `/forecast/{sku}` | latest forecast for one SKU |
| `POST` | `/forecast/run` | trigger a forecast run (cron) |
| `POST` | `/forecast/run/{sku}` | re-forecast a single SKU |
| `GET`  | `/evals` | latest MAPE distribution |

## Development

```bash
cd forecasting
python -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8001
```

## Deployment

Fly.io app: `unite-forecasting`. Provisioned in PRD-12 Phase 1.

```bash
fly deploy
```

## Connection

The Node API (PRD-01) hits `forecasting.unitemedical.net` (or the
internal Fly hostname). The DB connection is read-mostly with one
write endpoint (`forecasts`, `reorder_points`, `forecast_runs`,
`forecast_evals` tables, defined in `docs/schema/migrations/0013_forecast.sql`).
