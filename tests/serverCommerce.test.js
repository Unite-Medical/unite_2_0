import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  authorizeCommerceContext,
  resolveAuthoritativePrice,
  buildAuthoritativeOrderDraft,
} from '../api/_lib/commerce.js';
import { orderRequestHash } from '../api/orders/place.js';

const session = { user_id: 'usr_buyer', role: 'customer', org_id: 'org_customer', email: 'buyer@customer.test' };
const profile = { id: 'usr_buyer', role: 'customer', org_id: 'org_customer', status: 'active' };
const organization = { id: 'org_customer', name: 'Customer Medical', approval_status: 'approved', tier: 'C', status: 'active' };
const membership = { user_id: 'usr_buyer', org_id: 'org_customer', role: 'buyer', status: 'active' };

test('commerce authorization requires current approved organization and owner or buyer membership', () => {
  assert.equal(authorizeCommerceContext({ session, profile, organization, membership }).ok, true);
  assert.equal(authorizeCommerceContext({ session, profile, organization: { ...organization, approval_status: 'manual_review' }, membership }).reason, 'account_not_approved');
  assert.equal(authorizeCommerceContext({ session, profile, organization: { ...organization, commerce_hold_reason: 'customer_pricing_source_missing' }, membership }).reason, 'customer_pricing_source_missing');
  assert.equal(authorizeCommerceContext({ session, profile: { ...profile, status: 'suspended' }, organization, membership }).reason, 'profile_inactive');
  assert.equal(authorizeCommerceContext({ session, profile, organization, membership: { ...membership, role: 'viewer' } }).reason, 'buyer_authority_required');
  assert.equal(authorizeCommerceContext({ session: { ...session, org_id: 'org_forged' }, profile, organization, membership }).reason, 'organization_mismatch');
});

test('order idempotency hash is line-order independent and rejects changed intent', () => {
  const request = {
    po_number: 'PO-1', payment_method: 'ach', ship_to_address_id: 'addr_1',
    lines: [{ sku: 'B', qty: 2 }, { sku: 'A', qty: 1 }],
  };
  const first = orderRequestHash(session, request);
  const reordered = orderRequestHash(session, { ...request, lines: [...request.lines].reverse() });
  const changed = orderRequestHash(session, { ...request, lines: [{ sku: 'B', qty: 3 }, { sku: 'A', qty: 1 }] });
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});

test('authoritative pricing applies active contract and quantity rules without trusting browser price', () => {
  const result = resolveAuthoritativePrice({
    product: { sku: 'SKU-1', price: 100, quote_only: false },
    quantity: 20,
    organization,
    pricingRows: [{ sku: 'SKU-1', min_qty: 10, unit_price: 95 }],
    contractRows: [{ id: 'contract-1', org_id: organization.id, product_sku: 'SKU-1', min_qty: 10, unit_price: 81 }],
    volumeBreakRows: [{ product_sku: 'SKU-1', min_qty: 20, discount_pct: 10 }],
    now: new Date('2026-07-18T12:00:00Z'),
  });
  assert.deepEqual(result, {
    ok: true, sku: 'SKU-1', quantity: 20, unit_price: 81, list_price: 95,
    basis: 'contract', tier: 'C', contract_id: 'contract-1',
  });
  assert.equal(resolveAuthoritativePrice({ product: { sku: 'QUOTE', quote_only: true }, quantity: 1, organization }).reason, 'quote_only');
});

test('server order draft requires PO and uses authoritative price, payment, address, and identity', () => {
  const base = {
    context: { session, profile, organization, membership },
    request: {
      po_number: 'PO-CUSTOMER-44',
      payment_method: 'ach',
      ship_to_address_id: 'address-owned',
      lines: [{ sku: 'SKU-1', qty: 2, unit_price: 0.01, customer_id: 'org_forged' }],
    },
    products: [{ sku: 'SKU-1', name: 'Sterile product', price: 100, quote_only: false }],
    pricingRows: [],
    contractRows: [],
    volumeBreakRows: [],
    paymentMethods: [{ org_id: organization.id, method: 'ach', status: 'active' }],
    addresses: [{ id: 'address-owned', org_id: organization.id, line1: '1 Medical Way' }],
  };
  const result = buildAuthoritativeOrderDraft(base);
  assert.equal(result.ok, true);
  assert.equal(result.order.customer_id, organization.id);
  assert.equal(result.order.placed_by, session.user_id);
  assert.equal(result.lines[0].unit_price, 100);
  assert.equal(result.lines[0].ext_price, 200);
  assert.equal(result.order.subtotal, 200);
  assert.equal(result.order.total, 242);

  assert.equal(buildAuthoritativeOrderDraft({ ...base, request: { ...base.request, po_number: '' } }).reason, 'customer_po_required');
  assert.equal(buildAuthoritativeOrderDraft({ ...base, request: { ...base.request, payment_method: 'card' } }).reason, 'payment_method_not_allowed');
  assert.equal(buildAuthoritativeOrderDraft({ ...base, request: { ...base.request, ship_to_address_id: 'address-other' } }).reason, 'shipping_address_not_owned');
});
