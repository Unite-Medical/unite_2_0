import { authorizeLiveProfile } from './auth.js';

const TRANSACTING_ROLES = new Set(['customer', 'distributor']);
const BUYER_ROLES = new Set(['owner', 'buyer']);
const TIER_MULTIPLIER = { A: 0.92, B: 0.96, C: 1, distributor: 0.88 };

function money(value) { return +Number(value || 0).toFixed(2); }
function dateOnly(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : new Date(value || Date.now()).toISOString().slice(0, 10); }

export function authorizeCommerceContext({ session, profile, organization, membership }) {
  if (!session) return { ok: false, reason: 'authentication_required' };
  if (!TRANSACTING_ROLES.has(session.role)) return { ok: false, reason: 'customer_or_distributor_required' };
  const live = authorizeLiveProfile(session, profile);
  if (!live.ok) {
    if (live.reason === 'session_organization_stale') return { ok: false, reason: 'organization_mismatch' };
    if (live.reason === 'session_role_stale') return { ok: false, reason: 'role_changed' };
    return live;
  }
  if (!organization || organization.id !== profile.org_id || session.org_id !== organization.id) {
    return { ok: false, reason: 'organization_mismatch' };
  }
  if (organization.status && organization.status !== 'active') return { ok: false, reason: 'organization_inactive' };
  if (organization.approval_status !== 'approved') return { ok: false, reason: 'account_not_approved' };
  if (!membership || membership.user_id !== profile.id || membership.org_id !== organization.id) {
    return { ok: false, reason: 'membership_not_found' };
  }
  if (membership.status !== 'active') return { ok: false, reason: 'membership_inactive' };
  if (!BUYER_ROLES.has(membership.role)) return { ok: false, reason: 'buyer_authority_required' };
  return { ok: true, session, profile, organization, membership };
}

export function resolveAuthoritativePrice({
  product,
  quantity = 1,
  organization,
  pricingRows = [],
  contractRows = [],
  volumeBreakRows = [],
  now = new Date(),
} = {}) {
  const qty = Number(quantity);
  if (!product?.sku) return { ok: false, reason: 'product_not_found' };
  if (!Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'invalid_quantity' };
  if (product.quote_only || product.price == null) return { ok: false, reason: 'quote_only' };

  const sku = product.sku;
  const listRow = pricingRows
    .filter((row) => row.sku === sku && qty >= Number(row.min_qty || 1) && row.unit_price != null)
    .sort((a, b) => Number(b.min_qty || 1) - Number(a.min_qty || 1))[0];
  const listPrice = money(listRow?.unit_price ?? product.price);
  if (!(listPrice > 0)) return { ok: false, reason: 'approved_price_required' };
  const tier = organization?.tier || 'C';
  const tierPrice = money(listPrice * (TIER_MULTIPLIER[tier] ?? 1));
  const today = dateOnly(now);

  const contract = contractRows
    .filter((row) => !row.status || row.status === 'active')
    .filter((row) => row.org_id === organization?.id && row.product_sku === sku)
    .filter((row) => qty >= Number(row.min_qty || 1))
    .filter((row) => (!row.effective_from || row.effective_from <= today) && (!row.effective_to || row.effective_to >= today))
    .sort((a, b) => Number(b.min_qty || 1) - Number(a.min_qty || 1))[0];
  if (contract && Number(contract.unit_price) > 0) {
    return {
      ok: true, sku, quantity: qty, unit_price: money(contract.unit_price), list_price: listPrice,
      basis: 'contract', tier, contract_id: contract.id,
    };
  }

  const volume = volumeBreakRows
    .filter((row) => row.product_sku === sku && qty >= Number(row.min_qty || 1))
    .sort((a, b) => Number(b.min_qty || 1) - Number(a.min_qty || 1))[0];
  let volumePrice = null;
  if (volume?.unit_price != null) volumePrice = money(volume.unit_price);
  else if (volume?.discount_pct != null) volumePrice = money(listPrice * (1 - Number(volume.discount_pct) / 100));
  if (volumePrice != null && volumePrice > 0 && volumePrice < tierPrice) {
    return {
      ok: true, sku, quantity: qty, unit_price: volumePrice, list_price: listPrice,
      basis: 'volume_break', tier, break_min_qty: Number(volume.min_qty || 1),
    };
  }
  return {
    ok: true, sku, quantity: qty, unit_price: tierPrice, list_price: listPrice,
    basis: tierPrice < listPrice ? 'tier' : 'list', tier,
  };
}

export function buildAuthoritativeOrderDraft({
  context,
  request = {},
  products = [],
  pricingRows = [],
  contractRows = [],
  volumeBreakRows = [],
  paymentMethods = [],
  addresses = [],
  now = new Date(),
} = {}) {
  const authorization = authorizeCommerceContext(context || {});
  if (!authorization.ok) return authorization;
  const poNumber = String(request.po_number || '').trim();
  if (!poNumber) return { ok: false, reason: 'customer_po_required' };
  const requestedLines = Array.isArray(request.lines) ? request.lines : [];
  if (!requestedLines.length) return { ok: false, reason: 'order_lines_required' };
  const paymentMethod = String(request.payment_method || '').trim();
  const paymentGrant = paymentMethods.find((row) => (
    row.org_id === authorization.organization.id && row.method === paymentMethod && row.status === 'active'
  ));
  if (!paymentGrant) return { ok: false, reason: 'payment_method_not_allowed' };
  const address = addresses.find((row) => row.id === request.ship_to_address_id && row.org_id === authorization.organization.id);
  if (!address) return { ok: false, reason: 'shipping_address_not_owned' };

  const quantityBySku = new Map();
  for (const raw of requestedLines) {
    const sku = String(raw?.sku || '').trim();
    const qty = Number(raw?.qty);
    if (!sku || !Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'invalid_order_line' };
    quantityBySku.set(sku, (quantityBySku.get(sku) || 0) + qty);
  }
  const lines = [];
  for (const [sku, qty] of quantityBySku) {
    const parent = products.find((row) => (
      row.sku === sku || row.id === sku || (row.variants || []).some((variant) => variant.sku === sku)
    ));
    const variant = parent?.variants?.find((candidate) => candidate.sku === sku);
    const product = variant
      ? { ...parent, sku, name: `${parent.name} · ${variant.title}`, price: variant.price, quote_only: parent.quote_only || variant.price == null }
      : parent;
    const priced = resolveAuthoritativePrice({
      product, quantity: qty, organization: authorization.organization,
      pricingRows, contractRows, volumeBreakRows, now,
    });
    if (!priced.ok) return { ...priced, sku };
    lines.push({
      sku: product.sku,
      product_id: parent.sku || parent.id,
      inventory_sku: parent.sku || parent.id,
      name: product.name,
      qty,
      unit_price: priced.unit_price,
      list_price: priced.list_price,
      pricing_basis: priced.basis,
      ext_price: money(qty * priced.unit_price),
    });
  }
  const subtotal = money(lines.reduce((sum, line) => sum + line.ext_price, 0));
  const freight = subtotal > 500 ? 0 : 42;
  const total = money(subtotal + freight);
  if (paymentGrant.credit_limit != null && /^net\d+$/.test(paymentMethod) && total > Number(paymentGrant.credit_limit)) {
    return { ok: false, reason: 'over_credit_limit', credit_limit: Number(paymentGrant.credit_limit) };
  }

  return {
    ok: true,
    order: {
      customer_id: authorization.organization.id,
      customer_name: authorization.organization.name,
      placed_by: authorization.session.user_id,
      contact_email: authorization.session.email || null,
      po_number: poNumber,
      payment_method: paymentMethod,
      payment_terms: paymentMethod,
      payment_status: 'pending',
      status: 'payment_pending',
      ship_to_address_id: address.id,
      ship_method: request.ship_method || 'fedex_ground',
      notes: String(request.notes || '').trim(),
      order_source: request.order_source || 'catalog',
      segment: authorization.organization.segment || 'asc',
      subtotal,
      freight,
      tax: 0,
      total,
      placed_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    },
    lines,
    address,
    payment_grant: paymentGrant,
  };
}

export async function loadCommerceContext(sql, session) {
  if (!session) return { ok: false, reason: 'authentication_required' };
  const [profiles, organizations, memberships] = await Promise.all([
    sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${String(session.user_id)} AND deleted=false LIMIT 1`,
    sql`SELECT data FROM um_rows WHERE tbl='organizations' AND id=${String(session.org_id || '')} AND deleted=false LIMIT 1`,
    sql`SELECT data FROM um_rows WHERE tbl='organization_users' AND deleted=false AND data->>'user_id'=${String(session.user_id)} AND data->>'org_id'=${String(session.org_id || '')} LIMIT 1`,
  ]);
  return authorizeCommerceContext({
    session,
    profile: profiles[0]?.data || null,
    organization: organizations[0]?.data || null,
    membership: memberships[0]?.data || null,
  });
}
