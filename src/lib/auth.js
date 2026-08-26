import { useSyncExternalStore } from 'react';
import { db } from './db.js';
import { uid, delay } from './format.js';
import { evaluateAccount } from './accountApproval.js';

const SESSION_KEY = 'um.session.v1';
const LOGOUT_PENDING_KEY = 'um.logout.pending.v1';
const LOCAL_AUTH_ALLOWED = typeof window === 'undefined'
  || Boolean(import.meta.env?.DEV)
  || import.meta.env?.VITE_ALLOW_LOCAL_AUTH === 'true';

let session = (() => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();
if (!LOCAL_AUTH_ALLOWED && typeof window !== 'undefined') session = null;
if (typeof window !== 'undefined') {
  try { if (localStorage.getItem(LOGOUT_PENDING_KEY)) session = null; } catch { /* storage unavailable */ }
}

const subs = new Set();
const notify = () => {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { void e; }
  if (!session) try { localStorage.removeItem(SESSION_KEY); } catch (e) { void e; }
  subs.forEach((fn) => fn());
};
if (typeof window !== 'undefined') {
  window.addEventListener('um:authorization-lost', () => {
    session = null;
    db.clearPublic();
    notify();
  });
}

// ---------------------------------------------------------------------------
// Password hashing — salted SHA-256 via WebCrypto. Seeded demo profiles
// still carry a plaintext `password`; they verify against it once and
// are upgraded to a hash on first successful login. Production swaps
// this for argon2/bcrypt server-side (PRD-01), but plaintext at rest
// is gone today.
// ---------------------------------------------------------------------------

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function makeSalt() {
  const arr = crypto.getRandomValues(new Uint8Array(16));
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
  return sha256Hex(`${salt}:${password}`);
}

async function verifyPassword(user, password) {
  if (user.password_hash && user.password_salt) {
    return (await hashPassword(password, user.password_salt)) === user.password_hash;
  }
  // Legacy seeded profile — plaintext comparison, then upgrade.
  if (user.password !== undefined) {
    if (user.password !== password) return false;
    const salt = makeSalt();
    db.update('profiles', user.id, {
      password: undefined,
      password_salt: salt,
      password_hash: await hashPassword(password, salt),
    });
    return true;
  }
  return false;
}

export const auth = {
  current() { return session; },

  async bootstrap() {
    if (typeof window === 'undefined') return session;
    let logoutPending = false;
    try { logoutPending = Boolean(localStorage.getItem(LOGOUT_PENDING_KEY)); } catch { logoutPending = true; }
    if (logoutPending) {
      session = null;
      db.clearPublic();
      notify();
      try {
        const revoke = await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include', keepalive: true });
        if (revoke.ok || [401, 409].includes(revoke.status)) localStorage.removeItem(LOGOUT_PENDING_KEY);
      } catch { /* remain locally signed out and retry on next bootstrap */ }
      return null;
    }
    try {
      const response = await fetch('/api/auth/session', { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      session = body.session || null;
      notify();
      if (session?.role !== 'admin') {
        const { stopRemoteDb } = await import('./remoteDb.js');
        stopRemoteDb();
        db.clearPublic();
      }
      return session;
    } catch {
      if (!LOCAL_AUTH_ALLOWED) {
        session = null;
        db.clearPublic();
        const { stopRemoteDb } = await import('./remoteDb.js');
        stopRemoteDb();
        notify();
      }
      return session;
    }
  },

  async login(email, password) {
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch('/api/auth/session', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (response.ok) {
          const body = await response.json();
          session = body.session;
          try { localStorage.removeItem(LOGOUT_PENDING_KEY); } catch { /* storage unavailable */ }
          notify();
          if (session?.role === 'admin') {
            const { startRemoteDb } = await import('./remoteDb.js');
            await startRemoteDb({ session });
          } else {
            const { stopRemoteDb } = await import('./remoteDb.js');
            stopRemoteDb();
            db.clearPublic();
          }
          return session;
        }
        if (!LOCAL_AUTH_ALLOWED || ![404, 503].includes(response.status)) throw new Error('Invalid email or password.');
      } catch (error) {
        if (!LOCAL_AUTH_ALLOWED) throw error;
      }
    }
    await delay(180, 360);
    const user = db.list('profiles', { where: { email: email.toLowerCase().trim() } })[0];
    if (!user) throw new Error('No account with that email.');
    if (!(await verifyPassword(user, password))) throw new Error('Wrong password.');
    const organization = user.org_id ? db.get('organizations', user.org_id) : null;
    session = {
      user_id: user.id, email: user.email, name: user.name, role: user.role, org_id: user.org_id,
      approval_status: organization?.approval_status || null,
      tier: organization?.tier || null,
    };
    notify();
    return session;
  },

  /**
   * Register a new B2B account. Runs the §6.2 confidence scoring
   * (commercial address / valid website / matching email domain):
   * AUTO_APPROVE activates immediately, otherwise the org lands in
   * `manual_review` and the customer sees pending-state messaging.
   */
  async register({ email, password, name, org_name, segment, website, address }) {
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name, org_name, segment, website, address }),
        });
        const body = await response.json().catch(() => ({}));
        if (response.ok) {
          session = body.session;
          try { localStorage.removeItem(LOGOUT_PENDING_KEY); } catch { /* storage unavailable */ }
          notify();
          const { stopRemoteDb } = await import('./remoteDb.js');
          stopRemoteDb();
          db.clearPublic();
          return { ...session, approval: body.approval };
        }
        if (!LOCAL_AUTH_ALLOWED || ![404, 503].includes(response.status)) {
          throw new Error(body.error === 'account_exists' ? 'An account with that email already exists.' : body.error || 'Could not create account.');
        }
      } catch (error) {
        if (!LOCAL_AUTH_ALLOWED) throw error;
      }
    }
    await delay(220, 480);
    const existing = db.list('profiles', { where: { email: email.toLowerCase().trim() } })[0];
    if (existing) throw new Error('An account with that email already exists.');

    const approval = evaluateAccount({ email, website, address });
    const approved = approval.decision === 'AUTO_APPROVE';

    const orgId = uid('org');
    db.insert('organizations', {
      id: orgId,
      name: org_name || `${name}'s organization`,
      segment: segment || 'asc',
      tier: 'C',
      terms: 'ach',
      credit_limit: 0,
      total_spend: 0,
      account_rep: 'Aidan Park',
      website: website || null,
      approval_status: approved ? 'approved' : 'manual_review',
      status: 'active',
      approval_score: approval.score,
      approval_reasons: approval.reasons,
      approved_at: approved ? new Date().toISOString() : null,
    });

    const salt = makeSalt();
    const userId = uid('usr');
    db.insert('profiles', {
      id: userId,
      email: email.toLowerCase().trim(),
      password_salt: salt,
      password_hash: await hashPassword(password, salt),
      name,
      role: 'customer',
      org_id: orgId,
      title: 'Account owner',
      status: 'active',
    });
    db.insert('organization_users', {
      id: uid('orguser'), org_id: orgId, user_id: userId, role: 'owner', status: 'active',
    });
    db.insert('account_payment_methods', {
      id: uid('apm'), org_id: orgId, method: 'ach', status: 'active',
      credit_limit: null, approved_by: 'registration_policy', approved_at: new Date().toISOString(),
    });
    session = {
      user_id: userId, email, name, role: 'customer', org_id: orgId,
      approval_status: approved ? 'approved' : 'manual_review', tier: 'C',
    };
    notify();
    return { ...session, approval };
  },

  async logout() {
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(LOGOUT_PENDING_KEY, new Date().toISOString()); } catch { /* storage unavailable */ }
    }
    session = null;
    db.clearPublic();
    const { stopRemoteDb } = await import('./remoteDb.js');
    stopRemoteDb();
    notify();
    if (typeof window === 'undefined') return true;
    try {
      const response = await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include', keepalive: true });
      if (response.ok || [401, 409].includes(response.status)) {
        try { localStorage.removeItem(LOGOUT_PENDING_KEY); } catch { /* storage unavailable */ }
        return true;
      }
    } catch { /* marker keeps reloads locally signed out */ }
    return false;
  },

  /** Reactive React hook. */
  use() {
    const subscribe = (cb) => { subs.add(cb); return () => subs.delete(cb); };
    const getSnapshot = () => session ? `${session.user_id}:${session.role}` : 'anon';
    useSyncExternalStore(subscribe, getSnapshot);
    return session;
  },

  org() {
    if (!session?.org_id) return null;
    return db.get('organizations', session.org_id);
  },
};
