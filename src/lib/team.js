/**
 * Org team management — PRD-14 (§3 Locksmith / §10 roles).
 *
 * A B2B account is a team: multiple users under one organization, each
 * with an org-level role that gates what they can do in the portal:
 *   - owner  → full access incl. team + terms
 *   - buyer  → can place orders / accept quotes
 *   - viewer → read-only (track orders, view invoices)
 *
 * Members are `profiles` rows joined by `org_id`. Invites create a
 * pending profile (no password) that activates when the teammate
 * registers/logs in with that email.
 */

import { db } from './db.js';
import { uid } from './format.js';

export const ORG_ROLES = ['owner', 'buyer', 'viewer'];

export function listTeam(orgId) {
  if (!orgId) return [];
  return db.list('profiles', { where: { org_id: orgId }, orderBy: 'created_at' });
}

export function inviteTeammate({ orgId, email, name, org_role = 'buyer', invitedBy = null }) {
  const clean = String(email || '').toLowerCase().trim();
  if (!orgId) return { ok: false, reason: 'no_org' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { ok: false, reason: 'bad_email' };
  if (db.list('profiles', { where: { email: clean } })[0]) return { ok: false, reason: 'exists' };

  const profile = db.insert('profiles', {
    id: uid('usr'),
    email: clean,
    name: name || clean.split('@')[0],
    role: 'customer',
    org_id: orgId,
    org_role: ORG_ROLES.includes(org_role) ? org_role : 'buyer',
    status: 'invited',
    invited_by: invitedBy,
    invited_at: new Date().toISOString(),
  });
  db.insert('audit_log', { id: uid('aud'), kind: 'team.invited', ref_id: orgId, payload: { email: clean, org_role } });
  return { ok: true, profile };
}

export function updateMemberRole(userId, org_role) {
  if (!ORG_ROLES.includes(org_role)) return { ok: false, reason: 'bad_role' };
  const updated = db.update('profiles', userId, { org_role });
  return { ok: Boolean(updated), profile: updated };
}

export function removeMember(userId) {
  const p = db.get('profiles', userId);
  if (!p) return { ok: false, reason: 'not_found' };
  db.remove('profiles', userId);
  db.insert('audit_log', { id: uid('aud'), kind: 'team.removed', ref_id: p.org_id, payload: { email: p.email } });
  return { ok: true };
}

/** The org-role of a user, defaulting the account owner to 'owner'. */
export function orgRoleOf(profile, org) {
  if (!profile) return 'viewer';
  if (profile.org_role) return profile.org_role;
  // The earliest profile in the org (or the seeded owner) is the owner.
  const team = listTeam(profile.org_id);
  if (team[0]?.id === profile.id) return 'owner';
  return org?.owner_user_id === profile.id ? 'owner' : 'buyer';
}
