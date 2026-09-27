import test from 'node:test';
import assert from 'node:assert/strict';
import { reportPeriod, flattenQboReport, summarizeShopifyOrders, readShopifyReport, readAccountingReports, buildBusinessReport } from '../api/_lib/businessIntelligence.js';
const period = { start: '2026-09-01', end: '2026-09-26', basis: 'Accrual' };
const money = (amount, currencyCode = 'USD') => ({ shopMoney: { amount: String(amount), currencyCode } });
const order = (id, total = '120.10', extra = {}) => ({ id, name: '#'+id, createdAt: '2026-09-10T12:00:00Z', test: false, cancelledAt: null, displayFulfillmentStatus: 'UNFULFILLED', customer: { id: 'c1', displayName: 'Customer' }, currentTotalPriceSet: money(total), currentSubtotalPriceSet: money('100'), totalRefundedSet: money('5'), ...extra });
test('BI period rejects invalid dates, invalid bases and unbounded backfills', () => {
  assert.deepEqual(reportPeriod(period), period);
  for (const input of [{ start: '2026-02-30' }, { start: "x' OR true" }, { start: '2026-10-01', end: '2026-09-01' }, { start: '2020-01-01', end: '2026-09-26' }, { basis: 'invented' }]) assert.throws(() => reportPeriod(input));
});
test('QBO row flattening preserves nesting, source totals and blank values', () => {
  const r = flattenQboReport({ Header: { Currency: 'USD', ReportName: 'ProfitAndLoss' }, Columns: { Column: [{ ColTitle: '' }, { ColTitle: 'Total' }] }, Rows: { Row: [{ group: 'Income', Header: { ColData: [{ value: 'Income' }] }, Rows: { Row: [{ ColData: [{ value: 'Sales' }, { value: '100.00' }] }] }, Summary: { ColData: [{ value: 'Total Income' }, { value: '100.00' }] } }] } });
  assert.equal(r.rows.length, 3); assert.equal(r.rows[1].depth, 1); assert.equal(r.rows[2].cells[1], '100.00'); assert.equal(r.rows[2].type, 'total'); assert.equal(r.currency, 'USD');
});
test('Shopify cohorts exclude tests/cancellations, deduplicate IDs and never subtract refunds twice', () => {
  const r = summarizeShopifyOrders([order('1'), order('1'), order('2', '.20'), order('3', 900, { test: true }), order('4', 800, { cancelledAt: '2026-09-11' })].map(o => o.id === '2' ? { ...o, currentTotalPriceSet: money('0.20') } : o));
  assert.equal(r.currencies[0].current_order_value, 120.30); assert.equal(r.currencies[0].lifetime_refunds, 10); assert.equal(r.currencies[0].orders, 2); assert.equal(r.currencies[0].average_order_value, 60.15); assert.equal(r.excluded_test_orders, 1); assert.equal(r.excluded_cancelled_orders, 1);
});
test('currencies and unrelated guest customers stay separate; incomplete money fails closed', () => {
  const euro = order('e', 100, { currentTotalPriceSet: money(100, 'EUR'), currentSubtotalPriceSet: money(90, 'EUR'), totalRefundedSet: money(0, 'EUR') });
  const r = summarizeShopifyOrders([order('1', 10, { customer: null }), order('2', 20, { customer: null }), euro]);
  assert.equal(r.currencies.length, 2); assert.equal(r.customers.length, 3);
  assert.throws(() => summarizeShopifyOrders([order('bad', 10, { currentTotalPriceSet: null })]));
  assert.throws(() => summarizeShopifyOrders([order('bad', 10, { totalRefundedSet: money(1, 'EUR') })]));
});
function shopifyFixture({ scopes = ['read_orders', 'read_all_orders'], pages = [], failAt = -1, now = () => Date.parse('2026-09-26') } = {}) {
  let calls = 0; const requests = [];
  const service = { configured: () => true, buildUrl: () => 'https://example.myshopify.com/graphql', headers: async () => ({}) };
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body); requests.push(body); const index = calls++;
    if (index === failAt) return { ok: false };
    const data = index === 0 ? { currentAppInstallation: { accessScopes: scopes.map(handle => ({ handle })) }, shop: { ianaTimezone: 'America/New_York' } } : { orders: pages[index - 1] };
    return { ok: true, json: async () => ({ data }) };
  };
  return { service, fetchImpl, now, requests };
}
test('Shopify report follows every page and uses explicit exclusive UTC end bounds', async () => {
  const fixture = shopifyFixture({ pages: [{ nodes: [order('1')], pageInfo: { hasNextPage: true, endCursor: 'p1' } }, { nodes: [order('2')], pageInfo: { hasNextPage: false, endCursor: 'p2' } }] });
  const result = await readShopifyReport(period, fixture);
  assert.equal(result.status, 'ready'); assert.equal(result.fetched_orders, 2); assert.equal(fixture.requests[2].variables.after, 'p1'); assert.match(fixture.requests[1].variables.query, /2026-09-27T00:00:00Z/);
});
test('missing historical scope is partial even if API silently returns a smaller cohort', async () => {
  const result = await readShopifyReport({ ...period, start: '2025-01-01' }, shopifyFixture({ scopes: ['read_orders'], pages: [{ nodes: [], pageInfo: { hasNextPage: false } }] }));
  assert.equal(result.status, 'partial'); assert.match(result.warnings[0], /60 days/);
});
test('page failure cannot return a complete total and capped pagination is explicitly partial', async () => {
  const pages = [{ nodes: [order('1')], pageInfo: { hasNextPage: true, endCursor: 'p1' } }];
  const failed = await readShopifyReport(period, shopifyFixture({ pages, failAt: 2 }));
  assert.equal(failed.status, 'unavailable'); assert.equal(failed.currencies, undefined);
  let tick = 0; const base = Date.parse('2026-09-26');
  const partial = await readShopifyReport(period, shopifyFixture({ pages, now: () => base + (tick++ < 2 ? 0 : 23000) }));
  assert.equal(partial.status, 'partial'); assert.equal(partial.fetched_orders, 1); assert.match(partial.warnings[0], /part of this period/);
});
test('accounting reports use only allowlisted GET routes and preserve per-report failure', async () => {
  const calls = [];
  const result = await readAccountingReports(null, period, { getContext: async () => ({ accessToken: 'test', realmId: 'r1', environment: 'sandbox' }), fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: !url.pathname.endsWith('AgedPayables'), json: async () => ({ Header: { ReportName: 'report', Currency: 'USD' }, Rows: { Row: [] } }) }; } });
  assert.equal(result.status, 'partial'); assert.equal(result.environment, 'sandbox'); assert.equal(result.reports[3].status, 'unavailable'); assert.equal(calls.length, 4); assert.ok(calls.every(c => !c.options.body && c.url.hostname === 'sandbox-quickbooks.api.intuit.com')); assert.equal(calls[0].url.searchParams.get('accounting_method'), 'Accrual'); assert.equal(calls[2].url.searchParams.get('report_date'), period.end);
});
test('missing QBO is unavailable, not zero profit; Shopify never becomes accounting revenue', async () => {
  const result = await buildBusinessReport(null, period, { qbo: { getContext: async () => { throw new Error('qbo_not_connected'); } }, shopify: shopifyFixture({ pages: [{ nodes: [order('1')], pageInfo: { hasNextPage: false } }] }) });
  assert.equal(result.qbo.status, 'unavailable'); assert.equal(result.shopify.status, 'ready'); assert.equal(result.revenue, undefined); assert.equal(result.profit, undefined); assert.match(result.findings[0], /incomplete/); assert.match(result.notes[0], /Never add/);
});
