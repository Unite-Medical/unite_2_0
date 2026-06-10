/**
 * CEO morning brief — PRD-05 Phase 5 / CTO brief §9.
 *
 * Gathers yesterday's signals straight from the DB, runs them through
 * the `digest/ceo_morning_brief` prompt, and stores the result in
 * `daily_digests`.
 *
 * No Anthropic key yet → ai.run returns its stub. In that case we fall
 * back to a deterministic, heuristic ranking of the same signals so
 * Damon still gets a useful brief today; the AI simply writes a better
 * one once the key is wired.
 */

import { db } from './db.js';
import { uid } from './format.js';
import { ai } from './ai/client.js';
import { lowStockAlerts } from './replenishment.js';

const DAY = 86400000;

function since(days) { return Date.now() - days * DAY; }

/** Pull every signal the prompt template expects. */
export function gatherSignals() {
  const orders = db.list('orders').filter((o) => new Date(o.placed_at || 0).getTime() >= since(1));
  const orderTotal = orders.reduce((a, o) => a + (o.total || 0), 0);

  const overdue = db.list('invoices')
    .filter((i) => i.status === 'open' && i.due_date && new Date(i.due_date).getTime() < Date.now())
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  const lowStock = lowStockAlerts().slice(0, 8);

  const exceptions = db.list('flexport_shipments').filter((s) => s.status === 'exception');

  const hotLeads = db.list('leads')
    .filter((l) => l.status !== 'closed' && new Date(l.created_at || 0).getTime() >= since(3))
    .sort((a, b) => (b.est_annual_value || 0) - (a.est_annual_value || 0))
    .slice(0, 5);

  const recalls = db.list('compliance_events')
    .filter((e) => e.kind === 'recall' && e.status !== 'resolved')
    .slice(0, 5);

  const pendingVendors = db.list('vendors', { where: { status: 'pending' } });

  return { orders, orderTotal, overdue, lowStock, exceptions, hotLeads, recalls, pendingVendors };
}

function summarize(sig) {
  return {
    orders_summary: sig.orders.length
      ? sig.orders.map((o) => `${o.id} · ${o.customer_name} · $${(o.total || 0).toLocaleString()} · ${o.status}`).join('\n')
      : 'No orders in the last 24h.',
    deal_changes: 'HubSpot sync not yet live — no stage changes captured.',
    hot_leads: sig.hotLeads.length
      ? sig.hotLeads.map((l) => `${l.org_name} (${l.segment}) · est $${(l.est_annual_value || 0).toLocaleString()}/yr · ${l.status}`).join('\n')
      : 'None new.',
    low_stock: sig.lowStock.length
      ? sig.lowStock.map((r) => `${r.sku} ${r.name} · ${r.on_hand} on hand · ${r.days_cover ?? '∞'}d cover · ${r.status}`).join('\n')
      : 'All SKUs above reorder point.',
    overdue_invoices: sig.overdue.length
      ? sig.overdue.slice(0, 8).map((i) => `${i.id} · $${(i.amount || 0).toLocaleString()} · due ${i.due_date?.slice(0, 10)}`).join('\n')
      : 'Nothing overdue.',
    fathom_highlights: 'Fathom webhook not yet live.',
    recall_events: sig.recalls.length
      ? sig.recalls.map((r) => `${r.firm || r.vendor_name} · ${r.reason || r.summary || 'recall event'} · class ${r.classification || '?'}`).join('\n')
      : 'No open recall events.',
  };
}

/** Deterministic fallback used until the Anthropic key is wired. */
function heuristicBullets(sig) {
  const bullets = [];

  if (sig.overdue.length) {
    const total = sig.overdue.reduce((a, i) => a + (i.amount || 0), 0);
    bullets.push({
      headline: `${sig.overdue.length} overdue invoice${sig.overdue.length > 1 ? 's' : ''} — $${Math.round(total).toLocaleString()} past due`,
      summary: `Oldest: ${sig.overdue[0].id} ($${(sig.overdue[0].amount || 0).toLocaleString()}, due ${sig.overdue[0].due_date?.slice(0, 10)}).`,
      why_it_matters: 'Past-due AR is cash sitting in someone else\u2019s account.',
      deep_link: '/admin/finance',
      severity: 'urgent',
    });
  }
  if (sig.lowStock.length) {
    const worst = sig.lowStock[0];
    bullets.push({
      headline: `${sig.lowStock.length} SKU${sig.lowStock.length > 1 ? 's' : ''} at or below reorder point`,
      summary: `Worst: ${worst.sku} (${worst.name}) — ${worst.on_hand} on hand, ~${worst.days_cover ?? 0} days of cover at current run rate.`,
      why_it_matters: 'Lead time is ~5 weeks; ordering after stockout means a quarter of lost sales.',
      deep_link: '/admin/replenishment',
      severity: worst.status === 'stockout' ? 'urgent' : 'attention',
    });
  }
  if (sig.recalls.length) {
    bullets.push({
      headline: `Open recall event: ${sig.recalls[0].firm || sig.recalls[0].vendor_name || 'vendor'}`,
      summary: sig.recalls[0].reason || sig.recalls[0].summary || 'FDA enforcement action touching a monitored vendor.',
      why_it_matters: 'Customer notification clock starts when we know, not when we act.',
      deep_link: '/admin/compliance',
      severity: 'urgent',
    });
  }
  if (sig.exceptions.length) {
    bullets.push({
      headline: `${sig.exceptions.length} inbound shipment${sig.exceptions.length > 1 ? 's' : ''} flagged exception`,
      summary: 'Freight forwarder reported an exception on an inbound container.',
      why_it_matters: 'Exceptions usually mean customs holds — every day adds storage fees.',
      deep_link: '/admin/orders',
      severity: 'attention',
    });
  }
  if (sig.pendingVendors.length) {
    bullets.push({
      headline: `${sig.pendingVendors.length} vendor${sig.pendingVendors.length > 1 ? 's' : ''} awaiting approval decision`,
      summary: `${sig.pendingVendors.map((v) => v.name).join(', ')} — scoring is run, your call is the gate.`,
      why_it_matters: 'Each approved vendor widens the catalog we can quote.',
      deep_link: '/admin/vendors',
      severity: 'info',
    });
  }
  if (sig.hotLeads.length && bullets.length < 5) {
    const top = sig.hotLeads[0];
    bullets.push({
      headline: `New lead: ${top.org_name} (est $${(top.est_annual_value || 0).toLocaleString()}/yr)`,
      summary: `${top.segment?.toUpperCase()} segment · owner ${top.owner} · next action: ${top.next_action || 'assign'}.`,
      why_it_matters: 'Speed-to-first-touch is the highest-leverage sales variable.',
      deep_link: '/admin/crm',
      severity: 'info',
    });
  }
  if (sig.orders.length && bullets.length < 5) {
    bullets.push({
      headline: `${sig.orders.length} order${sig.orders.length > 1 ? 's' : ''} in the last 24h — $${Math.round(sig.orderTotal).toLocaleString()}`,
      summary: `Largest: ${sig.orders.slice().sort((a, b) => b.total - a.total)[0]?.customer_name}.`,
      why_it_matters: 'All flowed zero-touch: inventory, invoice, and label created automatically.',
      deep_link: '/admin/orders',
      severity: 'info',
    });
  }

  return bullets.slice(0, 5).map((b, i) => ({ priority: i + 1, ...b }));
}

/**
 * Generate today's brief and persist it. Returns the `daily_digests` row.
 */
export async function generateDigest({ source = 'manual' } = {}) {
  const sig = gatherSignals();
  const input = summarize(sig);

  let bullets;
  let generated_by = 'heuristic';
  try {
    const { data, stub } = await ai.run('digest/ceo_morning_brief', { input, source: 'ceo-digest' });
    if (!stub && data?.bullets?.length) {
      bullets = data.bullets;
      generated_by = 'claude';
    }
  } catch {
    // fall through to heuristic
  }
  if (!bullets) bullets = heuristicBullets(sig);

  const row = db.insert('daily_digests', {
    id: uid('dig'),
    date: new Date().toISOString().slice(0, 10),
    generated_at: new Date().toISOString(),
    generated_by,
    source,
    bullets,
    signal_counts: {
      orders: sig.orders.length,
      overdue_invoices: sig.overdue.length,
      low_stock: sig.lowStock.length,
      exceptions: sig.exceptions.length,
      hot_leads: sig.hotLeads.length,
      recalls: sig.recalls.length,
    },
  });
  db.insert('audit_log', { id: uid('aud'), kind: 'digest.generated', ref_id: row.id, payload: { generated_by, bullets: bullets.length } });
  return row;
}
