"""Backtest harness — PRD-12 Phase 4.

For each SKU + horizon, compare yesterday's actual unit demand against
the forecast that was made N days ago. MAPE is recorded per
(sku, eval_date, horizon).
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone

from .db import _conn  # noqa: PLC2701  (internal use)


def run_backtest(eval_date: date | None = None) -> dict:
    target = eval_date or (datetime.now(timezone.utc).date() - timedelta(days=1))
    horizons = [30, 60, 90]

    inserted = 0
    sql_actual = """
        SELECT product_sku, SUM(qty)::int
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE DATE(o.placed_at AT TIME ZONE 'UTC') = %s
          AND o.status NOT IN ('cancelled')
        GROUP BY product_sku
    """
    sql_predicted = """
        SELECT forecast_units
        FROM forecasts
        WHERE product_sku = %s
          AND horizon_days = %s
          AND DATE(generated_at) = %s
        LIMIT 1
    """
    sql_upsert = """
        INSERT INTO forecast_evals (product_sku, eval_date, horizon_days, predicted, actual, mape)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (product_sku, eval_date, horizon_days) DO UPDATE
          SET predicted = EXCLUDED.predicted,
              actual = EXCLUDED.actual,
              mape = EXCLUDED.mape
    """

    with _conn() as c, c.cursor() as cur:
        cur.execute(sql_actual, (target,))
        actuals = dict(cur.fetchall())

        for sku, actual in actuals.items():
            for h in horizons:
                ago = target - timedelta(days=h - 1)
                cur.execute(sql_predicted, (sku, h, ago))
                row = cur.fetchone()
                if not row:
                    continue
                predicted = row[0]
                mape = abs(predicted - actual) / actual if actual > 0 else None
                cur.execute(sql_upsert, (sku, target, h, predicted, actual, mape))
                inserted += 1

    return {"eval_date": str(target), "rows_written": inserted}


if __name__ == "__main__":  # pragma: no cover
    print(json.dumps(run_backtest(), indent=2))
