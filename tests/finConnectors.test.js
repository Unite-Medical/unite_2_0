import test from 'node:test';
import assert from 'node:assert/strict';
import { issueFinToken, verifyFinToken, projectFinOrders, searchFinCatalog, finCustomerContext } from '../api/_lib/fin.js';
import { createSessionToken, verifySessionToken } from '../api/_lib/auth.js';
const secret = 'synthetic-test-secret-at-least-24-characters';
const session = { user_id: 'u1', org_id: 'o1', role: 'customer', session_revision: 3 };

test('Fin credentials expire, reject tampering, and cannot authenticate ordinary Unite APIs', () => {
 const token = issueFinToken(session, { secret, now: 1000000 });
 assert.deepEqual(verifyFinToken(token, { secret, now: 1000001 }), session);
 assert.equal(verifyFinToken(token, { secret, now: 1900000 }), null);
 assert.equal(verifyFinToken(token.replace('eyJ', 'aaJ'), { secret, now: 1000001 }), null);
 assert.equal(verifyFinToken(token, { secret: 'different-test-secret-more-than-24', now: 1000001 }), null);
 assert.equal(verifySessionToken(token, { secret, now: 1000001 }), null);
 assert.equal(verifyFinToken(createSessionToken(session, { secret }), { secret }), null);
 assert.equal(verifyFinToken(issueFinToken({ ...session, role: 'admin' }, { secret }), { secret }), null);
});
test('Order projection denies another organization and strips internal and financial fields', () => {
 const rows = { orders: [{ id: 'a', customer_id: 'o1', po_number: 'PO-1', status: 'pending', supplier_cost: 123, internal_note: 'secret' }, { id: 'b', customer_id: 'o2', po_number: 'PO-1' }], items: [{ order_id: 'a', sku: 'SKU', qty: 2, unit_price: 99, margin: 5 }, { order_id: 'b', sku: 'PRIVATE' }], shipments: [{ order_id: 'b', tracking_number: 'OTHER' }] };
 const output = projectFinOrders(rows, 'o1', 'PO-1');
 assert.equal(output.length, 1); assert.equal(output[0].id, 'a');
 for (const denied of ['supplier_cost', 'internal_note', 'unit_price', 'margin', 'PRIVATE', 'OTHER']) assert.equal(JSON.stringify(output).includes(denied), false);
 assert.deepEqual(projectFinOrders(rows, 'o1', 'b'), []);
 assert.deepEqual(projectFinOrders(rows, 'o1', ''), []);
});
test('Catalog only returns approved public products and does not expose private fields, price or stock', () => {
 const base = { name: 'Test Widget', sku: 'ABC', category: 'Supplies', published: true, launch_decision: 'Launch', status: 'active', cost: 20, price: 50, available: true, variants: [{ sku: 'ABC-C', title: 'Case of 20', price: 60, cost: 9 }] };
 const result = searchFinCatalog([base, { ...base, published: false }, { ...base, launch_decision: 'Hold' }, { ...base, status: 'draft' }], 'ABC-C');
 assert.equal(result.length, 1); assert.deepEqual(result[0].variants, [{ sku: 'ABC-C', title: 'Case of 20' }]);
 assert.equal('price' in result[0], false); assert.equal('cost' in result[0], false); assert.equal('available' in result[0], false);
 assert.deepEqual(searchFinCatalog([base], '*'), []);
});
test('Current membership, profile status and session revision are rechecked', async () => {
 const profile = { id: 'u1', org_id: 'o1', role: 'customer', status: 'active', session_revision: 3 };
 const organization = { id: 'o1', status: 'active' };
 const mock = (p=profile, membership='active') => async strings => [{ data: strings.join('').includes("tbl='profiles'") ? p : strings.join('').includes("tbl='organizations'") ? organization : {status: membership} }];
 assert.ok(await finCustomerContext(mock(), session));
 assert.equal(await finCustomerContext(mock(profile, 'inactive'), session), null);
 assert.equal(await finCustomerContext(mock({ ...profile, session_revision: 4 }), session), null);
 assert.equal(await finCustomerContext(mock({ ...profile, status: 'disabled' }), session), null);
});
