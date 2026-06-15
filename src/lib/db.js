import { useEffect, useSyncExternalStore } from 'react';
import { seed } from './seed.js';

/**
 * Lightweight reactive client-side "DB" — designed so a future
 * migration to Supabase is a search-and-replace:
 *
 *   db.list('orders', { where: { customer_id }, orderBy: 'created_at', dir: 'desc' })
 *   db.get('orders', id)
 *   db.insert('orders', row)
 *   db.update('orders', id, patch)
 *   db.remove('orders', id)
 *   db.useTable('orders', query) -> live React hook
 *   db.useRow('orders', id)      -> live React hook
 *
 * Persisted to localStorage under one key so the demo survives refreshes.
 */

const STORAGE_KEY = 'um.db.v1';
const SCHEMA_VERSION = 13;

const TABLES = [
  'profiles', 'organizations', 'organization_users', 'addresses',
  'warehouses', 'categories', 'products', 'product_variants',
  'pricing', 'inventory',
  'carts', 'cart_items',
  'orders', 'order_items', 'shipments', 'shipment_items',
  'invoices', 'payments',
  'quotes', 'quote_items',
  'leads', 'contacts', 'activities', 'tasks',
  'blog_posts', 'cms_pages', 'banners', 'doc_requests', 'vendors',
  'qbo_invoices', 'flexport_shipments', 'shipstation_labels',
  'stripe_payments', 'stripe_invoices', 'hubspot_contacts', 'gmail_outbox', 'audit_log',
  // PRD-09 / PRD-12: goods-receipt records against purchase orders
  'po_receipts',
  // PRD-11: AI usage tracking
  'ai_usage',
  // PRD-10: hospital surplus intake
  'surplus_submissions', 'surplus_lines',
  // PRD-07: vendor compliance evidence
  'vendor_evidence', 'product_compliance', 'compliance_events',
  // PRD-12: replenishment (run-rate model output + draft POs)
  'purchase_orders',
  // PRD-05: CEO morning brief history
  'daily_digests',
  // Brief §7: trade-data discovery (vendor/customer lead mining)
  'trade_records',
  // Cato-gap: no-EDI shortage-list intake (paste a backorder list, get matches)
  'shortage_requests',
  // PRD-06 / brief §2 #5: 1099 rep network (roster + computed commissions)
  'reps',
  // Brief §5: Google Calendar / Calendly meeting mirror
  'calendar_events',
  // Brief §8: surplus marketplace (buyer offers on published lots)
  'surplus_offers',
  // Brief §2 #5: Stripe Connect commission payouts to 1099 reps
  'rep_payouts',
  // PRD-17: generated PDF artifacts (quotes, invoices, POs, packing slips, certs)
  'documents',
  // PRD-20: webhook event bus (idempotency + retry + dead-letter)
  'webhook_events',
  // PRD-24: zero-touch fulfillment pipeline + backorders + returns
  'fulfillment_pipeline', 'backorders', 'rmas',
  // PRD-22: cached FX rates for multi-currency vendor sheets
  'exchange_rates',
  // PRD-14: per-tier SKU pricing + per-segment catalog visibility
  'tier_pricing', 'catalog_visibility',
];

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.__schema !== SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded or private mode — keep running in-memory
  }
}

let state = (() => {
  const cached = load();
  if (cached) return cached;
  const fresh = { __schema: SCHEMA_VERSION, ...Object.fromEntries(TABLES.map((t) => [t, []])) };
  seed(fresh);
  persist(fresh);
  return fresh;
})();

const subs = new Map(); // table -> Set<fn>
const rowSubs = new Map(); // `${table}:${id}` -> Set<fn>

// Write-through hooks (src/lib/remoteDb.js): every local mutation is
// announced so it can be mirrored to Postgres via /api/db/sync.
// `applyingRemote` suppresses echo when pulled rows are applied locally.
const mutationSubs = new Set();
let applyingRemote = false;

function emitMutation(table, op, id, row) {
  if (applyingRemote) return;
  for (const fn of mutationSubs) {
    try { fn({ table, op, id, row }); } catch { /* mirror must never break the app */ }
  }
}

function notify(table, id) {
  subs.get(table)?.forEach((fn) => fn());
  if (id != null) rowSubs.get(`${table}:${id}`)?.forEach((fn) => fn());
  persist(state);
}

function nextId(table) {
  const rows = state[table] || [];
  let max = 0;
  for (const r of rows) {
    const n = Number(String(r.id).replace(/[^\d]/g, ''));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

function nowIso() { return new Date().toISOString(); }

function matchWhere(row, where) {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    const rv = row[k];
    if (typeof v === 'function') { if (!v(rv)) return false; continue; }
    if (Array.isArray(v)) { if (!v.includes(rv)) return false; continue; }
    if (rv !== v) return false;
  }
  return true;
}

function applyQuery(rows, query = {}) {
  let out = rows;
  if (query.where) out = out.filter((r) => matchWhere(r, query.where));
  if (query.search) {
    const q = String(query.search).toLowerCase();
    const fields = query.searchFields || ['name', 'sku', 'title'];
    out = out.filter((r) => fields.some((f) => String(r[f] ?? '').toLowerCase().includes(q)));
  }
  if (query.orderBy) {
    const dir = query.dir === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => {
      const av = a[query.orderBy]; const bv = b[query.orderBy];
      if (av == null && bv == null) return 0;
      if (av == null) return -1 * dir;
      if (bv == null) return 1 * dir;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }
  if (query.limit != null) out = out.slice(query.offset || 0, (query.offset || 0) + query.limit);
  return out;
}

export const db = {
  raw: () => state,

  list(table, query) {
    return applyQuery(state[table] || [], query);
  },

  get(table, id) {
    return (state[table] || []).find((r) => r.id === id) || null;
  },

  count(table, query) {
    return this.list(table, query).length;
  },

  insert(table, row) {
    const id = row.id ?? nextId(table);
    const created = { id, created_at: nowIso(), updated_at: nowIso(), ...row };
    state = { ...state, [table]: [...(state[table] || []), created] };
    notify(table, id);
    emitMutation(table, 'upsert', id, created);
    return created;
  },

  update(table, id, patch) {
    let updated = null;
    state = {
      ...state,
      [table]: (state[table] || []).map((r) => {
        if (r.id !== id) return r;
        updated = { ...r, ...patch, updated_at: nowIso() };
        return updated;
      }),
    };
    notify(table, id);
    if (updated) emitMutation(table, 'upsert', id, updated);
    return updated;
  },

  upsert(table, row, key = 'id') {
    const existing = (state[table] || []).find((r) => r[key] === row[key]);
    return existing ? this.update(table, existing.id, row) : this.insert(table, row);
  },

  remove(table, id) {
    const before = (state[table] || []).length;
    state = { ...state, [table]: (state[table] || []).filter((r) => r.id !== id) };
    if ((state[table] || []).length !== before) {
      notify(table, id);
      emitMutation(table, 'delete', id, null);
    }
  },

  /** Subscribe to every local mutation (write-through mirror). Returns unsubscribe. */
  onMutation(fn) {
    mutationSubs.add(fn);
    return () => mutationSubs.delete(fn);
  },

  /**
   * Replace local tables with rows pulled from the server. Does NOT
   * echo back through onMutation (that would loop forever).
   * `tables` is { table_name: [rows] }; rows flagged __deleted are removed.
   */
  applyRemoteSnapshot(tables) {
    applyingRemote = true;
    try {
      const next = { ...state };
      for (const [table, rows] of Object.entries(tables || {})) {
        if (!TABLES.includes(table)) continue;
        const existing = new Map((next[table] || []).map((r) => [r.id, r]));
        for (const row of rows) {
          if (row.__deleted) { existing.delete(row.id); continue; }
          const clean = { ...row };
          delete clean.__deleted;
          existing.set(clean.id, clean);
        }
        next[table] = [...existing.values()];
      }
      state = next;
      persist(state);
      for (const table of Object.keys(tables || {})) {
        subs.get(table)?.forEach((fn) => fn());
      }
    } finally {
      applyingRemote = false;
    }
  },

  /** Every row in every table — used for the first full push to Postgres. */
  allRows() {
    const out = [];
    for (const table of TABLES) {
      for (const row of state[table] || []) out.push({ table, op: 'upsert', id: row.id, row });
    }
    return out;
  },

  /** Subscribe to changes for an entire table. Returns unsubscribe. */
  subscribe(table, fn) {
    if (!subs.has(table)) subs.set(table, new Set());
    subs.get(table).add(fn);
    return () => subs.get(table).delete(fn);
  },

  /** Reactive React hook — list rows from a table, re-render on change. */
  useTable(table, query) {
    const subscribe = (cb) => this.subscribe(table, cb);
    const queryKey = JSON.stringify(query || {});
    const getSnapshot = () => `${table}:${queryKey}:${(state[table] || []).length}:${(state[table] || [])[(state[table] || []).length - 1]?.updated_at || ''}`;
    useSyncExternalStore(subscribe, getSnapshot);
    return this.list(table, query);
  },

  /** Reactive single row hook. */
  useRow(table, id) {
    const subscribe = (cb) => {
      if (!rowSubs.has(`${table}:${id}`)) rowSubs.set(`${table}:${id}`, new Set());
      rowSubs.get(`${table}:${id}`).add(cb);
      const tableUnsub = this.subscribe(table, cb);
      return () => { rowSubs.get(`${table}:${id}`).delete(cb); tableUnsub(); };
    };
    const getSnapshot = () => {
      const r = this.get(table, id);
      return r ? `${id}:${r.updated_at}` : `${id}:none`;
    };
    useSyncExternalStore(subscribe, getSnapshot);
    return this.get(table, id);
  },

  /** Force re-seed (useful for "reset demo" buttons). */
  reset() {
    const fresh = { __schema: SCHEMA_VERSION, ...Object.fromEntries(TABLES.map((t) => [t, []])) };
    seed(fresh);
    state = fresh;
    persist(state);
    subs.forEach((set) => set.forEach((fn) => fn()));
  },
};

/** Compatibility helper for components that still want the old static array shape. */
export function useProducts() {
  return db.useTable('products', { orderBy: 'name', dir: 'asc' });
}

/** Convenience: tick a clock every N ms (used by TrackOrder etc.). */
export function useInterval(fn, ms = 1000, deps = []) {
  useEffect(() => {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export const __TABLES = TABLES;
