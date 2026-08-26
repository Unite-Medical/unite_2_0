/**
 * Commercial policy invariants shared by quote serialization and pricing.
 * Restricted fields must be projected out before a sales-facing response is built.
 */

export const MINIMUM_GROSS_MARGIN = 0.30;

const COST_VISIBLE_ROLES = new Set(['owner', 'admin', 'finance', 'procurement']);
const RESTRICTED_KEYS = new Set([
  'vendor', 'vendor_id', 'vendor_name', 'vendor_contact', 'vendor_email',
  'vendor_cost', 'unit_cost', 'fob', 'fob_effective', 'landed_cost',
  'landed_per_unit', 'cost_components', 'duty_components', 'margin_target',
  'margin_pct', 'margin_floored', 'internal_freight_breakdown',
  'internal_approval_notes', 'approval_notes', 'override_reason',
]);

export function minimumSellPrice(landedCost, margin = MINIMUM_GROSS_MARGIN) {
  const landed = Number(landedCost);
  if (!Number.isFinite(landed) || landed <= 0) return 0;
  const safeMargin = Math.min(0.95, Math.max(MINIMUM_GROSS_MARGIN, Number(margin) || 0));
  return +(landed / (1 - safeMargin)).toFixed(2);
}

export function vendorPriceStatus(offer = {}, now = new Date()) {
  const validUntil = offer.valid_until || offer.fob_price_valid_until || offer.price_valid_until || null;
  if (!validUntil) return { reusable: false, reason: 'missing_validity', valid_until: null };
  const expiresAt = new Date(validUntil);
  if (Number.isNaN(expiresAt.getTime())) return { reusable: false, reason: 'invalid_validity', valid_until: validUntil };
  return expiresAt.getTime() > now.getTime()
    ? { reusable: true, reason: 'current', valid_until: validUntil }
    : { reusable: false, reason: 'expired', valid_until: validUntil };
}

function stripRestricted(value) {
  if (Array.isArray(value)) return value.map(stripRestricted);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !RESTRICTED_KEYS.has(key))
      .map(([key, child]) => [key, stripRestricted(child)]),
  );
}

export function canViewCommercialCosts(actor = {}) {
  return actor?.can_view_costs === true || COST_VISIBLE_ROLES.has(actor?.role);
}

export function resolveQuoteView(requestedView, actor = {}) {
  return requestedView === 'internal' && canViewCommercialCosts(actor) ? 'internal' : 'customer';
}

export function projectCommercialRecord(record, actor = {}) {
  if (!record || typeof record !== 'object') return record;
  return canViewCommercialCosts(actor) ? structuredClone(record) : stripRestricted(record);
}
