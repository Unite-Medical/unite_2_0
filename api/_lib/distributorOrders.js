import crypto from 'node:crypto';
import { authorizeCommerceContext, resolveAuthoritativePrice } from './commerce.js';

function money(value) { return +Number(value || 0).toFixed(2); }
function number(value) { return Number(value) || 0; }

function normalizeDestination(destination = {}) {
  const row = {
    recipient: String(destination.recipient || '').trim(),
    company: String(destination.company || '').trim(),
    line1: String(destination.line1 || '').trim(),
    line2: String(destination.line2 || '').trim() || null,
    city: String(destination.city || '').trim(),
    state: String(destination.state || '').trim().toUpperCase(),
    zip: String(destination.zip || '').trim(),
    country: String(destination.country || 'US').trim().toUpperCase(),
    email: String(destination.email || '').trim().toLowerCase(),
    phone: String(destination.phone || '').trim(),
  };
  if (!row.recipient || !row.company || !row.line1 || !row.city || !/^[A-Z]{2}$/.test(row.state)
      || !/^\d{5}(?:-\d{4})?$/.test(row.zip) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return null;
  return row;
}

export function buildDistributorBlindOrderDraft({
  context,
  request = {},
  distributorProducts = [],
  ownerLots = [],
  products = [],
  inventory = [],
  pricingRows = [],
  contractRows = [],
  volumeBreakRows = [],
  paymentMethods = [],
  now = new Date(),
} = {}) {
  const authorization = authorizeCommerceContext(context || {});
  if (!authorization.ok) return authorization;
  if (authorization.session.role !== 'distributor') return { ok: false, reason: 'distributor_access_required' };
  const externalReference = String(request.external_reference || '').trim();
  if (!externalReference) return { ok: false, reason: 'external_reference_required' };
  const destination = normalizeDestination(request.destination);
  if (!destination) return { ok: false, reason: 'complete_destination_required' };
  const fulfillmentMode = String(request.fulfillment_mode || '').trim();
  if (!['distributor_pickup', 'third_party_carrier'].includes(fulfillmentMode)) return { ok: false, reason: 'fulfillment_mode_required' };
  const carrierName = String(request.carrier_name || '').trim();
  if (!carrierName) return { ok: false, reason: 'carrier_required' };
  const carrierAccountRef = String(request.carrier_account_ref || '').trim();
  if (fulfillmentMode === 'third_party_carrier' && !carrierAccountRef) return { ok: false, reason: 'carrier_account_required' };
  const rawLines = Array.isArray(request.lines) ? request.lines : [];
  if (!rawLines.length) return { ok: false, reason: 'order_lines_required' };
  const quantityBySource = new Map();
  for (const raw of rawLines) {
    const sku = String(raw?.sku || '').trim();
    const source = String(raw?.source || '').trim();
    const qty = Number(raw?.qty);
    if (!['owner', 'unite'].includes(source)) return { ok: false, reason: 'inventory_source_required', sku };
    if (!sku || !Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'invalid_order_line', sku };
    const key = `${source}:${sku}`;
    const current = quantityBySource.get(key) || { source, sku, qty: 0 };
    current.qty += qty;
    quantityBySource.set(key, current);
  }

  const lines = [];
  for (const requested of quantityBySource.values()) {
    if (requested.source === 'owner') {
      const product = distributorProducts.find((row) => row.owner_org_id === authorization.organization.id
        && (row.distributor_sku === requested.sku || row.id === requested.sku));
      if (!product) return { ok: false, reason: 'owner_product_not_found', sku: requested.sku };
      const available = ownerLots
        .filter((lot) => lot.owner_org_id === authorization.organization.id
          && (lot.distributor_sku === product.distributor_sku || lot.product_sku === product.mapped_unite_sku))
        .reduce((sum, lot) => sum + Math.max(0, number(lot.qty_on_hand) - number(lot.qty_reserved)), 0);
      if (available < requested.qty) return { ok: false, reason: 'insufficient_owner_inventory', sku: requested.sku, available };
      lines.push({
        sku: product.mapped_unite_sku || product.distributor_sku,
        distributor_sku: product.distributor_sku,
        name: product.name || product.product_name || product.distributor_sku,
        qty: requested.qty, unit_price: 0, ext_price: 0,
        inventory_owner_type: 'distributor', inventory_owner_org_id: authorization.organization.id,
        distributor_flow: 'blind_ship', settlement_eligible: false,
      });
      continue;
    }
    const product = products.find((row) => row.sku === requested.sku || row.id === requested.sku);
    const priced = resolveAuthoritativePrice({
      product, quantity: requested.qty, organization: authorization.organization,
      pricingRows, contractRows, volumeBreakRows, now,
    });
    if (!priced.ok) return { ...priced, sku: requested.sku };
    const available = inventory.filter((row) => row.sku === product.sku)
      .reduce((sum, row) => sum + Math.max(0, number(row.on_hand) - number(row.reserved)), 0);
    if (available < requested.qty) return { ok: false, reason: 'insufficient_stock', sku: requested.sku, available };
    lines.push({
      sku: product.sku, name: product.name, qty: requested.qty,
      unit_price: priced.unit_price, list_price: priced.list_price,
      pricing_basis: priced.basis, ext_price: money(priced.unit_price * requested.qty),
      inventory_owner_type: 'unite', inventory_owner_org_id: null,
      distributor_flow: 'blind_ship', settlement_eligible: false,
    });
  }

  const total = money(lines.reduce((sum, line) => sum + line.ext_price, 0));
  const paymentMethod = String(request.payment_method || '').trim();
  let paymentStatus = 'not_required';
  let status = 'payment_released';
  if (total > 0) {
    const grant = paymentMethods.find((row) => row.org_id === authorization.organization.id
      && row.method === paymentMethod && row.status === 'active');
    if (!grant) return { ok: false, reason: 'payment_method_not_allowed' };
    if (/^net\d+$/.test(paymentMethod) && grant.credit_limit != null && total > number(grant.credit_limit)) {
      return { ok: false, reason: 'over_credit_limit', credit_limit: number(grant.credit_limit) };
    }
    paymentStatus = 'pending';
    status = 'payment_pending';
  }
  const placedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  return {
    ok: true,
    order: {
      customer_id: authorization.organization.id,
      customer_name: authorization.organization.name,
      placed_by: authorization.session.user_id,
      contact_email: authorization.session.email,
      public_order_reference: externalReference,
      distributor_flow: 'blind_ship', blind_ship: true,
      on_behalf_of_org_id: authorization.organization.id,
      destination,
      fulfillment_mode: fulfillmentMode,
      carrier_name: carrierName,
      carrier_service: String(request.carrier_service || '').trim() || null,
      carrier_account_ref: carrierAccountRef ? carrierAccountRef.slice(-12) : null,
      payment_method: total > 0 ? paymentMethod : 'not_required',
      payment_terms: total > 0 ? paymentMethod : 'not_required',
      payment_status: paymentStatus,
      status,
      subtotal: total, freight: 0, tax: 0, total,
      order_source: 'distributor_portal',
      fulfillment_revision: 0,
      placed_at: placedAt,
    },
    lines,
  };
}

export function planDistributorReadiness({ order, actorId, evidence = {}, now = new Date() } = {}) {
  if (!order || order.distributor_flow !== 'blind_ship' || order.blind_ship !== true) {
    return { ok: false, reason: 'distributor_blind_order_required' };
  }
  if (order.status !== 'inventory_reserved') return { ok: false, reason: 'inventory_not_reserved' };
  const actor = String(actorId || '').trim();
  if (!actor) return { ok: false, reason: 'warehouse_actor_required' };
  const providerReference = String(evidence.provider_reference || '').trim();
  const documentType = String(evidence.document_type || '').trim().toLowerCase();
  if (!providerReference || !['booking', 'label', 'bol', 'pro'].includes(documentType)) {
    return { ok: false, reason: 'carrier_evidence_required' };
  }
  const occurredAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const pickup = order.fulfillment_mode === 'distributor_pickup';
  if (!pickup && order.fulfillment_mode !== 'third_party_carrier') return { ok: false, reason: 'fulfillment_mode_invalid' };
  const shipment = {
    id: `shipment_${crypto.createHash('sha256').update(`${order.id}:distributor-ready`).digest('hex').slice(0, 20)}`,
    order_id: order.id,
    customer_id: order.customer_id,
    mode: order.fulfillment_mode,
    carrier: order.carrier_name,
    carrier_service: order.carrier_service || null,
    carrier_account_ref: order.carrier_account_ref || null,
    status: pickup ? 'pickup_ready' : 'label_created',
    tracking_number: pickup ? null : providerReference,
    provider_reference: providerReference,
    document_type: documentType,
    ready_at: occurredAt,
    ready_by: actor,
    events: [{ ts: occurredAt, kind: 'warehouse_ready', reference: providerReference, document_type: documentType }],
  };
  return {
    ok: true,
    order: {
      ...order,
      status: pickup ? 'ready_for_pickup' : 'ready_to_ship',
      fulfillment_revision: number(order.fulfillment_revision) + 1,
      warehouse_ready_at: occurredAt,
      warehouse_ready_by: actor,
      updated_at: occurredAt,
    },
    shipment,
  };
}
