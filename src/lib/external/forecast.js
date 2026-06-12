/**
 * Prophet forecasting sidecar client — PRD-12 Phase 2.
 *
 * The Python FastAPI service in forecasting/ fits per-SKU Prophet
 * models and persists 30/60/90-day horizons + reorder points to
 * Postgres. This client reaches it through the backend proxy:
 *
 *   browser → ${API_BASE}/proxy/forecast/*  → ${FORECAST_API_URL}/*
 *
 * Sidecar endpoints:
 *   GET  /health
 *   GET  /forecast/{sku}        → { sku, horizons: [{horizon_days, forecast_units, ...}] }
 *   POST /forecast/run/{sku}    → { sku, horizons, reorder_point }
 *   POST /forecast/run          → { ok, run_id, queued }
 *
 * Stub fallback: when the sidecar isn't deployed (FORECAST_API_URL
 * unset → proxy 503s), we synthesize Prophet-shaped horizons from the
 * same trailing run rate the client model uses, so the replenishment
 * UI renders identically either way.
 */

import { db } from '../db.js';
import { delay } from '../format.js';
import { API_BASE, fetchJson, realOrStub } from './_http.js';

function viaBackendProxy() {
  return Boolean(API_BASE);
}

async function callSidecar({ method = 'GET', path }) {
  return fetchJson(`${API_BASE}/proxy/forecast${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Run-rate-derived stand-in for a Prophet horizon set. */
function stubHorizons(sku) {
  const cutoff = Date.now() - 90 * 86400000;
  const orderIds = new Set(
    db.list('orders')
      .filter((o) => new Date(o.placed_at || o.created_at || 0).getTime() >= cutoff && o.status !== 'cancelled')
      .map((o) => o.id),
  );
  let units = 0;
  for (const li of db.list('order_items', { where: { sku } })) {
    if (orderIds.has(li.order_id)) units += Number(li.qty) || 0;
  }
  const daily = units / 90;
  return [30, 60, 90].map((h) => ({
    horizon_days: h,
    forecast_units: Math.round(daily * h),
    forecast_lower: Math.round(daily * h * 0.7),
    forecast_upper: Math.round(daily * h * 1.3),
    generated_at: new Date().toISOString(),
    stub: true,
  }));
}

export const forecast = {
  /** Sidecar liveness — used by /admin/integrations. */
  async health() {
    return realOrStub({
      scope: 'forecast',
      label: 'health',
      predicate: () => viaBackendProxy(),
      real: () => callSidecar({ path: '/health' }),
      stub: async () => ({ ok: false, stub: true, reason: 'sidecar_not_deployed' }),
    });
  },

  /** Latest persisted horizons for one SKU. */
  async getForecast(sku) {
    return realOrStub({
      scope: 'forecast',
      label: `getForecast ${sku}`,
      predicate: () => viaBackendProxy(),
      real: () => callSidecar({ path: `/forecast/${encodeURIComponent(sku)}` }),
      stub: async () => {
        await delay(60, 140);
        return { sku, horizons: stubHorizons(sku), stub: true };
      },
    });
  },

  /**
   * Horizons for many SKUs at once, shaped for the replenishment
   * engine: { [sku]: { daily_mean, h30, h60, h90, source } }.
   * Missing SKUs (404 = never forecast) are skipped so the run-rate
   * model covers them.
   */
  async getForecastMap(skus) {
    const out = {};
    await Promise.all(skus.map(async (sku) => {
      try {
        const resp = await this.getForecast(sku);
        const h60 = (resp.horizons || []).find((h) => h.horizon_days === 60);
        if (!h60) return;
        out[sku] = {
          daily_mean: h60.forecast_units / 60,
          horizons: resp.horizons,
          source: resp.stub || h60.stub ? 'run-rate-stub' : 'prophet',
        };
      } catch {
        // 404 (no forecast yet) or sidecar down — run-rate covers it.
      }
    }));
    return out;
  },

  /** Trigger a single-SKU model fit on the sidecar. */
  async runOne(sku) {
    return realOrStub({
      scope: 'forecast',
      label: `runOne ${sku}`,
      predicate: () => viaBackendProxy(),
      real: () => callSidecar({ method: 'POST', path: `/forecast/run/${encodeURIComponent(sku)}` }),
      stub: async () => {
        await delay(300, 700);
        return { sku, horizons: stubHorizons(sku), stub: true };
      },
    });
  },

  /** Kick off a full-catalog forecast run (background on the sidecar). */
  async runAll() {
    return realOrStub({
      scope: 'forecast',
      label: 'runAll',
      predicate: () => viaBackendProxy(),
      real: () => callSidecar({ method: 'POST', path: '/forecast/run' }),
      stub: async () => {
        await delay(300, 700);
        return { ok: true, run_id: `stub-${Date.now()}`, queued: true, stub: true };
      },
    });
  },

  __isConfigured: () => viaBackendProxy(),
};
