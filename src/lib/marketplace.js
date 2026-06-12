/**
 * Surplus marketplace — brief §8 "Longer-term: build a private
 * surplus marketplace".
 *
 * Phase 1 (live here): one-sided intake (sell to Unite) at /surplus.
 * Phase 2 (this module): accepted lots can be PUBLISHED — approved
 * buyers browse /surplus/market and place offers; admin accepts or
 * declines from the surplus console. Brokerage spread = ask − cost.
 *
 * Listing data stays on the `surplus_lines` row (listed, ask price);
 * buyer offers live in `surplus_offers`.
 */

import { db } from './db.js';
import { uid } from './format.js';
import { gmail } from './services.js';

const DEFAULT_BROKERAGE_MARKUP = 1.35; // 35% over our buy price

/** Publish a submission's "want" lines to the marketplace. */
export function publishSubmissionLines(submission_id, { markup = DEFAULT_BROKERAGE_MARKUP } = {}) {
  const lines = db.list('surplus_lines', { where: { submission_id, decision: 'want' } });
  let published = 0;
  for (const l of lines) {
    if (l.listed) continue;
    const cost = Number(l.offer_usd_per_unit) || 0;
    const ask = cost > 0 ? +(cost * markup).toFixed(2) : +(Number(l.est_retail_usd || 0) * 0.6).toFixed(2);
    db.update('surplus_lines', l.id, {
      listed: true,
      listed_at: new Date().toISOString(),
      ask_usd_per_unit: ask,
      listing_status: 'open',
    });
    published += 1;
  }
  if (published > 0) {
    db.insert('audit_log', { id: uid('aud'), kind: 'surplus.published', ref_id: submission_id, payload: { lines: published } });
  }
  return { published };
}

export function unlist(line_id) {
  db.update('surplus_lines', line_id, { listed: false, listing_status: 'withdrawn' });
}

/** Open marketplace listings (buyer view). */
export function listings() {
  return db.list('surplus_lines', { where: { listed: true, listing_status: 'open' }, orderBy: 'listed_at', dir: 'desc' });
}

/** Offers placed against a listing / submission. */
export function offersFor({ line_id, submission_id } = {}) {
  return db.list('surplus_offers', { orderBy: 'created_at', dir: 'desc' })
    .filter((o) => (!line_id || o.line_id === line_id) && (!submission_id || o.submission_id === submission_id));
}

/** Buyer places an offer on a listed lot. */
export function placeOffer({ line_id, buyer_name, buyer_email, buyer_org, offer_usd_per_unit, qty, message = '' }) {
  const line = db.get('surplus_lines', line_id);
  if (!line || !line.listed || line.listing_status !== 'open') {
    throw new Error('This lot is no longer available.');
  }
  if (!buyer_email?.trim()) throw new Error('Buyer email is required.');
  const offerQty = Math.min(Number(qty) || line.qty, line.qty);
  const perUnit = Number(offer_usd_per_unit);
  if (!Number.isFinite(perUnit) || perUnit <= 0) throw new Error('Offer must be a positive $/unit.');

  const row = db.insert('surplus_offers', {
    id: uid('sof'),
    line_id,
    submission_id: line.submission_id,
    buyer_name: buyer_name?.trim() || buyer_email,
    buyer_email: buyer_email.trim().toLowerCase(),
    buyer_org: buyer_org?.trim() || null,
    qty: offerQty,
    offer_usd_per_unit: +perUnit.toFixed(2),
    offer_usd_total: +(perUnit * offerQty).toFixed(2),
    message,
    status: 'open',
  });
  db.insert('audit_log', { id: uid('aud'), kind: 'surplus.offer_received', ref_id: row.id, payload: { line_id, total: row.offer_usd_total } });
  return row;
}

/** Admin accepts an offer — lot goes pending, buyer gets the email. */
export async function acceptOffer(offer_id) {
  const offer = db.get('surplus_offers', offer_id);
  if (!offer) throw new Error('Offer not found.');
  const line = db.get('surplus_lines', offer.line_id);
  db.update('surplus_offers', offer_id, { status: 'accepted', decided_at: new Date().toISOString() });
  if (line) db.update('surplus_lines', line.id, { listing_status: 'pending_fulfillment', sold_offer_id: offer_id });
  // Decline competing open offers on the same lot.
  offersFor({ line_id: offer.line_id })
    .filter((o) => o.id !== offer_id && o.status === 'open')
    .forEach((o) => db.update('surplus_offers', o.id, { status: 'declined', decided_at: new Date().toISOString() }));

  await gmail.send({
    to: offer.buyer_email,
    from: 'surplus@unitemedical.net',
    subject: `Offer accepted · ${line?.normalized_name || line?.raw_description || 'surplus lot'}`,
    body: `${(offer.buyer_name || '').split(' ')[0] || 'Hi'} —\n\nYour offer of $${offer.offer_usd_per_unit.toFixed(2)}/unit × ${offer.qty} ($${offer.offer_usd_total.toLocaleString()}) is accepted.\n\nNext: our logistics desk emails the BOL + Net-30 invoice today. Freight quotes on request.\n\n— Unite Medical Surplus Desk`,
    template_key: 'surplus/offer_accepted',
    drafted_by: 'system',
  });
  return db.get('surplus_offers', offer_id);
}

export function declineOffer(offer_id) {
  db.update('surplus_offers', offer_id, { status: 'declined', decided_at: new Date().toISOString() });
}
