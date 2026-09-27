import { test } from 'node:test';
import assert from 'node:assert/strict';

import { commerceAccessFor } from '../src/lib/accessPolicy.js';
import { db } from '../src/lib/db.js';
import { cartStore } from '../src/store/cart.js';
import { productSchema } from '../src/lib/seo.js';
import { verifyQuickQuoteBusiness } from '../src/lib/selfServeQuote.js';
import { auth } from '../src/lib/auth.js';

test('anonymous visitors can build Quick Quotes but cannot see prices, cart, or order', () => {
  assert.deepEqual(commerceAccessFor(null, null), {
    authenticated: false,
    approved: false,
    can_view_prices: false,
    can_use_cart: false,
    can_order: false,
    can_quick_quote: true,
  });
});

test('signed but unapproved companies still cannot see prices or order', () => {
  const access = commerceAccessFor(
    { user_id: 'usr_pending', role: 'customer', org_id: 'org_pending' },
    { id: 'org_pending', approval_status: 'manual_review' },
  );
  assert.equal(access.authenticated, true);
  assert.equal(access.approved, false);
  assert.equal(access.can_view_prices, false);
  assert.equal(access.can_use_cart, false);
  assert.equal(access.can_order, false);
  assert.equal(access.can_quick_quote, true);
});

test('approved customer and distributor accounts may see prices and transact', () => {
  for (const role of ['customer', 'distributor']) {
    const access = commerceAccessFor(
      { user_id: `usr_${role}`, role, org_id: `org_${role}` },
      { id: `org_${role}`, approval_status: 'approved' },
    );
    assert.equal(access.can_view_prices, true);
    assert.equal(access.can_use_cart, true);
    assert.equal(access.can_order, true);
  }
});

test('server-approved account session can transact without hydrating the organization row', () => {
  const access = commerceAccessFor({
    user_id: 'usr_server_customer', role: 'customer', org_id: 'org_server_customer', approval_status: 'approved',
  }, null);
  assert.equal(access.can_view_prices, true);
  assert.equal(access.can_order, true);
});

test('migrated account pricing hold blocks commerce even after approval', () => {
  const access = commerceAccessFor({
    user_id: 'usr_migrated', role: 'customer', org_id: 'org_migrated', approval_status: 'approved',
    commerce_hold_reason: 'customer_pricing_source_missing',
  }, { id:'org_migrated', approval_status:'approved', commerce_hold_reason:'customer_pricing_source_missing' });
  assert.equal(access.can_view_prices, false);
  assert.equal(access.can_order, false);
  assert.equal(access.can_quick_quote, true);
});

test('internal staff sessions may see commercial pricing without a customer organization', () => {
  for (const role of ['admin', 'sales', 'sales_manager', 'customer_service', 'finance']) {
    assert.equal(commerceAccessFor({ user_id: `usr_${role}`, role }, null).can_view_prices, true);
  }
});

test('anonymous cart is empty and rejects direct add calls', () => {
  cartStore.reseatForUser();
  const seededProduct = db.list('products')[0];
  const demoRowsBefore = db.list('cart_items', { where: { cart_id: 'cart_demo' } }).length;

  assert.equal(cartStore.cartId(), null);
  assert.deepEqual(cartStore.items, []);
  assert.deepEqual(cartStore.add(seededProduct.id), { ok: false, reason: 'approved_account_required' });
  assert.equal(db.list('cart_items', { where: { cart_id: 'cart_demo' } }).length, demoRowsBefore);
});

test('anonymous product structured data excludes offer prices and ratings', () => {
  const schema = productSchema({
    sku: 'PRIVATE-PRICE', name: 'Private Price Product', category: 'PPE', pack_size: '1 case', price: 99,
  }, { stock: 12, includePricing: false });

  assert.equal('offers' in schema, false);
  assert.equal('aggregateRating' in schema, false);
  assert.equal(JSON.stringify(schema).includes('99'), false);
});

test('Quick Quote verification requires a matching work email and creates follow-up without account approval', () => {
  const blocked = verifyQuickQuoteBusiness({
    company_name: 'Personal Mail Buyer', contact_name: 'Personal Buyer',
    email: 'buyer@gmail.com', website: 'personal-mail-buyer.example', shipping_zip: '30305',
  });
  assert.deepEqual(blocked, { ok: false, reason: 'work_email_required' });

  const result = verifyQuickQuoteBusiness({
    company_name: 'Verified Surgical', contact_name: 'Jordan Buyer',
    email: 'jordan@verified-surgical.example', website: 'verified-surgical.example', shipping_zip: '30305',
  });
  assert.equal(result.ok, true);
  assert.equal(result.organization.approval_status, 'quote_verified');
  assert.equal(commerceAccessFor({ user_id: 'not-created', role: 'customer', org_id: result.organization.id }, result.organization).can_order, false);
  assert.ok(db.list('contacts').some((contact) => contact.email === 'jordan@verified-surgical.example'));
  assert.ok(db.list('tasks').some((task) => task.kind === 'quick_quote_follow_up' && task.ref_id === result.organization.id));
  assert.equal(db.list('profiles').some((profile) => profile.email === 'jordan@verified-surgical.example'), false);
});

test('newly approved registration starts on retail pricing and ACH invoice payment only', async () => {
  const email = `buyer-${Date.now()}@registration-policy.example`;
  const registered = await auth.register({
    email,
    password: 'registration-test-password',
    name: 'Registration Buyer',
    org_name: 'Registration Policy Surgical',
    segment: 'asc',
    website: 'registration-policy.example',
  });
  const organization = db.get('organizations', registered.org_id);
  const methods = db.list('account_payment_methods', { where: { org_id: registered.org_id } });

  assert.equal(organization.approval_status, 'approved');
  assert.equal(organization.tier, 'C');
  assert.equal(organization.terms, 'ach');
  assert.deepEqual(methods.map((method) => method.method), ['ach']);
  assert.equal(commerceAccessFor(registered, organization).can_order, true);
});
