"""Forecasting sidecar — FastAPI entry point (PRD-12 Phase 1)."""

from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import BackgroundTasks, FastAPI, HTTPException

from . import __version__
from .forecaster import (
    compute_reorder_point,
    fit_and_forecast,
    list_skus_to_forecast,
)
from .db import (
    fetch_latest_forecast,
    persist_forecast,
    persist_reorder_point,
    record_run_finished,
    record_run_started,
)

app = FastAPI(
    title="Unite Medical · Forecasting",
    version=__version__,
    description="Per-SKU demand forecasting sidecar. See docs/prds/PRD-12.",
)

STARTED_AT = datetime.now(timezone.utc).isoformat()


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "version": __version__,
        "started_at": STARTED_AT,
        "sha": os.environ.get("GIT_SHA", "dev"),
    }


@app.get("/forecast/{sku}")
def get_forecast(sku: str) -> dict:
    rows = fetch_latest_forecast(sku)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No forecast yet for SKU {sku}")
    return {"sku": sku, "horizons": rows}


@app.post("/forecast/run/{sku}")
def run_one(sku: str) -> dict:
    run_id = record_run_started()
    try:
        result = fit_and_forecast(sku)
        for horizon, point in result.items():
            persist_forecast(sku=sku, run_id=run_id, horizon_days=horizon, **point)
        rp = compute_reorder_point(sku, result)
        persist_reorder_point(sku=sku, **rp)
        record_run_finished(run_id=run_id, status="ok", sku_count=1)
        return {"sku": sku, "horizons": result, "reorder_point": rp}
    except Exception as e:
        record_run_finished(run_id=run_id, status="failed", errors={"sku": sku, "msg": str(e)})
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/forecast/run")
def run_all(background: BackgroundTasks) -> dict:
    """Kick off a full-catalog forecast run in the background."""
    run_id = record_run_started()
    background.add_task(_run_all_inner, run_id)
    return {"ok": True, "run_id": run_id, "queued": True}


def _run_all_inner(run_id: str) -> None:
    skus = list_skus_to_forecast()
    errors: list[dict] = []
    for sku in skus:
        try:
            result = fit_and_forecast(sku)
            for horizon, point in result.items():
                persist_forecast(sku=sku, run_id=run_id, horizon_days=horizon, **point)
            rp = compute_reorder_point(sku, result)
            persist_reorder_point(sku=sku, **rp)
        except Exception as e:  # noqa: BLE001
            errors.append({"sku": sku, "msg": str(e)})
    record_run_finished(
        run_id=run_id,
        status="partial" if errors else "ok",
        sku_count=len(skus) - len(errors),
        errors={"items": errors} if errors else None,
    )
