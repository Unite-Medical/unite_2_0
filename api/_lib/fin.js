import crypto from 'node:crypto';
import { authorizeLiveProfile } from './auth.js';
import { publicShipmentPlan } from './splitFulfillment.js';

const pick = (row, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(row || {}, key)).map(key => [key, row[key]]));
const keyFor = secret => {
  if (!secret || secret.length < 24) throw new Error('fin_not_configured');
  return crypto.createHmac('sha256', secret).update('unite-fin-staging-read-only-v1').digest();
};
export function issueFinToken(session, { secret, now = Date.now() } = {}) {
  const payload = { sub: session.user_id, org: session.org_id, role: session.role, revision: Number(session.session_revision || 0), iss: 'unite-staging', aud: 'unite-fin-readonly', iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 900 };
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signed = `${header}.${body}`;
  return `${signed}.${crypto.createHmac('sha256', keyFor(secret)).update(signed).digest('base64url')}`;
}
export function verifyFinToken(token, { secret, now = Date.now() } = {}) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3 || token.length > 4096) return null;
    const [header, body, signature] = parts;
    const expected = crypto.createHmac('sha256', keyFor(secret)).update(`${header}.${body}`).digest();
    const supplied = Buffer.from(signature, 'base64url');
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
    const h = JSON.parse(Buffer.from(header, 'base64url'));
    const p = JSON.parse(Buffer.from(body, 'base64url'));
    const time = Math.floor(now / 1000);
    if (h.alg !== 'HS256' || p.iss !== 'unite-staging' || p.aud !== 'unite-fin-readonly' || !p.sub || !p.org || !['customer', 'distributor'].includes(p.role) || !Number.isFinite(p.iat) || !Number.isFinite(p.exp) || p.exp <= time || p.iat > time + 30 || p.exp - p.iat > 900) return null;
    return { user_id: p.sub, org_id: p.org, role: p.role, session_revision: p.revision };
  } catch { return null; }
}
export async function finCustomerContext(sql, session) {
  const [profiles, organizations, memberships] = await Promise.all([
    sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${String(session.user_id)} AND deleted=false LIMIT 1`,
    sql`SELECT data FROM um_rows WHERE tbl='organizations' AND id=${String(session.org_id)} AND deleted=false LIMIT 1`,
    sql`SELECT data FROM um_rows WHERE tbl='organization_users' AND deleted=false AND data->>'user_id'=${String(session.user_id)} AND data->>'org_id'=${String(session.org_id)} LIMIT 1`,
  ]);
  const profile = profiles[0]?.data, organization = organizations[0]?.data;
  if (!authorizeLiveProfile(session, profile, { roles: ['customer', 'distributor'] }).ok || !organization || organization.id !== profile.org_id || (organization.status && organization.status !== 'active') || memberships[0]?.data?.status !== 'active') return null;
  return { profile, organization };
}
export function projectFinOrders({ orders = [], items = [], shipments = [] }, orgId, reference) {
  const ref = String(reference || '').trim().toLowerCase();
  if (ref.length < 2 || ref.length > 100) return [];
  const owned = orders.filter(row => row.customer_id === orgId && [row.id, row.order_number, row.source_order_number, row.po_number].some(x => x != null && String(x).toLowerCase() === ref)).slice(0, 5);
  return owned.map(order => ({
    ...pick(order, ['id', 'order_number', 'source_order_number', 'po_number', 'status', 'payment_status', 'created_at', 'placed_at']),
    payment_status_source: 'staging_order_record_not_processor_confirmation',
    shipment_plan: publicShipmentPlan(order.shipment_plan),
    items: items.filter(row => row.order_id === order.id).slice(0, 200).map(row => pick(row, ['sku', 'name', 'qty', 'status'])),
    shipments: shipments.filter(row => row.order_id === order.id).slice(0, 50).map(row => pick(row, ['status', 'carrier', 'tracking_number', 'shipped_at', 'delivered_at'])),
  }));
}
export function searchFinCatalog(products, query) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2 || q.length > 120) return [];
  const words = q.split(/\s+/);
  return products.filter(p => p.published === true && p.launch_decision === 'Launch' && p.status === 'active')
    .filter(p => words.every(word => `${p.name} ${p.sku} ${p.category} ${(p.variants || []).map(v => `${v.sku} ${v.title}`).join(' ')}`.toLowerCase().includes(word)))
    .slice(0, 8).map(p => ({ name: p.name, category: p.category, sku: p.sku,
      url: `https://staging.unitemedical.net/catalog`,
      variants: (p.variants || []).slice(0, 60).map(v => pick(v, ['sku', 'title'])),
      pricing: 'Current quote required; catalog snapshot is not current pricing.',
      availability: 'Not verified; request current availability before promising stock or delivery.',
    }));
}
