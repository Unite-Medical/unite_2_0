/**
 * UniteWMS — role-based access (PRD-25 §6, hardening).
 *
 * Three operational tiers layered on top of the app's auth roles:
 *   operator → receive, pick, pack, ship, cycle-count
 *   manager  → operator + adjust (damage/loss/found), transfers, PO approve/send
 *   admin    → manager + reverse movements, reconcile, override
 *
 * The app today authenticates `admin` and `customer`. `admin` maps to the WMS
 * `admin` tier (all capabilities); an explicit `wms_role` on the session can
 * pin a narrower tier (operator/manager) for warehouse staff. Customers get
 * nothing. All WMS admin screens already sit behind RequireAdmin; this adds
 * capability-level gating on top.
 */

export const CAPABILITIES = {
  operator: ['receive', 'pick', 'pack', 'ship', 'count'],
  manager: ['receive', 'pick', 'pack', 'ship', 'count', 'adjust', 'transfer', 'po_approve', 'po_send'],
  admin: ['receive', 'pick', 'pack', 'ship', 'count', 'adjust', 'transfer', 'po_approve', 'po_send', 'reverse', 'reconcile', 'override'],
};

/** Resolve the WMS tier for a session. */
export function wmsRole(session) {
  if (!session) return null;
  if (session.wms_role && CAPABILITIES[session.wms_role]) return session.wms_role;
  if (session.role === 'admin') return 'admin';
  return null;
}

/** Can this session perform a WMS action? */
export function wmsCan(action, session) {
  const role = wmsRole(session);
  if (!role) return false;
  return CAPABILITIES[role].includes(action);
}

/** Capability map for a session (handy for disabling UI controls). */
export function wmsCapabilities(session) {
  const role = wmsRole(session);
  return { role, can: (a) => (role ? CAPABILITIES[role].includes(a) : false) };
}

export const access = { CAPABILITIES, wmsRole, wmsCan, wmsCapabilities };
