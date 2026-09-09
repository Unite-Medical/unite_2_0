/**
 * Durable persistence bridge — closes the "localStorage is the only
 * DB" gap from the CTO brief.
 *
 * When the backend reports Postgres configured (/api/health →
 * services.postgres.configured), this module:
 *
 *   1. HYDRATES on boot — pulls the full row snapshot from
 *      /api/db/sync and overlays it onto the local store, so every
 *      device/refresh shares one durable state.
 *   2. MIRRORS every local mutation — db.onMutation events are queued,
 *      debounced (750ms), batched, and POSTed to /api/db/sync.
 *   3. PULLS incrementally — polls ?since=<latest> every 20s so edits
 *      made on another device/browser show up here too.
 *
 * If the backend is missing, unconfigured, or down, nothing changes:
 * localStorage stays the source of truth and the queue drains when the
 * server comes back. The relational schema in docs/schema/migrations/
 * remains the contract for the dedicated API tier (apply it with
 * `npm run db:migrate`).
 */

import { db } from './db.js';
import { API_BASE, warn } from './external/_http.js';

const SYNC_URL = `${API_BASE}/db/sync`;
const PUSH_DEBOUNCE_MS = 750;
const PULL_INTERVAL_MS = 20000;
const MAX_BATCH = 400;

const stateRef = {
  enabled: false,
  hydrated: false,
  queue: new Map(), // `${table}:${id}` -> mutation (last write wins)
  latest: null,     // server cursor for incremental pulls
  pushTimer: null,
  pullTimer: null,
  unsubscribe: null,
  lastError: null,
};

function headers() {
  return { 'Content-Type': 'application/json' };
}
function authorizationLost(status) {
  if (![401, 403].includes(status)) return false;
  stateRef.lastError = `authorization lost: HTTP ${status}`;
  stopRemoteDb({ purge: true });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('um:authorization-lost', { detail: { status } }));
  return true;
}

async function serverHasPostgres() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) return false;
    const json = await res.json();
    return Boolean(json?.services?.postgres?.configured);
  } catch {
    return false;
  }
}

async function pull({ full = false } = {}) {
  const url = !full && stateRef.latest
    ? `${SYNC_URL}?since=${encodeURIComponent(stateRef.latest)}`
    : SYNC_URL;
  let cursor=null,total=0,latest=null;const seen=new Set();
  do {
  const pageUrl=cursor?`${url}${url.includes('?')?'&':'?'}cursor=${encodeURIComponent(cursor)}`:url;
  const res = await fetch(pageUrl, { headers: headers(), credentials: 'include' });
  if (!res.ok) {
    authorizationLost(res.status);
    throw new Error(`pull failed: HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.latest) latest = json.latest;
  if (json.row_count > 0) db.applyRemoteSnapshot(json.tables);
  total+=json.row_count||0;
  cursor=json.next_cursor||null;
  if(cursor){if(seen.has(cursor)||seen.size>=1000)throw new Error('Database pagination did not complete');seen.add(cursor);}
  }while(cursor);
  if(latest)stateRef.latest=latest;
  return total;
}

async function flushQueue() {
  if (stateRef.queue.size === 0) return;
  const batch = [...stateRef.queue.values()].slice(0, MAX_BATCH);
  const keys = batch.map((m) => `${m.table}:${m.id}`);
  try {
    const res = await fetch(SYNC_URL, {
      method: 'POST',
      headers: headers(),
      credentials: 'include',
      body: JSON.stringify({ mutations: batch }),
    });
    if (!res.ok) {
      authorizationLost(res.status);
      throw new Error(`push failed: HTTP ${res.status}`);
    }
    for (const k of keys) stateRef.queue.delete(k);
    stateRef.lastError = null;
    if (stateRef.queue.size > 0) schedulePush(); // drain remainder
  } catch (err) {
    // Keep the queue; it retries on the next mutation or pull tick.
    stateRef.lastError = err.message;
    warn('remoteDb', `mirror push deferred: ${err.message}`);
  }
}

function schedulePush() {
  clearTimeout(stateRef.pushTimer);
  stateRef.pushTimer = setTimeout(flushQueue, PUSH_DEBOUNCE_MS);
}

function onLocalMutation({ table, op, id, row }) {
  stateRef.queue.set(`${table}:${id}`, { table, op, id: String(id), row });
  schedulePush();
}

/**
 * Boot the bridge. Call once from app startup; safe to call when the
 * backend is absent (it just stays dormant). Returns a status object.
 */
export async function startRemoteDb({ session = null } = {}) {
  if (stateRef.enabled) return remoteDbStatus();
  if (typeof window === 'undefined') return remoteDbStatus();
  if (session?.role !== 'admin') return remoteDbStatus();

  const ready = await serverHasPostgres();
  if (!ready) return remoteDbStatus();

  stateRef.enabled = true;
  db.clear();
  try {
    await pull({ full: true });
    stateRef.hydrated = true;
  } catch (err) {
    stateRef.lastError = err.message;
    warn('remoteDb', `hydration failed: ${err.message}`);
  }

  stateRef.unsubscribe = db.onMutation(onLocalMutation);
  stateRef.pullTimer = setInterval(() => {
    pull().catch((err) => { stateRef.lastError = err.message; });
  }, PULL_INTERVAL_MS);

  return remoteDbStatus();
}

export function stopRemoteDb({ purge = false } = {}) {
  stateRef.unsubscribe?.();
  clearTimeout(stateRef.pushTimer);
  clearInterval(stateRef.pullTimer);
  stateRef.enabled = false;
  stateRef.hydrated = false;
  if (purge) {
    stateRef.queue.clear();
    stateRef.latest = null;
    db.clearPublic();
  }
}

export function remoteDbStatus() {
  return {
    enabled: stateRef.enabled,
    hydrated: stateRef.hydrated,
    pending: stateRef.queue.size,
    cursor: stateRef.latest,
    last_error: stateRef.lastError,
  };
}
