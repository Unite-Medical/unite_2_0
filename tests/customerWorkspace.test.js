import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerWorkspace } from '../api/_lib/customerWorkspace.js';
const sales = { role: 'sales', email: 'JACOBE@unitemedical.net', user_id: 'jacobe' };
const tables = { organizations: [
 { id: 'own', name: 'Own', account_owner_email: 'jacobe@unitemedical.net', secret: 'hidden' },
 { id: 'other', name: 'Other', account_owner_email: 'other@example.test', account_rep: 'Jacobe' },
 { id: 'legacy', name: 'Legacy', account_rep: 'Jacobe' },
 { id: 'unassigned', name: 'Unassigned' },
 { id: 'merged', name: 'Merged', account_owner_id: 'jacobe', status: 'merged' },
], reps: [{ id: 'r1', name: 'Jacobe', email: 'jacobe@unitemedical.net' }], orders: [
 { id: 'own-order', customer_id: 'own', total: 123, provider_secret: 'hidden' },
 { id: 'other-order', customer_id: 'other', total: 456 },
], quotes: [{ id: 'q1', customer_id: 'legacy', total: 20, acceptance_token: 'hidden' }], backorders: [{ id: 'closed', customer_id: 'own', status: 'closed' }, { id: 'open', customer_id: 'own', status: 'waiting' }] };
test('sales receives only explicitly owned or uniquely attributed accounts and safe record fields', () => {
 const result = buildCustomerWorkspace(tables, sales);
 assert.deepEqual(result.accounts.map(a => a.id), ['legacy', 'own']);
 assert.equal(JSON.stringify(result).includes('hidden'), false);
 assert.equal(JSON.stringify(result).includes('other-order'), false);
 assert.equal(result.accounts[1].backorders.length, 1);
});
test('unassigned and missing identities never receive the first rep book', () => {
 assert.equal(buildCustomerWorkspace(tables, { role: 'sales' }).accounts.length, 0);
 assert.equal(buildCustomerWorkspace(tables, { ...sales, email: 'unknown@example.test', user_id: 'unknown' }).accounts.length, 0);
});
test('duplicate rep names fail closed for legacy attribution', () => {
 const result = buildCustomerWorkspace({ ...tables, reps: [...tables.reps, { id: 'r2', name: 'Jacobe', email: 'else@example.test' }] }, sales);
 assert.deepEqual(result.accounts.map(a => a.id), ['own']);
});
test('role boundaries exclude warehouse finance and customer identities', () => {
 for (const role of ['warehouse_operator', 'finance', 'customer', undefined]) assert.equal(buildCustomerWorkspace(tables, { ...sales, role }).ok, false);
 assert.equal(buildCustomerWorkspace(tables, { role: 'admin' }).accounts.length, 4);
});
test('explicit user and rep IDs are supported without granting manager-wide access', () => {
 const data = { organizations: [{id:'u',account_owner_id:'jacobe'},{id:'r',rep_id:'r1'},{id:'x',rep_id:'r2',account_rep:'Jacobe'}], reps: tables.reps };
 assert.deepEqual(buildCustomerWorkspace(data, {...sales,role:'sales_manager'}).accounts.map(a=>a.id),['r','u']);
});
