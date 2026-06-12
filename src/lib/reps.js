/**
 * 1099 rep system — brief §2 priority #5 + §5.
 *
 * "Scale reps nationally with full visibility from home office."
 *
 * The roster lives in the `reps` table. Commissions are computed live
 * from orders: each order's org carries `account_rep`, so attribution
 * follows the account. Activity visibility joins Fathom call logs,
 * Calendly bookings, and CRM pipeline per rep.
 *
 * Payout rail: Stripe Connect transfers (per the brief) —
 * `payCommission` provisions an Express connected account on first
 * payout, transfers the commission, and records it in `rep_payouts`.
 * Stubbed transfers (no STRIPE_SECRET_KEY) follow the same path so
 * the ledger and UI behave identically.
 */

import { db } from './db.js';
import { uid } from './format.js';
import { gmail, calendly, stripe } from './services.js';

/** Orders attributed to a rep (via org.account_rep) in a window. */
export function repOrders(repName, { sinceDays = 30 } = {}) {
  const cutoff = new Date(Date.now() - sinceDays * 86400000).toISOString();
  const orgIds = new Set(
    db.list('organizations', { where: { account_rep: repName } }).map((o) => o.id),
  );
  return db.list('orders').filter((o) => orgIds.has(o.customer_id) && (o.placed_at || o.created_at) >= cutoff);
}

/**
 * Commission statement for one rep.
 *
 * @returns {{ rep, orders, gross_usd, commission_usd, accounts }}
 */
export function commissionFor(rep, { sinceDays = 30 } = {}) {
  const orders = repOrders(rep.name, { sinceDays });
  const gross = orders.reduce((a, o) => a + (o.total || 0), 0);
  const commission = +(gross * (rep.commission_pct / 100)).toFixed(2);
  const accounts = db.list('organizations', { where: { account_rep: rep.name } });
  return {
    rep,
    orders,
    order_count: orders.length,
    gross_usd: +gross.toFixed(2),
    commission_usd: commission,
    accounts,
  };
}

/** Full network rollup for /admin/reps. */
export function networkRollup({ sinceDays = 30 } = {}) {
  const reps = db.list('reps', { orderBy: 'name' });
  const statements = reps.map((r) => commissionFor(r, { sinceDays }));
  return {
    statements,
    totals: {
      gross_usd: +statements.reduce((a, s) => a + s.gross_usd, 0).toFixed(2),
      commission_usd: +statements.reduce((a, s) => a + s.commission_usd, 0).toFixed(2),
      order_count: statements.reduce((a, s) => a + s.order_count, 0),
    },
  };
}

/** Recent rep activity: Fathom calls + Calendly bookings + CRM notes. */
export function repActivity(rep, { limit = 8 } = {}) {
  const byWho = db.list('activities', { orderBy: 'created_at', dir: 'desc' })
    .filter((a) => a.who === rep.name || a.who === rep.email);
  return byWho.slice(0, limit);
}

/**
 * Email a monthly commission statement to the rep (Gmail API when the
 * Google grant is configured; outbox queue otherwise) and log it.
 */
export async function sendCommissionStatement(rep, { sinceDays = 30 } = {}) {
  const stmt = commissionFor(rep, { sinceDays });
  const lines = stmt.orders
    .map((o) => `  ${o.id} · ${o.customer_name} · $${(o.total || 0).toLocaleString()}`)
    .join('\n');
  const body = [
    `Hi ${rep.name.split(' ')[0]},`,
    '',
    `Commission statement for the last ${sinceDays} days:`,
    '',
    `Orders (${stmt.order_count}):`,
    lines || '  (none in window)',
    '',
    `Gross attributed revenue: $${stmt.gross_usd.toLocaleString()}`,
    `Commission @ ${rep.commission_pct}%: $${stmt.commission_usd.toLocaleString()}`,
    '',
    'Payout lands via Stripe by the 5th. Questions → reply here.',
    '',
    '— Unite Medical',
  ].join('\n');

  const msg = await gmail.send({
    to: rep.email,
    subject: `Commission statement · $${stmt.commission_usd.toLocaleString()}`,
    body,
    from: 'finance@unitemedical.net',
    template_key: 'rep/commission_statement',
    drafted_by: 'system',
  });
  db.insert('audit_log', { id: uid('aud'), kind: 'rep.statement_sent', ref_id: rep.id, payload: { commission_usd: stmt.commission_usd, outbox_id: msg.id } });
  return { statement: stmt, message: msg };
}

/**
 * Pay a rep's commission via Stripe Connect.
 *
 * 1. Provisions an Express connected account on first payout (stored
 *    on the rep row as `stripe_account_id`).
 * 2. Transfers the commission to that account.
 * 3. Writes a `rep_payouts` ledger row + audit entry, and emails the
 *    statement so the rep gets paper trail alongside the money.
 *
 * Already-paid orders (covered by a prior payout window) are the
 * caller's concern — pass `sinceDays` to scope the statement window.
 */
export async function payCommission(rep, { sinceDays = 30 } = {}) {
  const stmt = commissionFor(rep, { sinceDays });
  if (stmt.commission_usd <= 0) {
    return { ok: false, reason: 'nothing_to_pay', statement: stmt };
  }

  // 1) connected account (provision once, persist on the rep row)
  let accountId = rep.stripe_account_id;
  let onboarding_url = null;
  if (!accountId) {
    const acct = await stripe.createConnectedAccount({ rep });
    accountId = acct.id;
    db.update('reps', rep.id, { stripe_account_id: accountId });
    const link = await stripe.createAccountLink({ stripe_account_id: accountId });
    onboarding_url = link?.url || null;
  }

  // 2) transfer
  const transfer = await stripe.createTransfer({
    stripe_account_id: accountId,
    amount: stmt.commission_usd,
    metadata: {
      unite_rep_id: rep.id,
      window_days: sinceDays,
      order_count: stmt.order_count,
      gross_usd: stmt.gross_usd,
    },
  });

  // 3) ledger + audit + statement email
  const payout = db.insert('rep_payouts', {
    id: uid('pay'),
    rep_id: rep.id,
    rep_name: rep.name,
    stripe_account_id: accountId,
    stripe_transfer_id: transfer.id,
    amount_usd: stmt.commission_usd,
    gross_usd: stmt.gross_usd,
    order_count: stmt.order_count,
    window_days: sinceDays,
    status: transfer.stub ? 'simulated' : 'paid',
    paid_at: new Date().toISOString(),
  });
  db.insert('audit_log', {
    id: uid('aud'),
    kind: 'rep.commission_paid',
    ref_id: rep.id,
    payload: { transfer_id: transfer.id, amount_usd: stmt.commission_usd, simulated: Boolean(transfer.stub) },
  });
  await sendCommissionStatement(rep, { sinceDays });

  return { ok: true, payout, transfer, onboarding_url, statement: stmt };
}

/** Payout history for one rep (or all reps when rep is null). */
export function payoutHistory(rep = null, { limit = 20 } = {}) {
  const query = { orderBy: 'paid_at', dir: 'desc', limit };
  if (rep) query.where = { rep_id: rep.id };
  return db.list('rep_payouts', query);
}

/** Single-use Calendly booking link for a rep intro (falls back to the
 *  rep's standing link in stub mode). */
export async function bookingLinkFor(rep) {
  try {
    const types = await calendly.listEventTypes();
    const intro = types.find((t) => /intro/i.test(t.name)) || types[0];
    if (intro?.uri && !String(intro.uri).startsWith('stub/')) {
      const link = await calendly.createSchedulingLink({ event_type_uri: intro.uri });
      if (link?.booking_url) return link.booking_url;
    }
  } catch { /* fall through to standing link */ }
  return rep.calendly_url;
}
