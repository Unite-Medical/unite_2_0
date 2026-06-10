"""Per-SKU demand forecasting (PRD-12 Phase 2).

Uses Prophet for the baseline; falls back to a 7-day moving average
when there isn't enough history (< 30 data points).
"""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd

from .db import fetch_lead_time_days, fetch_order_history_daily

HORIZONS = (30, 60, 90)
DEFAULT_SERVICE_LEVEL = 0.95  # Z = 1.645 for one-tailed normal


def list_skus_to_forecast() -> list[str]:
    """Return every active SKU we have order history for."""
    from .db import fetch_active_skus

    return fetch_active_skus()


def fit_and_forecast(sku: str) -> dict[int, dict[str, int]]:
    """
    Fit a Prophet model to daily unit sales of `sku`, then forecast
    cumulative demand over each horizon (30 / 60 / 90 days).

    Returns:
        { 30: {forecast_units, forecast_lower, forecast_upper}, 60: {...}, 90: {...} }
    """
    df = fetch_order_history_daily(sku)
    if df.empty:
        # No history at all — return zeros so the row exists with a
        # warning band.
        return {h: {"forecast_units": 0, "forecast_lower": 0, "forecast_upper": 0} for h in HORIZONS}

    if len(df) < 30:
        # Cold-start: 7-day moving average projected forward.
        recent = df["y"].tail(7).mean() if len(df) >= 7 else df["y"].mean()
        baseline = int(round(recent))
        return {
            h: {
                "forecast_units": max(baseline * h, 0),
                "forecast_lower": max(int(baseline * h * 0.6), 0),
                "forecast_upper": max(int(baseline * h * 1.4), 0),
            }
            for h in HORIZONS
        }

    # Real Prophet fit. Wrapped to avoid import cost when not needed.
    from prophet import Prophet  # noqa: PLC0415

    m = Prophet(
        seasonality_mode="additive",
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=False,
        interval_width=0.80,
        uncertainty_samples=200,
    )
    m.fit(df[["ds", "y"]])

    future = m.make_future_dataframe(periods=max(HORIZONS), freq="D", include_history=False)
    fcst = m.predict(future)

    # Cumulative sum forward; "today" is fcst[0].
    cum = fcst[["yhat", "yhat_lower", "yhat_upper"]].cumsum()
    out: dict[int, dict[str, int]] = {}
    for h in HORIZONS:
        row = cum.iloc[h - 1]
        out[h] = {
            "forecast_units": max(int(round(row.yhat)), 0),
            "forecast_lower": max(int(round(row.yhat_lower)), 0),
            "forecast_upper": max(int(round(row.yhat_upper)), 0),
        }
    return out


def compute_reorder_point(sku: str, forecast: dict[int, dict[str, int]]) -> dict[str, Any]:
    """
    reorder_point  = lead_time_demand + safety_stock
    safety_stock   = Z * sigma * sqrt(lead_time)

    We approximate sigma per day from the 80% prediction interval
    width over the 60-day horizon.
    """
    lead_time = fetch_lead_time_days(sku) or 21

    f60 = forecast.get(60, {"forecast_units": 0, "forecast_lower": 0, "forecast_upper": 0})
    daily_mean = f60["forecast_units"] / 60.0
    daily_sigma = (f60["forecast_upper"] - f60["forecast_lower"]) / (60.0 * 2 * 1.282)
    # 1.282 is the z-score for an 80% interval, half-width.

    z = 1.645  # 95% service level
    safety_stock = int(round(z * daily_sigma * math.sqrt(lead_time))) if daily_sigma > 0 else 0
    lead_time_demand = int(round(daily_mean * lead_time))
    reorder_point = lead_time_demand + safety_stock
    recommended_qty = max(int(round(forecast[60]["forecast_units"])) , 0)

    return {
        "reorder_point": reorder_point,
        "safety_stock": safety_stock,
        "recommended_qty": recommended_qty,
        "service_level": DEFAULT_SERVICE_LEVEL,
        "lead_time_days": lead_time,
        "is_seasonal": False,
        "model_metadata": {"horizon": 60, "daily_mean": daily_mean, "daily_sigma": daily_sigma},
    }


# ---- tiny utility kept here so eval.py + db.py can share ----

def today() -> date:
    return datetime.utcnow().date()


def date_range(days_back: int) -> tuple[date, date]:
    end = today()
    start = end - timedelta(days=days_back)
    return start, end


# numpy isn't strictly needed here yet but tests will use it.
_ = np
