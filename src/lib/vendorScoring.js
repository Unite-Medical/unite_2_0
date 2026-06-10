/**
 * Vendor scoring engine — PRD-07 §4.
 *
 * Score a candidate vendor against openFDA registration, recall
 * history, device classes, country of origin, and (optionally)
 * ImportGenius volume signal.
 *
 * Returns:
 *   { decision: 'AUTO_APPROVE' | 'MANUAL_REVIEW' | 'AUTO_REJECT',
 *     score: number,
 *     components: { name, points, detail }[],
 *     evidence: {…raw API payloads},
 *   }
 *
 * The scoring weights live in CONFIG so they're configurable via
 * `/admin/settings/vendor-scoring` in a future phase.
 */

import { openfda } from './external/openfda.js';

// Default config — adjustable in the admin UI later.
export const VENDOR_SCORING_CONFIG = {
  weights: {
    fda_registered_active: +30,
    recall_per_event_24mo: -10,
    class_iii_device: -5,         // per Class III in the listing
    high_watch_country: -5,
    business_age_5y_plus: +5,
    class_i_recall_5y: -20,
    importgenius_volume_100k_plus: +5,
  },
  thresholds: {
    auto_approve_min: 35,
  },
  // Per PRD-07 §10.2 — this list is something Damon should commit.
  // Empty for v1; everything goes to MANUAL_REVIEW until you sign off.
  high_watch_countries: new Set([]),
  // Per PRD-07 §10.1 — Class III defaults to AUTO_REJECT for v1.
  // Flip to false if Damon wants to allow Class III with manual review.
  reject_class_iii: true,
};

const TWO_YEARS_DAYS = 730;
const FIVE_YEARS_DAYS = 1825;

/**
 * Run the scoring engine against a candidate vendor.
 *
 * @param {object} candidate
 * @param {string} candidate.name                Manufacturer / vendor name
 * @param {string} [candidate.fei_number]        FEI number if known
 * @param {string} [candidate.country_of_origin] ISO-2 country code
 * @param {number} [candidate.business_age_years]
 * @param {number} [candidate.importgenius_annual_usd]  Annual import volume to US
 * @param {string[]} [candidate.device_classes]  Optional override (else queried)
 * @param {typeof VENDOR_SCORING_CONFIG} [config]
 *
 * @returns {Promise<{decision, score, components, evidence}>}
 */
export async function evaluateVendor(candidate, config = VENDOR_SCORING_CONFIG) {
  const components = [];
  const evidence = {};
  let score = 0;

  // 1) openFDA registration status
  const reg = await openfda.registrationListing(candidate.fei_number || candidate.name);
  evidence.registration = reg;
  const isRegistered = (reg?.results?.length || 0) > 0;
  if (isRegistered) {
    score += config.weights.fda_registered_active;
    components.push({
      name: 'FDA registration active',
      points: config.weights.fda_registered_active,
      detail: reg.results[0]?.registration_number || 'registered',
    });
  } else {
    components.push({
      name: 'FDA registration active',
      points: 0,
      detail: 'no active registration found — AUTO_REJECT',
    });
    return {
      decision: 'AUTO_REJECT',
      score,
      components,
      evidence,
      reason: 'No active FDA registration',
    };
  }

  // 2) Recall history — 24 months
  const recalls24 = await openfda.recallHistory(candidate.name, TWO_YEARS_DAYS);
  evidence.recalls_24mo = recalls24;
  const recallCount24 = recalls24?.meta?.results?.total ?? recalls24?.results?.length ?? 0;
  if (recallCount24 > 0) {
    const penalty = recallCount24 * config.weights.recall_per_event_24mo;
    score += penalty;
    components.push({
      name: `Recalls (24mo): ${recallCount24}`,
      points: penalty,
      detail: `${recallCount24} recall event(s) in last 24 months`,
    });
  } else {
    components.push({
      name: 'Recalls (24mo): 0',
      points: 0,
      detail: 'clean record',
    });
  }

  // 3) Class I recall in last 12 months → AUTO_REJECT
  const class1Recalls = (recalls24?.results || []).filter(
    (r) => /class\s*i\b/i.test(r.classification || '') && !/class\s*ii\b/i.test(r.classification || ''),
  );
  const recentClass1 = class1Recalls.filter((r) => {
    const date = r.event_date_initiated || r.report_date;
    if (!date) return false;
    const dt = new Date(date);
    return Date.now() - dt.getTime() < 365 * 86400000;
  });
  if (recentClass1.length > 0) {
    return {
      decision: 'AUTO_REJECT',
      score,
      components: [...components, {
        name: 'Class I recall in last 12mo',
        points: 0,
        detail: `${recentClass1.length} Class I recall(s) — AUTO_REJECT`,
      }],
      evidence,
      reason: 'Class I recall in last 12 months',
    };
  }

  // 4) Class I recall in last 5 years (penalty, not reject)
  const recalls5y = await openfda.recallHistory(candidate.name, FIVE_YEARS_DAYS);
  evidence.recalls_5y = recalls5y;
  const class1Within5y = (recalls5y?.results || []).filter(
    (r) => /class\s*i\b/i.test(r.classification || '') && !/class\s*ii\b/i.test(r.classification || ''),
  );
  if (class1Within5y.length > 0 && recentClass1.length === 0) {
    score += config.weights.class_i_recall_5y;
    components.push({
      name: 'Class I recall (5y window)',
      points: config.weights.class_i_recall_5y,
      detail: `${class1Within5y.length} Class I recall(s) in last 5 years`,
    });
  }

  // 5) Device classes
  const deviceClasses = candidate.device_classes
    || (reg.results || []).flatMap((r) => (r.products || []).map((p) => p.openfda?.device_class || p.device_class).filter(Boolean));
  const class3Count = deviceClasses.filter((c) => String(c) === '3').length;
  if (class3Count > 0 && config.reject_class_iii) {
    return {
      decision: 'AUTO_REJECT',
      score,
      components: [...components, {
        name: 'Class III devices',
        points: 0,
        detail: `${class3Count} Class III device(s) — AUTO_REJECT per policy`,
      }],
      evidence,
      reason: 'Class III device in product listing (current policy: reject)',
    };
  }
  if (class3Count > 0) {
    const penalty = class3Count * config.weights.class_iii_device;
    score += penalty;
    components.push({
      name: 'Class III devices',
      points: penalty,
      detail: `${class3Count} Class III device(s)`,
    });
  }

  // 6) Country of origin
  if (candidate.country_of_origin && config.high_watch_countries.has(candidate.country_of_origin)) {
    score += config.weights.high_watch_country;
    components.push({
      name: 'High-watch country',
      points: config.weights.high_watch_country,
      detail: candidate.country_of_origin,
    });
  }

  // 7) Business age
  if (typeof candidate.business_age_years === 'number' && candidate.business_age_years >= 5) {
    score += config.weights.business_age_5y_plus;
    components.push({
      name: 'Business age ≥ 5 years',
      points: config.weights.business_age_5y_plus,
      detail: `${candidate.business_age_years} years`,
    });
  }

  // 8) ImportGenius volume — PRD-08 dependency
  if (typeof candidate.importgenius_annual_usd === 'number' && candidate.importgenius_annual_usd >= 100000) {
    score += config.weights.importgenius_volume_100k_plus;
    components.push({
      name: 'Import volume signal',
      points: config.weights.importgenius_volume_100k_plus,
      detail: `~$${Math.round(candidate.importgenius_annual_usd).toLocaleString()}/yr`,
    });
  }

  const decision = score >= config.thresholds.auto_approve_min ? 'AUTO_APPROVE' : 'MANUAL_REVIEW';
  return { decision, score, components, evidence };
}
