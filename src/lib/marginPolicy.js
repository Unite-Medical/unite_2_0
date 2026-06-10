/**
 * Margin policy — PRD-08 Phase 4.
 *
 * Defaults live here in code; admin overrides land in
 * localStorage under `um.margin_policy.v1` (will move to a Postgres
 * row in `org_settings` once PRD-01 ships).
 */

const STORAGE_KEY = 'um.margin_policy.v1';

export const DEFAULT_MARGIN_POLICY = {
  // Per-tier target margin (decimal, 0..1). E.g. 0.30 means 30% margin.
  tiers: {
    A:           0.30,  // large hospital / gov / retail
    B:           0.50,  // mid ASC / regional dealer
    C:           0.60,  // small clinic / one-off (legacy default)
    distributor: 0.25,  // volume — lower margin, higher velocity
    gov:         0.20,  // VA/BPA contract pricing
  },
  // Quote validity window (days from issue).
  quote_validity_days: 14,
  // Whether the customer sees the landed-cost breakdown on the quote PDF.
  expose_landed_cost: false,
};

export function loadMarginPolicy() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MARGIN_POLICY;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_MARGIN_POLICY,
      ...parsed,
      tiers: { ...DEFAULT_MARGIN_POLICY.tiers, ...(parsed.tiers || {}) },
    };
  } catch {
    return DEFAULT_MARGIN_POLICY;
  }
}

export function saveMarginPolicy(policy) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
}

/** Resolve target margin for a customer tier; defaults to C (60%). */
export function marginForTier(tier, policy = loadMarginPolicy()) {
  if (!tier) return policy.tiers.C;
  return policy.tiers[tier] ?? policy.tiers.C;
}

/** Apply margin to a landed cost: sell = landed / (1 - margin). */
export function applyMargin(landedCost, margin) {
  if (!Number.isFinite(landedCost) || landedCost <= 0) return 0;
  const m = Math.min(0.95, Math.max(0, margin));
  return +(landedCost / (1 - m)).toFixed(2);
}
