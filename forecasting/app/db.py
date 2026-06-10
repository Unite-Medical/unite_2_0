"""Postgres I/O for the forecasting sidecar (PRD-12).

Thin wrapper around psycopg. All queries are parameterized.

When the backend (PRD-01) lands, set `FORECASTING_DATABASE_URL` to the
read-replica connection string. The write side targets the primary —
forecasts + reorder_points + forecast_runs.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import psycopg

DATABASE_URL = os.environ.get("FORECASTING_DATABASE_URL") or os.environ.get("DATABASE_URL", "")


def _conn() -> psycopg.Connection:
    if not DATABASE_URL:
        raise RuntimeError(
            "FORECASTING_DATABASE_URL is not set. "
            "Provision Neon (PRD-01) and configure the env var."
        )
    return psycopg.connect(DATABASE_URL, autocommit=True)


def fetch_active_skus() -> list[str]:
    """SKUs with at least one order_item in the last 24 months."""
    sql = """
        SELECT DISTINCT product_sku
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.placed_at >= NOW() - INTERVAL '24 months'
          AND oi.product_sku IS NOT NULL
        ORDER BY product_sku
    """
    with _conn() as c, c.cursor() as cur:
        cur.execute(sql)
        return [row[0] for row in cur.fetchall()]


def fetch_order_history_daily(sku: str) -> pd.DataFrame:
    """Daily aggregated unit sales for a SKU over last 24 months."""
    sql = """
        SELECT
            DATE(o.placed_at AT TIME ZONE 'UTC') AS ds,
            SUM(oi.qty)::int                    AS y
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_sku = %s
          AND o.placed_at >= NOW() - INTERVAL '24 months'
          AND o.status NOT IN ('cancelled')
        GROUP BY ds
        ORDER BY ds
    """
    with _conn() as c, c.cursor() as cur:
        cur.execute(sql, (sku,))
        rows = cur.fetchall()
    if not rows:
        return pd.DataFrame(columns=["ds", "y"])
    df = pd.DataFrame(rows, columns=["ds", "y"])
    df["ds"] = pd.to_datetime(df["ds"])
    # Fill in days with 0 sales so Prophet sees a continuous series.
    full = pd.date_range(df["ds"].min(), df["ds"].max(), freq="D")
    df = df.set_index("ds").reindex(full, fill_value=0).rename_axis("ds").reset_index()
    return df


def fetch_lead_time_days(sku: str) -> int | None:
    """Lead time in days for a SKU. Pulled from Flexport history if
    available (PRD-03), else vendors.default_lead_time_days, else None."""
    sql = """
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (fs.eta - fs.created_at)) / 86400)::int, NULL)
        FROM flexport_shipments fs
        WHERE fs.status = 'delivered'
          AND fs.created_at >= NOW() - INTERVAL '12 months'
          AND fs.vendor_id IN (
              SELECT vendor_id FROM products WHERE sku = %s
          )
    """
    try:
        with _conn() as c, c.cursor() as cur:
            cur.execute(sql, (sku,))
            row = cur.fetchone()
            return row[0] if row and row[0] else None
    except psycopg.errors.UndefinedTable:
        # Schema not migrated yet (development).
        return None


def fetch_latest_forecast(sku: str) -> list[dict[str, Any]]:
    sql = """
        SELECT horizon_days, forecast_units, forecast_lower, forecast_upper, generated_at
        FROM forecasts
        WHERE product_sku = %s
        ORDER BY generated_at DESC
        LIMIT 3
    """
    with _conn() as c, c.cursor() as cur:
        cur.execute(sql, (sku,))
        return [
            {
                "horizon_days": h,
                "forecast_units": u,
                "forecast_lower": lo,
                "forecast_upper": hi,
                "generated_at": gen.isoformat() if gen else None,
            }
            for (h, u, lo, hi, gen) in cur.fetchall()
        ]


def record_run_started() -> str:
    run_id = str(uuid.uuid4())
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            "INSERT INTO forecast_runs (id, started_at, status) VALUES (%s, %s, 'running')",
            (run_id, datetime.now(timezone.utc)),
        )
    return run_id


def record_run_finished(
    run_id: str,
    status: str,
    sku_count: int | None = None,
    errors: dict[str, Any] | None = None,
) -> None:
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            """
            UPDATE forecast_runs
               SET finished_at = %s, status = %s, sku_count = %s, errors = %s
             WHERE id = %s
            """,
            (
                datetime.now(timezone.utc),
                status,
                sku_count,
                json.dumps(errors) if errors else None,
                run_id,
            ),
        )


def persist_forecast(
    sku: str,
    run_id: str,
    horizon_days: int,
    forecast_units: int,
    forecast_lower: int,
    forecast_upper: int,
) -> None:
    sql = """
        INSERT INTO forecasts
            (product_sku, forecast_run_id, generated_at, horizon_days,
             forecast_units, forecast_lower, forecast_upper)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (product_sku, generated_at, horizon_days) DO UPDATE
          SET forecast_units = EXCLUDED.forecast_units,
              forecast_lower = EXCLUDED.forecast_lower,
              forecast_upper = EXCLUDED.forecast_upper
    """
    with _conn() as c, c.cursor() as cur:
        cur.execute(sql, (sku, run_id, datetime.now(timezone.utc), horizon_days,
                          forecast_units, forecast_lower, forecast_upper))


def persist_reorder_point(
    sku: str,
    reorder_point: int,
    safety_stock: int,
    recommended_qty: int,
    service_level: float,
    lead_time_days: int | None,
    is_seasonal: bool,
    model_metadata: dict[str, Any],
) -> None:
    sql = """
        INSERT INTO reorder_points
            (product_sku, computed_at, reorder_point, safety_stock,
             recommended_qty, service_level, lead_time_days, is_seasonal, model_metadata)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (product_sku) DO UPDATE
          SET computed_at = EXCLUDED.computed_at,
              reorder_point = EXCLUDED.reorder_point,
              safety_stock = EXCLUDED.safety_stock,
              recommended_qty = EXCLUDED.recommended_qty,
              service_level = EXCLUDED.service_level,
              lead_time_days = EXCLUDED.lead_time_days,
              is_seasonal = EXCLUDED.is_seasonal,
              model_metadata = EXCLUDED.model_metadata
    """
    with _conn() as c, c.cursor() as cur:
        cur.execute(sql, (
            sku, datetime.now(timezone.utc), reorder_point, safety_stock,
            recommended_qty, service_level, lead_time_days, is_seasonal,
            json.dumps(model_metadata),
        ))
