/**
 * Multi-recipient order notifications — PRD-26 §8.
 *
 * Per account: a list of recipients, each tagged with which events they want.
 * Order/ship/deliver/invoice/backorder emails fan out to ALL matching
 * recipients (CC) — so AP gets the invoice, the buyer gets tracking, ops gets
 * the confirmation — through the Resend-primary mailer chain (PRD-05) with the
 * outbox fallback, so a mail outage never loses a notification.
 */

import { db } from './db.js';
import { uid } from './format.js';
import { mailer } from './mailer.js';

export const NOTIFY_EVENTS = ['order_placed', 'shipped', 'delivered', 'invoice', 'backorder'];

/** Emails subscribed to an event for an org (deduped). */
export function recipientsFor(orgId, event) {
  if (!orgId) return [];
  return db.list('account_notification_recipients', { where: { org_id: orgId } })
    .filter((r) => !event || (r.events || NOTIFY_EVENTS).includes(event))
    .map((r) => r.email);
}

function defaultBody(event, order, extra) {
  const total = order.total != null ? `$${Number(order.total).toLocaleString()}` : '';
  switch (event) {
    case 'order_placed': return `Your order ${order.id} is confirmed${total ? ` (total ${total})` : ''}.`;
    case 'shipped': return `Order ${order.id} has shipped${extra?.tracking ? ` via ${extra.carrier || 'carrier'} — tracking ${extra.tracking}` : ''}.`;
    case 'delivered': return `Order ${order.id} was delivered.`;
    case 'invoice': return `An invoice for order ${order.id}${total ? ` (${total})` : ''} is available.`;
    case 'backorder': return `Some items on order ${order.id} are backordered and will ship when restocked.`;
    default: return `Update on order ${order.id}.`;
  }
}
const SUBJECT = {
  order_placed: (o) => `Order ${o.id} confirmed`,
  shipped: (o) => `Order ${o.id} shipped`,
  delivered: (o) => `Order ${o.id} delivered`,
  invoice: (o) => `Invoice for order ${o.id}`,
  backorder: (o) => `Order ${o.id}: items backordered`,
};

/**
 * Fan a notification out to every CC recipient on the account plus any
 * explicit `to`. Never throws (mailer mirrors to the outbox on failure).
 */
export async function notifyRecipients(org, event, payload = {}) {
  const order = payload.order || payload || {};
  const set = new Set(recipientsFor(org?.id, event));
  if (payload.to) set.add(payload.to);
  // Always include a buyer fallback so a notification is never silently dropped.
  if (!set.size && payload.fallback) set.add(payload.fallback);
  const recipients = [...set].filter(Boolean);
  const subject = (SUBJECT[event] || ((o) => `Order ${o.id} update`))(order);
  const body = payload.body || defaultBody(event, order, payload);
  const sent = [];
  for (const to of recipients) {
    const row = await mailer.send({ to, subject, body, template_key: event, drafted_by: 'system' });
    sent.push({ to, id: row.id, status: row.status });
  }
  db.insert('audit_log', { id: uid('aud'), kind: `notify.${event}`, ref_id: order.id, payload: { recipients, count: recipients.length } });
  return { event, recipients, sent };
}

/** Admin authoring of the per-account recipient list. */
export const notificationRecipients = {
  forOrg(orgId) { return db.list('account_notification_recipients', { where: { org_id: orgId } }); },
  add({ org_id, email, events = NOTIFY_EVENTS }) {
    const existing = db.list('account_notification_recipients', { where: { org_id, email } })[0];
    const patch = { org_id, email: email.trim().toLowerCase(), events };
    return existing ? db.update('account_notification_recipients', existing.id, patch)
      : db.insert('account_notification_recipients', { id: uid('anr'), created_at: new Date().toISOString(), ...patch });
  },
  setEvents(id, events) { return db.update('account_notification_recipients', id, { events }); },
  remove(id) { db.remove('account_notification_recipients', id); },
};
