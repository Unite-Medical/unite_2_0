import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePoDraft, draftFromQboPo, buildQboPo, qboPoRequest, poTransferId } from '../api/_lib/qboPurchaseOrders.js';
import { parsePoCsv, poLinesFromRows } from '../src/lib/poFileImport.js';

const draft = { doc_number: 'PO-101', vendor_name: 'Supplier', vendor_qbo_id: '8', txn_date: '2026-09-27', currency: 'USD', line_items: [{ sku: 'SKU-1', name: 'Item', qty: 3, cost: 2.15, qbo_item_id: '5' }] };
const remote = { Id: '7', SyncToken: '0', POStatus: 'Open', DocNumber: 'PO-101', TxnDate: '2026-09-27', VendorRef: { value: '8', name: 'Supplier' }, TotalAmt: 6.45, Line: [{ Id: '1', Amount: 6.45, Description: 'Item', DetailType: 'ItemBasedExpenseLineDetail', ItemBasedExpenseLineDetail: { ItemRef: { value: '5', name: 'SKU-1' }, Qty: 3, UnitPrice: 2.15, BillableStatus: 'NotBillable' } }] };
test('PO validation never supplies default vendor/item IDs or accepts invalid amounts', () => {
  assert.equal(normalizePoDraft(draft).total_cost, 6.45);
  for (const cost of [-1, NaN, Infinity]) assert.throws(() => normalizePoDraft({ ...draft, line_items: [{ ...draft.line_items[0], cost }] }));
  for (const cost of ['', null, undefined]) assert.throws(() => normalizePoDraft({ ...draft, line_items: [{ ...draft.line_items[0], cost }] }), /quantity_and_cost_required/);
  assert.throws(() => normalizePoDraft({ ...draft, txn_date: '2026-02-30' }));
  assert.throws(() => normalizePoDraft({ ...draft, currency: 'EUR' }));
  assert.throws(() => buildQboPo({ ...draft, vendor_qbo_id: '' }), /map_vendor/);
  assert.throws(() => buildQboPo({ ...draft, line_items: [{ ...draft.line_items[0], qbo_item_id: null }] }), /map_vendor/);
});
test('QBO import handles zero SyncToken and refuses unsupported or linked accounting records', () => {
  assert.equal(draftFromQboPo(remote).total_cost, 6.45);
  for (const change of [{ POStatus: 'Closed' }, { TotalAmt: 20 }, { CurrencyRef: { value: 'EUR' } }, { LinkedTxn: [{ TxnId: '9' }] }, { TxnTaxDetail: { TotalTax: 1 } }]) assert.throws(() => draftFromQboPo({ ...remote, ...change }));
});
test('updates carry SyncToken and preserve existing line metadata without silently replacing item mappings', () => {
  const payload = buildQboPo(draft, remote);
  assert.equal(payload.SyncToken, '0'); assert.equal(payload.sparse, true);
  assert.equal(payload.Line[0].Id, '1'); assert.equal(payload.Line[0].ItemBasedExpenseLineDetail.BillableStatus, 'NotBillable');
  assert.throws(() => buildQboPo({ ...draft, line_items: [{ ...draft.line_items[0], qbo_item_id: '99' }] }, remote), /change_item_mapping/);
  assert.equal(poTransferId('realm', payload), poTransferId('realm', payload));
  assert.notEqual(poTransferId('other', payload), poTransferId('realm', payload));
});
test('requests preserve query encoding, idempotency ID and server-side bearer authorization', async () => {
  let call;
  const result = await qboPoRequest({ environment: 'sandbox', realmId: '123', accessToken: 'test' }, 'purchaseorder', { body: buildQboPo(draft), requestId: 'idempotent', fetchImpl: async (url, options) => { call = { url, options }; return { ok: true, json: async () => ({ PurchaseOrder: remote }) }; } });
  assert.equal(result.PurchaseOrder.Id, '7'); assert.equal(call.url.hostname, 'sandbox-quickbooks.api.intuit.com');
  assert.equal(call.url.searchParams.get('requestid'), 'idempotent'); assert.equal(call.options.headers.Authorization, 'Bearer test');
  await assert.rejects(qboPoRequest({}, 'https://attacker.example'), /invalid_qbo_route/);
  await assert.rejects(qboPoRequest({ realmId: '123' }, 'query', { fetchImpl: async () => ({ ok: false, status: 400, headers: new Headers({ intuit_tid: 'tid' }), json: async () => ({ Fault: { secret: 'not returned' } }) }) }), e => e.message === 'quickbooks_request_failed' && e.tid === 'tid' && !e.message.includes('secret'));
});
test('spreadsheet import respects quoted commas, newlines and zero cost; rejects malformed numbers and formulas', () => {
  const rows = parsePoCsv('sku,description,quantity,unit_cost,qbo_item_id\r\nA,"Item, with comma",2,0,5\r\nB,"Multiline\nitem",1,2.5,6');
  assert.equal(poLinesFromRows(rows)[0].name, 'Item, with comma');
  assert.equal(poLinesFromRows(rows)[1].cost, 2.5);
  assert.throws(() => parsePoCsv('a,"unterminated'), /unclosed/);
  assert.throws(() => poLinesFromRows([rows[0], ['A', 'Item', '=2+2', '5']]), /valid numbers/);
  assert.throws(() => poLinesFromRows([rows[0], ['A', 'Item', '2', '']]), /valid numbers/);
});
