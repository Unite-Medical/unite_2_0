import crypto from 'node:crypto';
import { qboAccessContext } from './qboTokens.js';
import { SERVICES } from './services.js';

const day = value => new Date(value).toISOString().slice(0, 10);
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
export function reportPeriod(input = {}, now = new Date()) {
  const end = input.end || day(now);
  const start = input.start || end.slice(0, 7) + '-01';
  for (const date of [start, end]) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || day(date) !== date) throw new Error('Choose valid report dates.');
  }
  if (start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 731) throw new Error('Choose a period of at most two years, with the start before the end.');
  const basis = input.basis || 'Accrual';
  if (!['Accrual', 'Cash'].includes(basis)) throw new Error('Choose Accrual or Cash accounting.');
  return { start, end, basis };
}

export function flattenQboReport(report) {
  const rows = [];
  function walk(list, depth = 0) {
    for (const row of list || []) {
      if (row.Header?.ColData) rows.push({ depth, type: 'heading', group: row.group || '', cells: row.Header.ColData.map(c => String(c.value ?? '')) });
      if (row.ColData) rows.push({ depth, type: 'data', group: row.group || '', cells: row.ColData.map(c => String(c.value ?? '')) });
      walk(row.Rows?.Row, depth + 1);
      if (row.Summary?.ColData) rows.push({ depth, type: 'total', group: row.group || '', cells: row.Summary.ColData.map(c => String(c.value ?? '')) });
    }
  }
  walk(report.Rows?.Row);
  return { name: report.Header?.ReportName, currency: report.Header?.Currency || null, basis: report.Header?.ReportBasis || null, start: report.Header?.StartPeriod, end: report.Header?.EndPeriod, generated_at: report.Header?.Time, columns: (report.Columns?.Column || []).map(c => c.ColTitle || c.ColType), rows };
}

export async function readAccountingReports(sql, period, { getContext = qboAccessContext, fetchImpl = fetch } = {}) {
  let context;
  try { context = await getContext(sql); }
  catch (error) { return { status: 'unavailable', message: error.message === 'qbo_not_connected' ? 'Connect the migrated QuickBooks Online company to load accounting reports.' : 'QuickBooks authorization needs attention. Reconnect the company in Integrations.', reports: [] }; }
  const root = context.environment === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com';
  const definitions = [['ProfitAndLoss', 'Profit & loss'], ['BalanceSheet', 'Balance sheet'], ['AgedReceivables', 'Receivables aging'], ['AgedPayables', 'Payables aging']];
  const results = await Promise.allSettled(definitions.map(async ([name, label]) => {
    const url = new URL(`${root}/v3/company/${encodeURIComponent(context.realmId)}/reports/${name}`);
    url.searchParams.set('minorversion', '75');
    if (name === 'ProfitAndLoss') url.searchParams.set('start_date', period.start);
    if (!name.startsWith('Aged')) url.searchParams.set('end_date', period.end);
    if (name === 'ProfitAndLoss' || name === 'BalanceSheet') url.searchParams.set('accounting_method', period.basis);
    if (name.startsWith('Aged')) url.searchParams.set('report_date', period.end);
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${context.accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    if (!response.ok || !body.Header || body.Fault) {
      const error = new Error('Report unavailable');
      error.http_status = response.status;
      const fault = body.Fault?.Error?.[0];
      error.provider_code = /^[a-zA-Z0-9_]+$/.test(String(fault?.code)) ? String(fault.code) : null;
      error.provider_message = String(fault?.Message || '').slice(0, 180);
      throw error;
    }
    return { id: name, label, status: 'ready', ...flattenQboReport(body) };
  }));
  const reports = results.map((r, i) => r.status === 'fulfilled' ? r.value : { id: definitions[i][0], label: definitions[i][1], status: 'unavailable', http_status: r.reason?.http_status || null, provider_code: r.reason?.provider_code || null, provider_message: r.reason?.provider_message || null, message: 'QuickBooks did not return this report. Check company access and report availability.' });
  return { status: reports.every(r => r.status === 'ready') ? 'ready' : reports.some(r => r.status === 'ready') ? 'partial' : 'unavailable', environment: context.environment, company_id: context.realmId, retrieved_at: new Date().toISOString(), reports };
}

const orderQuery = `query UniteBI($query:String!,$after:String){orders(first:100,after:$after,query:$query,sortKey:CREATED_AT){nodes{id name createdAt cancelledAt test displayFinancialStatus displayFulfillmentStatus customer{id displayName} currentTotalPriceSet{shopMoney{amount currencyCode}} currentSubtotalPriceSet{shopMoney{amount currencyCode}} totalRefundedSet{shopMoney{amount currencyCode}}} pageInfo{hasNextPage endCursor}}}`;
const cents = money => {
  if (!money || !/^-?\d+(\.\d+)?$/.test(String(money.amount)) || !money.currencyCode) throw new Error('Shopify returned incomplete monetary data.');
  return Math.round(Number(money.amount) * 100);
};
export function summarizeShopifyOrders(orders) {
  const currencies = new Map(), months = new Map(), customers = new Map(), seen = new Set();
  let test = 0, cancelled = 0;
  for (const order of orders) {
    if (!order.id || seen.has(order.id)) continue;
    seen.add(order.id);
    if (order.test) { test++; continue; }
    if (order.cancelledAt) { cancelled++; continue; }
    const total = order.currentTotalPriceSet?.shopMoney, subtotal = order.currentSubtotalPriceSet?.shopMoney, refund = order.totalRefundedSet?.shopMoney;
    const currency = total?.currencyCode;
    if (subtotal?.currencyCode !== currency || refund?.currencyCode !== currency) throw new Error('Shopify returned inconsistent currencies.');
    const amount = cents(total), merchandise = cents(subtotal), refunds = cents(refund);
    const bucket = currencies.get(currency) || { currency, orders: 0, current_order_value_cents: 0, merchandise_cents: 0, lifetime_refunds_cents: 0, unfulfilled: 0 };
    bucket.orders++; bucket.current_order_value_cents += amount; bucket.merchandise_cents += merchandise; bucket.lifetime_refunds_cents += refunds;
    if (['UNFULFILLED', 'PARTIALLY_FULFILLED', 'IN_PROGRESS', 'ON_HOLD', 'SCHEDULED'].includes(order.displayFulfillmentStatus)) bucket.unfulfilled++;
    currencies.set(currency, bucket);
    const month = String(order.createdAt).slice(0, 7), key = month + ':' + currency;
    const trend = months.get(key) || { month, currency, orders: 0, current_order_value_cents: 0 };
    trend.orders++; trend.current_order_value_cents += amount; months.set(key, trend);
    // Guests remain separate orders; unrelated anonymous customers are never merged.
    const id = order.customer?.id || order.id, customerKey = id + ':' + currency;
    const customer = customers.get(customerKey) || { id, name: order.customer?.displayName || 'Guest · ' + order.name, currency, orders: 0, current_order_value_cents: 0 };
    customer.orders++; customer.current_order_value_cents += amount; customers.set(customerKey, customer);
  }
  const convert = row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.endsWith('_cents') ? k.slice(0, -6) : k, k.endsWith('_cents') ? v / 100 : v]));
  return { fetched_orders: seen.size, excluded_test_orders: test, excluded_cancelled_orders: cancelled, currencies: [...currencies.values()].map(r => ({ ...convert(r), average_order_value: round(r.current_order_value_cents / 100 / r.orders) })), monthly: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map(convert), customers: [...customers.values()].sort((a, b) => b.current_order_value_cents - a.current_order_value_cents).map(convert) };
}

export async function readShopifyReport(period, { service = SERVICES.shopify, fetchImpl = fetch, now = () => Date.now() } = {}) {
  if (!service.configured()) return { status: 'unavailable', message: 'Shopify Admin access is not configured.' };
  const started = now(), orders = [], seenCursors = new Set();
  let cursor = null, hasMore = true, scopes = [], timezone = null;
  try {
    const url = service.buildUrl('/admin/api/' + (process.env.SHOPIFY_API_VERSION || '2026-04') + '/graphql.json', {}), headers = await service.headers();
    async function query(query, variables = {}) {
      const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('Shopify request failed');
      const result = await response.json();
      if (result.errors?.length || !result.data) throw new Error('Shopify query failed');
      return result.data;
    }
    const meta = await query('{currentAppInstallation{accessScopes{handle}} shop{ianaTimezone}}');
    scopes = meta.currentAppInstallation.accessScopes.map(s => s.handle); timezone = meta.shop.ianaTimezone;
    // Explicit UTC bounds keep API selection and displayed monthly grouping consistent.
    const nextDay = day(Date.parse(period.end) + 86400000);
    const filter = `created_at:>='${period.start}T00:00:00Z' created_at:<'${nextDay}T00:00:00Z'`;
    while (hasMore && orders.length < 5000 && now() - started < 22000) {
      const data = await query(orderQuery, { query: filter, after: cursor });
      if (!Array.isArray(data.orders?.nodes) || !data.orders.pageInfo) throw new Error('Incomplete Shopify page');
      orders.push(...data.orders.nodes); hasMore = data.orders.pageInfo.hasNextPage;
      cursor = data.orders.pageInfo.endCursor;
      if (hasMore && (!cursor || seenCursors.has(cursor))) throw new Error('Shopify pagination stalled');
      seenCursors.add(cursor);
    }
    const restrictedHistory = Date.parse(period.start) < now() - 60 * 86400000 && !scopes.includes('read_all_orders');
    return { status: hasMore || restrictedHistory ? 'partial' : 'ready', source: 'Live Shopify Admin', retrieved_at: new Date().toISOString(), timezone: 'UTC', store_timezone: timezone, all_orders_access: scopes.includes('read_all_orders'), ...summarizeShopifyOrders(orders), warnings: [hasMore && 'Only part of this period was loaded. Narrow the dates before using these figures as totals.', restrictedHistory && 'This connection cannot read the full order history older than 60 days.'].filter(Boolean) };
  } catch {
    return { status: 'unavailable', message: 'Shopify could not complete the report. Check the connection or use a smaller date range.' };
  }
}

export async function buildBusinessReport(sql, input, dependencies = {}) {
  const period = reportPeriod(input);
  const [qbo, shopify] = await Promise.all([readAccountingReports(sql, period, dependencies.qbo), readShopifyReport(period, dependencies.shopify)]);
  const notes = [
    'QuickBooks is the accounting source. Shopify is an order cohort view. Never add their sales figures together.',
    'Shopify includes non-test, non-cancelled orders created during the selected UTC dates, valued as they stand at retrieval. Current order value includes tax and shipping; merchandise subtotal follows Shopify’s current subtotal definition.',
    'Lifetime refunds relate to the selected orders and may have occurred outside this period. They are not refunds issued during this period and are not subtracted again from current order value.',
    'Receivables, payables and balance sheet are as of the end date. Aging is reported by QuickBooks; Profit & Loss uses the selected accounting basis.',
    'Cross-system order matching and SKU-level verified costs are not yet established. Unmatched sales are not automatically posted to QuickBooks.',
  ];
  const report = { id: crypto.randomUUID(), created_at: new Date().toISOString(), period, qbo, shopify, notes };
  report.findings = [
    qbo.status === 'ready' ? 'QuickBooks returned all four accounting reports.' : 'Accounting coverage is incomplete; do not infer profit or receivables from Shopify.',
    ...(shopify.currencies || []).map(c => `${c.orders} eligible Shopify orders in ${c.currency}; ${c.unfulfilled} have open fulfillment work.`),
    ...(shopify.warnings || []),
    shopify.status === 'unavailable' && shopify.message,
    qbo.environment === 'sandbox' && 'QuickBooks is connected to a sandbox company. These are test accounting figures.',
  ].filter(Boolean);
  return report;
}

export async function saveBusinessReport(sql, report, actorId) {
  const saved = { ...report, created_by: actorId };
  await sql`INSERT INTO um_rows(tbl,id,data) VALUES('business_reports',${report.id},${JSON.stringify(saved)}::jsonb)`;
  return saved;
}
export async function getBusinessReport(sql, id) {
  if (!/^[a-f0-9-]{36}$/.test(String(id))) throw new Error('Choose a saved BI report.');
  const row = (await sql`SELECT data FROM um_rows WHERE tbl='business_reports' AND id=${id} AND deleted=false`)[0]?.data;
  if (!row) throw new Error('This BI report is unavailable.');
  return row;
}
