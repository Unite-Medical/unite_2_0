/**
 * Shipping rates — markup + comparison — PRD-27 §8.
 *
 * Pull live carrier rates, apply a configurable markup (default 10%, global
 * with optional per-distributor override), and present "Unite rate vs. your
 * account" so the distributor sees the trade-off before choosing. Third-party
 * billing charges their carrier account; the Unite rate adds a marked-up
 * freight line to their invoice.
 *
 * `applyMarkup` is the ONLY path that produces a distributor-facing shipping
 * price — raw carrier cost is never shown as the Unite rate.
 */

import { db } from './db.js';
import { shipstation } from './services.js';

export function markupPctFor(owner_org_id = null) {
  const rows = db.list('shipping_markup_config');
  const override = owner_org_id ? rows.find((r) => r.scope === 'distributor' && r.owner_org_id === owner_org_id) : null;
  const global = rows.find((r) => r.scope === 'global');
  return Number((override || global)?.markup_pct ?? 10);
}

export function applyMarkup(cost, owner_org_id = null) {
  const pct = markupPctFor(owner_org_id);
  return +(Number(cost || 0) * (1 + pct / 100)).toFixed(2);
}

export async function quoteRates({ weight_lbs = 12, from_zip = '30122', to_zip = '30301' } = {}) {
  const rates = await shipstation.getRates({ weight_lbs, from_zip, to_zip });
  return Array.isArray(rates) ? rates : (rates?.rates || []);
}

function estimateWeight(order) {
  const items = db.list('order_items', { where: { order_id: order.id } });
  return Math.max(2, +items.reduce((a, b) => a + (Number(b.qty) || 0) * 0.6, 0).toFixed(1));
}

/**
 * Side-by-side comparison for a distributor order: the marked-up Unite rate
 * vs. shipping on their own carrier account (third-party billed).
 */
export async function compareForDistributor(order, { to_zip = '30301' } = {}) {
  const owner = order.on_behalf_of_org_id || order.customer_id;
  const weight = estimateWeight(order);
  const rates = await quoteRates({ weight_lbs: weight, to_zip });
  const cheapest = rates.slice().sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0))[0];
  const carrierCost = Number(cheapest?.amount ?? 0);
  const accounts = db.list('distributor_carrier_accounts', { where: { owner_org_id: owner } });
  const acct = accounts.find((a) => a.is_default) || accounts[0] || null;
  return {
    weight_lbs: weight,
    markup_pct: markupPctFor(owner),
    carrier_label: cheapest?.label || 'FedEx Ground',
    options: [
      {
        kind: 'unite_rate',
        label: 'Unite rate',
        carrier: cheapest?.label || 'FedEx Ground',
        cost: applyMarkup(carrierCost, owner),
        bills: 'Added to your Unite invoice as freight',
      },
      {
        kind: 'third_party',
        label: 'Your carrier account',
        carrier: acct ? acct.carrier.toUpperCase() : 'your account',
        account: acct?.account_number || null,
        carrier_account_id: acct?.id || null,
        // The distributor's negotiated rate is on their carrier account; the
        // raw carrier cost is shown here as a stand-in (Unite's cost is hidden).
        cost: carrierCost,
        bills: 'Billed direct to your carrier (no charge to Unite)',
        available: Boolean(acct),
      },
    ],
  };
}

export const shippingRates = {
  markupPctFor,
  applyMarkup,
  quoteRates,
  compareForDistributor,
  setMarkup({ scope = 'global', owner_org_id = null, markup_pct, updated_by = null }) {
    const existing = db.list('shipping_markup_config', { where: { scope, owner_org_id } })[0]
      || db.list('shipping_markup_config').find((r) => r.scope === scope && (r.owner_org_id || null) === (owner_org_id || null));
    const patch = { scope, owner_org_id, markup_pct: Number(markup_pct), updated_by, updated_at: new Date().toISOString() };
    return existing ? db.update('shipping_markup_config', existing.id, patch)
      : db.insert('shipping_markup_config', { id: `smc_${scope}_${owner_org_id || 'global'}`, ...patch });
  },
};
