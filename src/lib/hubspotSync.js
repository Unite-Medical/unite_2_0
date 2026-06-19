/**
 * Two-way HubSpot sync — PRD-06.
 *
 *   Pull  (HubSpot → Unite): mirror contacts/companies/deals into local
 *         hubspot_* tables for the admin CRM views.
 *   Push  (Unite → HubSpot): upsert Unite organizations → companies,
 *         customer profiles → contacts, and orders → deals (idempotent,
 *         keyed on email / company name / unite_order_id).
 *
 * Auto mode subscribes to local mutations on organizations/profiles/
 * orders and pushes the changed row. It never reacts to writes on the
 * hubspot_* mirror tables, so pull → push can't loop.
 */

import { db } from './db.js';
import { hubspot } from './external/hubspot.js';

const VALID_SEGMENTS = new Set(['asc', 'pharmacy', 'ems', 'gov', 'distributors', 'retail']);
const VALID_TERMS = new Set(['card', 'ach', 'net30', 'net60', 'wire', 'edi']);
const VALID_TIERS = new Set(['A', 'B', 'C', 'distributor']);
const PUSH_TABLES = ['organizations', 'profiles', 'orders'];

function splitName(name = '') {
  const parts = String(name).trim().split(/\s+/);
  return { firstname: parts[0] || '', lastname: parts.slice(1).join(' ') };
}

// Placed orders map onto pipeline stages of the default Sales Pipeline.
function orderStage(status) {
  return ({ delivered: 'closedwon', in_transit: 'closedwon', shipped: 'closedwon', processing: 'contractsent', pending: 'qualifiedtobuy' })[status] || 'qualifiedtobuy';
}

function companyArgs(org) {
  const p = { name: org.name };
  if (VALID_SEGMENTS.has(org.segment)) p.unite_segment = org.segment;
  if (VALID_TIERS.has(org.tier)) p.unite_tier = org.tier;
  if (VALID_TERMS.has(org.terms)) p.unite_terms = org.terms;
  if (org.credit_limit != null) p.unite_credit_limit = org.credit_limit;
  if (org.total_spend != null) p.unite_total_spend_ytd = org.total_spend;
  if (org.account_rep) p.unite_account_rep = org.account_rep;
  return p;
}

function contactArgs(profile) {
  const { firstname, lastname } = splitName(profile.name);
  const org = profile.org_id ? db.get('organizations', profile.org_id) : null;
  return { email: profile.email, firstname, lastname, company: org?.name, lifecyclestage: 'customer' };
}

function dealArgs(order) {
  return {
    unite_order_id: order.id,
    dealname: `${order.id} · ${order.customer_name || ''}`.trim(),
    amount: order.total,
    stage: orderStage(order.status),
    unite_segment: VALID_SEGMENTS.has(order.segment) ? order.segment : undefined,
    close_date: order.placed_at || order.created_at,
  };
}

async function pushOne(table, row) {
  if (table === 'organizations') return hubspot.upsertCompany(companyArgs(row));
  if (table === 'profiles') {
    if (!row.email || row.role === 'admin') return null; // skip internal staff
    return hubspot.upsertContact(contactArgs(row));
  }
  if (table === 'orders') return hubspot.upsertDeal(dealArgs(row));
  return null;
}

let autoUnsub = null;

export const hubspotSync = {
  /** Pull every page of all three object types into the local mirror. */
  async pullAll(onProgress) {
    const counts = {};
    for (const objectType of ['companies', 'contacts', 'deals']) {
      const { total } = await hubspot.syncAll(objectType, {
        onPage: (p) => onProgress?.({ phase: 'pull', objectType, fetched: p.total }),
      });
      counts[objectType] = total;
    }
    return counts;
  },

  /** Push all Unite organizations, customer profiles, and orders. */
  async pushAll(onProgress) {
    const result = { companies: 0, contacts: 0, deals: 0, errors: [] };
    const plan = [
      ['organizations', db.list('organizations'), 'companies'],
      ['profiles', db.list('profiles'), 'contacts'],
      ['orders', db.list('orders'), 'deals'],
    ];
    for (const [table, rows, bucket] of plan) {
      let done = 0;
      for (const row of rows) {
        try {
          const res = await pushOne(table, row);
          if (res) result[bucket] += 1;
        } catch (err) {
          result.errors.push(`${table}:${row.id} — ${err.message}`);
        }
        done += 1;
        onProgress?.({ phase: 'push', objectType: bucket, pushed: done, of: rows.length });
      }
    }
    return result;
  },

  /** Push then pull. */
  async syncBoth(onProgress) {
    const pushed = await this.pushAll(onProgress);
    const pulled = await this.pullAll(onProgress);
    return { pushed, pulled };
  },

  /** Counts of locally-syncable Unite records (for the UI). */
  pushableCounts() {
    return {
      organizations: db.count('organizations'),
      contacts: db.list('profiles').filter((p) => p.email && p.role !== 'admin').length,
      orders: db.count('orders'),
    };
  },

  /** Start auto-push: every local change to org/profile/order is mirrored
   *  up to HubSpot. Returns an unsubscribe; also stored for stopAuto(). */
  startAuto(onPush) {
    if (autoUnsub) return autoUnsub;
    autoUnsub = db.onMutation(({ table, op, id, row }) => {
      if (op !== 'upsert' || !PUSH_TABLES.includes(table) || !row) return;
      pushOne(table, row).then((res) => { if (res) onPush?.({ table, id }); }).catch(() => {});
    });
    return autoUnsub;
  },

  stopAuto() {
    if (autoUnsub) { autoUnsub(); autoUnsub = null; }
  },

  isAuto() { return Boolean(autoUnsub); },
};
