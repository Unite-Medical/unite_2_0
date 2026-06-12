import { useSyncExternalStore } from 'react';
import { db } from './db.js';
import { uid, delay } from './format.js';
import { evaluateAccount } from './accountApproval.js';

const SESSION_KEY = 'um.session.v1';

let session = (() => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

const subs = new Set();
const notify = () => {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { void e; }
  if (!session) try { localStorage.removeItem(SESSION_KEY); } catch (e) { void e; }
  subs.forEach((fn) => fn());
};

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

  async login(email, password) {
    await delay(180, 360);
    const user = db.list('profiles', { where: { email: email.toLowerCase().trim() } })[0];
    if (!user) throw new Error('No account with that email.');
    if (!(await verifyPassword(user, password))) throw new Error('Wrong password.');
    session = { user_id: user.id, email: user.email, name: user.name, role: user.role, org_id: user.org_id };
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
      terms: 'card',
      credit_limit: 0,
      total_spend: 0,
      account_rep: 'Aidan Park',
      website: website || null,
      approval_status: approved ? 'approved' : 'manual_review',
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
    });
    session = { user_id: userId, email, name, role: 'customer', org_id: orgId };
    notify();
    return { ...session, approval };
  },

  logout() {
    session = null;
    notify();
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
