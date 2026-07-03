/**
 * Surplus brokerage — PRD-29 §5 pivot.
 *
 * Unite is a TRANSACTION BRIDGE, not a speculative buyer: sellers list
 * excess/expired/random inventory with a target price; Unite markets the
 * listing to buyers across multiple channels (medical, veterinary,
 * research, non-medical, overseas); a buyer offer + seller acceptance is
 * BINDING; Unite collects its technology-transfer fee UP FRONT, and only
 * then releases the connection (identities stay masked until the fee
 * clears). Both sides are tracked for the *optional* Unite direct-buy /
 * direct-sell path — broker is the default, speculative stock is not.
 *
 * Fee structure (Damon-approved, §5.3):
 *   · 10–15% on easy in-date lots (we mostly just connected)
 *   · 20–30% on hard-to-place inventory (expired, needs vet/research/
 *     export channel, regulatory hoops)
 *   · minimum fee floor per transaction
 *
 * Regulatory guardrail (§5.4.2): expired lots can never be sold into the
 * medical-use channel — the system enforces it, terms place compliance on
 * buyer + seller, and legal review gates launch.
 *
 * Listing data stays on the `surplus_lines` row (listed, target/ask);
 * buyer offers live in `surplus_offers` with the fee-escrow status flow:
 *   open → accepted (binding, fee_pending) → connected | declined
 */

import { db } from './db.js';
import { uid } from './format.js';
import { gmail } from './services.js';

/* ------------------------------------------------------------------ */
/* Buyer channels (§5.2.5)                                             */
/* ------------------------------------------------------------------ */

export const BUYER_CHANNELS = [
  { id: 'medical', label: 'Medical / clinical use', hard: false },
  { id: 'veterinary', label: 'Veterinary', hard: true },
  { id: 'research', label: 'Research / lab use', hard: true },
  { id: 'non_medical', label: 'Non-medical / industrial', hard: true },
  { id: 'overseas', label: 'Overseas / export', hard: true },
];

/* ------------------------------------------------------------------ */
/* Fee engine (§5.3)                                                   */
/* ------------------------------------------------------------------ */

const FEE_EASY_PCT = 0.125; // easy in-date lots (10–15% band)
const FEE_HARD_PCT = 0.25;  // hard-to-place (20–30% band)
const FEE_FLOOR_USD = 350;  // per-transaction minimum ($250–500 band)

/** Whether a lot/channel combination is "hard to place". */
export function isHardToPlace(line, channel = 'medical') {
  const expired = line?.condition === 'expired'
    || (line?.expiry_date && new Date(line.expiry_date) < new Date());
  const hardChannel = BUYER_CHANNELS.find((c) => c.id === channel)?.hard;
  return !!(expired || hardChannel);
}

/** Unite's technology-transfer fee for a transaction. */
export function brokerFee({ total, hard = false }) {
  const pct = hard ? FEE_HARD_PCT : FEE_EASY_PCT;
  return { pct, fee: +Math.max(total * pct, FEE_FLOOR_USD).toFixed(2) };
}

/* ------------------------------------------------------------------ */
/* Listings (seller side)                                              */
/* ------------------------------------------------------------------ */

/**
 * Publish a submission's lines as brokered listings. Default is ALL
 * usable lines (broker model) — the seller's target price is the ask.
 * Unite does NOT buy up front.
 */
export function publishSubmissionLines(submission_id) {
  const lines = db.list('surplus_lines', { where: { submission_id } });
  let published = 0;
  for (const l of lines) {
    if (l.listed) continue;
    const ask = Number(l.target_usd_per_unit)
      || Number(l.offer_usd_per_unit)
      || +(Number(l.est_retail_usd || 0) * 0.6).toFixed(2);
    if (!(ask > 0)) continue; // needs a seller target or valuation first
    db.update('surplus_lines', l.id, {
      listed: true,
      listed_at: new Date().toISOString(),
      ask_usd_per_unit: +ask.toFixed(2),
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

/** Open brokered listings (buyer view). */
export function listings() {
  return db.list('surplus_lines', { where: { listed: true, listing_status: 'open' }, orderBy: 'listed_at', dir: 'desc' });
}

/** Offers placed against a listing / submission. */
export function offersFor({ line_id, submission_id } = {}) {
  return db.list('surplus_offers', { orderBy: 'created_at', dir: 'desc' })
    .filter((o) => (!line_id || o.line_id === line_id) && (!submission_id || o.submission_id === submission_id));
}

/* ------------------------------------------------------------------ */
/* Offers (buyer side)                                                 */
/* ------------------------------------------------------------------ */

/** Buyer places an offer on a brokered listing. */
export function placeOffer({ line_id, buyer_name, buyer_email, buyer_org, buyer_channel = 'medical', offer_usd_per_unit, qty, message = '' }) {
  const line = db.get('surplus_lines', line_id);
  if (!line || !line.listed || line.listing_status !== 'open') {
    throw new Error('This listing is no longer available.');
  }
  if (!buyer_email?.trim()) throw new Error('Buyer email is required.');
  if (!BUYER_CHANNELS.some((c) => c.id === buyer_channel)) throw new Error('Select a buyer channel.');

  // §5.4.2 channel guardrail: expired product must NOT re-enter patient care.
  const expired = line.condition === 'expired'
    || (line.expiry_date && new Date(line.expiry_date) < new Date());
  if (expired && buyer_channel === 'medical') {
    throw new Error('This lot is expired and cannot be sold for medical/clinical use. Select a non-clinical channel (veterinary, research, non-medical, or export).');
  }

  const offerQty = Math.min(Number(qty) || line.qty, line.qty);
  const perUnit = Number(offer_usd_per_unit);
  if (!Number.isFinite(perUnit) || perUnit <= 0) throw new Error('Offer must be a positive $/unit.');

  const total = +(perUnit * offerQty).toFixed(2);
  const hard = isHardToPlace(line, buyer_channel);
  const { pct, fee } = brokerFee({ total, hard });

  const row = db.insert('surplus_offers', {
    id: uid('sof'),
    line_id,
    submission_id: line.submission_id,
    buyer_name: buyer_name?.trim() || buyer_email,
    buyer_email: buyer_email.trim().toLowerCase(),
    buyer_org: buyer_org?.trim() || null,
    buyer_channel,
    qty: offerQty,
    offer_usd_per_unit: +perUnit.toFixed(2),
    offer_usd_total: total,
    fee_pct: pct,
    fee_usd: fee,
    fee_status: 'not_due',
    message,
    status: 'open',
  });
  db.insert('audit_log', { id: uid('aud'), kind: 'surplus.offer_received', ref_id: row.id, payload: { line_id, total, channel: buyer_channel } });
  return row;
}

/* ------------------------------------------------------------------ */
/* The bridge: binding acceptance → fee up front → connection released */
/* ------------------------------------------------------------------ */

/**
 * Seller (via the surplus desk) accepts an offer — the deal is BINDING and
 * Unite's fee comes due. Identities stay masked; the connection is NOT
 * released until the fee clears (§5.1 safety gate).
 */
export async function acceptOffer(offer_id) {
  const offer = db.get('surplus_offers', offer_id);
  if (!offer) throw new Error('Offer not found.');
  const line = db.get('surplus_lines', offer.line_id);
  db.update('surplus_offers', offer_id, {
    status: 'accepted',
    fee_status: 'fee_pending',
    decided_at: new Date().toISOString(),
  });
  if (line) db.update('surplus_lines', line.id, { listing_status: 'pending_fee', sold_offer_id: offer_id });
  // Decline competing open offers on the same lot.
  offersFor({ line_id: offer.line_id })
    .filter((o) => o.id !== offer_id && o.status === 'open')
    .forEach((o) => db.update('surplus_offers', o.id, { status: 'declined', decided_at: new Date().toISOString() }));

  await gmail.send({
    to: offer.buyer_email,
    from: 'surplus@unitemedical.net',
    subject: `Offer accepted · ${line?.normalized_name || line?.raw_description || 'surplus listing'} — bridge fee invoice`,
    body: `${(offer.buyer_name || '').split(' ')[0] || 'Hi'} —\n\nThe seller accepted your offer of $${offer.offer_usd_per_unit.toFixed(2)}/unit × ${offer.qty} ($${offer.offer_usd_total.toLocaleString()}). The deal is now binding.\n\nUnite's connection fee for this transaction is $${offer.fee_usd.toLocaleString()} (${Math.round(offer.fee_pct * 100)}%), due before we connect you with the seller. Once the fee clears, we release contact details to both sides and you settle the goods directly.\n\nUnite doesn't want to stand in the way of you moving product — we earn a transparent fee for the connection, and we can also handle freight, compliance docs, and payments if you want them.\n\n— Unite Medical Surplus Desk`,
    template_key: 'surplus/fee_invoice',
    drafted_by: 'system',
  });
  return db.get('surplus_offers', offer_id);
}

/**
 * Fee cleared → release the connection: both sides get each other's
 * contact details and settle the goods directly.
 */
export async function confirmFeePaid(offer_id) {
  const offer = db.get('surplus_offers', offer_id);
  if (!offer) throw new Error('Offer not found.');
  if (offer.status !== 'accepted') throw new Error('Offer is not in the accepted (fee pending) state.');
  const line = db.get('surplus_lines', offer.line_id);
  const submission = line ? db.get('surplus_submissions', line.submission_id) : null;

  db.update('surplus_offers', offer_id, {
    fee_status: 'fee_paid',
    status: 'connected',
    connected_at: new Date().toISOString(),
  });
  if (line) db.update('surplus_lines', line.id, { listing_status: 'connected' });
  db.insert('audit_log', { id: uid('aud'), kind: 'surplus.connected', ref_id: offer_id, payload: { fee_usd: offer.fee_usd } });

  const itemName = line?.normalized_name || line?.raw_description || 'surplus listing';
  await gmail.send({
    to: offer.buyer_email,
    from: 'surplus@unitemedical.net',
    subject: `Connection released · ${itemName}`,
    body: `Fee received — you're connected.\n\nSeller: ${submission?.hospital_name || 'the seller'} · ${submission?.contact_name || ''} · ${submission?.contact_email || 'contact shared separately'}\n\nSettle the goods directly. If you'd like Unite to handle freight, compliance documentation, or payment escrow, reply to this email.\n\n— Unite Medical Surplus Desk`,
    template_key: 'surplus/connection_released',
    drafted_by: 'system',
  });
  if (submission?.contact_email) {
    await gmail.send({
      to: submission.contact_email,
      from: 'surplus@unitemedical.net',
      subject: `Buyer connected · ${itemName}`,
      body: `${submission.contact_name?.split(' ')[0] || 'Hi'} —\n\nYour listing sold: $${offer.offer_usd_per_unit.toFixed(2)}/unit × ${offer.qty} ($${offer.offer_usd_total.toLocaleString()}).\n\nBuyer: ${offer.buyer_org || offer.buyer_name} · ${offer.buyer_email}\n\nSettle the goods directly with the buyer. If you'd like Unite to handle freight, compliance documentation, or payment escrow, reply to this email.\n\n— Unite Medical Surplus Desk`,
      template_key: 'surplus/connection_released_seller',
      drafted_by: 'system',
    });
  }
  return db.get('surplus_offers', offer_id);
}

export function declineOffer(offer_id) {
  db.update('surplus_offers', offer_id, { status: 'declined', decided_at: new Date().toISOString() });
}
