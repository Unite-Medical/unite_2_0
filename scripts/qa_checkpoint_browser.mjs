import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const WEB = process.env.QA_WEB_ORIGIN || 'http://127.0.0.1:5175';
const API = process.env.QA_API_ORIGIN || 'http://127.0.0.1:5173';
const outDir = path.resolve('artifacts/browser-qa');
await fs.mkdir(outDir, { recursive: true });

const report = { passed: [], details: {}, errors: [] };
function pass(name, detail = true) { report.passed.push(name); report.details[name] = detail; }
function restricted(text) {
  return [...new Set((String(text).match(/cogs|landed_per_unit|internal_cost|unit_cost|vendor_qbo|customer_po|org_atlsurgical|atlanta surgical center|password_hash|password_salt|db_sync_token/gi) || []).map((value) => value.toLowerCase()))];
}
async function settle(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(350);
}
async function body(page) { return page.locator('body').innerText(); }

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const apiResponses = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('response', async (response) => {
    const type = response.request().resourceType();
    if (!['xhr', 'fetch'].includes(type)) return;
    let sample = '';
    try { sample = (await response.text()).slice(0, 10000); } catch {}
    apiResponses.push({ url: response.url(), status: response.status(), restricted: restricted(sample) });
  });

  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/session') {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'authentication_required' }) });
    }
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'authentication_required' }) });
  });

  await page.goto(`${WEB}/`); await settle(page);
  const homepage = await body(page);
  assert.match(homepage, /The supply chain your suppliers use/i);
  assert.match(homepage, /Sign in for pricing/i);
  assert.doesNotMatch(homepage, /\$\s?\d/);
  assert.equal(restricted(homepage).length, 0);
  pass('anonymous homepage renders and is price-free');

  await page.goto(`${WEB}/catalog`); await settle(page);
  const catalog = await body(page);
  assert.match(catalog, /88 results/);
  assert.match(catalog, /Sign in for pricing/);
  assert.match(catalog, /Quick Quote/);
  assert.doesNotMatch(catalog, /\$\s?\d/);
  assert.equal(restricted(catalog).length, 0);
  await page.screenshot({ path: path.join(outDir, 'anonymous-catalog-desktop.png'), fullPage: false });
  pass('anonymous catalog is price-free', { products: 88 });

  const firstProduct = page.getByRole('link', { name: /WELLlife.*Influenza/i }).first();
  await firstProduct.click(); await settle(page);
  const product = await body(page);
  assert.match(product, /Sign in for pricing|Quick Quote/i);
  assert.doesNotMatch(product, /\$\s?\d/);
  assert.equal(restricted(product).length, 0);
  pass('anonymous product detail is price-free');

  for (const protectedPath of ['/cart', '/checkout', '/account/order', '/distributor', '/admin/finance', '/admin/inventory/receive']) {
    await page.goto(`${WEB}${protectedPath}`); await settle(page);
    assert.match(page.url(), /\/login\?next=/, `${protectedPath} did not redirect to login: ${page.url()}`);
    const text = await body(page);
    assert.equal(restricted(text).length, 0);
  }
  pass('protected routes redirect anonymous visitors', { routes: 6 });

  await page.goto(`${WEB}/catalog`); await settle(page);
  await page.getByRole('button', { name: /Add .* to Quick Quote/i }).first().click();
  await page.getByRole('link', { name: 'Quick Quote' }).click(); await settle(page);
  const quickQuote = await body(page);
  assert.match(quickQuote, /Quick Quote/i);
  assert.doesNotMatch(quickQuote, /\$\s?\d/);
  assert.equal(restricted(quickQuote).length, 0);
  pass('anonymous Quick Quote stays unpriced and non-ordering');

  const storage = await page.evaluate(async () => ({
    local: Object.entries(localStorage).map(([key, value]) => ({ key, bytes: value.length, restricted: [...new Set((value.match(/cogs|landed_per_unit|internal_cost|unit_cost|vendor_qbo|customer_po|org_atlsurgical|atlanta surgical center|password_hash|password_salt|db_sync_token/gi) || []).map((item) => item.toLowerCase()))] })),
    session: Object.entries(sessionStorage).map(([key, value]) => ({ key, bytes: value.length, restricted: [...new Set((value.match(/cogs|landed_per_unit|internal_cost|unit_cost|vendor_qbo|customer_po|org_atlsurgical|atlanta surgical center|password_hash|password_salt|db_sync_token/gi) || []).map((item) => item.toLowerCase()))] })),
    indexedDb: await indexedDB.databases(),
    cookies: document.cookie.split(';').map((item) => item.split('=')[0].trim()).filter(Boolean),
  }));
  assert.equal(storage.local.flatMap((entry) => entry.restricted).length, 0);
  assert.equal(storage.session.flatMap((entry) => entry.restricted).length, 0);
  assert.equal(storage.cookies.length, 0);
  pass('anonymous browser storage has no protected records', storage);

  const unauthorized = [];
  const probes = [
    ['GET', '/api/db/sync'],
    ['GET', '/api/distributor/overview'],
    ['GET', '/api/ap/vendor-bills'],
    ['POST', '/api/catalog/pricing'],
    ['POST', '/api/orders/place'],
    ['POST', '/api/wms/receive'],
    ['POST', '/api/proxy/qbo/bill'],
  ];
  for (const [method, pathname] of probes) {
    const response = await context.request.fetch(`${API}${pathname}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      data: method === 'POST' ? {} : undefined,
      failOnStatusCode: false,
    });
    unauthorized.push({ method, pathname, status: response.status() });
    assert.ok([401, 403].includes(response.status()), `${method} ${pathname} returned ${response.status()}`);
  }
  pass('unauthorized APIs fail closed', unauthorized);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB}/catalog`); await settle(page);
  assert.match(await body(page), /88 results/);
  await page.screenshot({ path: path.join(outDir, 'anonymous-catalog-mobile.png'), fullPage: false });
  pass('anonymous catalog renders at narrow width');
  assert.equal(apiResponses.flatMap((entry) => entry.restricted).length, 0);
  const unexpectedConsoleErrors = consoleErrors.filter((message) => !/status of 401 \(Unauthorized\)/i.test(message));
  assert.equal(unexpectedConsoleErrors.length, 0, unexpectedConsoleErrors.join('\n'));
  pass('anonymous network and console are clean', { apiResponses, expectedAuthorizationDenials: consoleErrors.length - unexpectedConsoleErrors.length, consoleErrors: unexpectedConsoleErrors });
  await context.close();

  async function protectedContext(session, extraRoutes = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/session') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session }) });
      if (extraRoutes[url.pathname]) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(extraRoutes[url.pathname]) });
      if (url.pathname === '/api/health') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, services: {} }) });
      if (url.pathname === '/api/wms/workstation') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      if (url.pathname === '/api/account/bootstrap') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(extraRoutes['/api/account/bootstrap'] || {}) });
      if (url.pathname === '/api/catalog/pricing') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prices: [] }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    return ctx;
  }

  const adminSession = { user_id: 'qa_admin', email: 'qa-admin@example.test', name: 'QA Admin', role: 'admin', org_id: 'org_unite', approval_status: 'approved', tier: 'A' };
  const admin = await protectedContext(adminSession, {
    '/api/ap/vendor-bills': {
      vendor_bills: [{ id: 'vb_qa', po_id: 'PO-QA', vendor_invoice_number: 'INV-QA', status: 'variance_review', approved_amount: 50, held_amount: 10, lines: [{ sku: 'SKU-QA', qty: 6, unit_cost: 10 }], match: { lines: [{ sku: 'SKU-QA', approved_qty: 5, vendor_billed_qty: 6, held_amount: 10 }], unexpected_lines: [] } }],
      purchase_orders: [{ id: 'PO-QA', po_type: 'inventory', vendor_name: 'QA Supplier', status: 'received', total_cost: 60, paid_amount: 0, line_items: [{ sku: 'SKU-QA', name: 'QA Product', qty: 6, cost: 10, accepted_qty: 5, billed_qty: 0, billable_qty: 5 }] }],
      ap_intake: [],
    },
  });
  const adminPage = await admin.newPage();
  await adminPage.goto(`${WEB}/admin/finance`); await settle(adminPage);
  assert.match(await body(adminPage), /Finance/);
  await adminPage.getByRole('button', { name: 'Accounts payable' }).click();
  await adminPage.getByText('VENDOR INVOICE INTAKE').waitFor({ timeout: 5000 });
  assert.match(await body(adminPage), /VENDOR INVOICE INTAKE/);
  assert.match(await body(adminPage), /Approve short-pay/);
  await adminPage.screenshot({ path: path.join(outDir, 'finance-ap-desktop.png'), fullPage: false });
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.reload(); await settle(adminPage);
  await adminPage.getByRole('button', { name: 'Accounts payable' }).click();
  await adminPage.getByText('VENDOR INVOICE INTAKE').waitFor({ timeout: 5000 });
  assert.match(await body(adminPage), /VENDOR INVOICE INTAKE/);
  await adminPage.screenshot({ path: path.join(outDir, 'finance-ap-mobile.png'), fullPage: false });
  pass('finance AP and short-pay UI render desktop and mobile');

  await adminPage.setViewportSize({ width: 1440, height: 1000 });
  await adminPage.goto(`${WEB}/admin/integrations`); await settle(adminPage);
  assert.match(await body(adminPage), /Customer\.io · transactional messaging/i);
  await adminPage.goto(`${WEB}/admin/compliance`); await settle(adminPage);
  const complianceText = await body(adminPage);
  assert.match(complianceText, /Recall monitoring/i);
  assert.match(complianceText, /does not send customer notices/i);
  assert.match(complianceText, /Jacoby/i);
  await adminPage.goto(`${WEB}/admin/inventory/lots`); await settle(adminPage);
  assert.match(await body(adminPage), /Lot genealogy lookup.*monitoring only/i);
  await adminPage.goto(`${WEB}/admin/purchase-orders`); await settle(adminPage);
  assert.match(await body(adminPage), /Purchase orders/i);
  await adminPage.screenshot({ path: path.join(outDir, 'purchase-orders-desktop.png'), fullPage: false });
  pass('messaging, recall, lot genealogy, and purchase-order admin routes render');
  await admin.close();

  const distributorSession = { user_id: 'qa_dist', email: 'qa-dist@example.test', name: 'QA Distributor', role: 'distributor', org_id: 'org_dist_qa', approval_status: 'approved', tier: 'distributor' };
  const distributorOverview = {
    organization: { id: 'org_dist_qa', name: 'QA Distributor', contact_email: 'qa-dist@example.test' },
    products: [{ id: 'dp_qa', distributor_sku: 'DIST-QA', unite_sku: 'SKU-QA', product_name: 'QA Product', settlement_unit_cost: 9, settlement_currency: 'USD', low_stock_threshold: 2 }],
    inventory: [{ id: 'lot_qa', product_id: 'dp_qa', on_hand: 10, reserved: 2, available: 8, expiration_date: '2027-12-31' }],
    metrics: [{ product_id: 'dp_qa', run_rate_units_per_day: 0.5, days_of_cover: 16, low_stock: false }],
    service_history: [], settlement_purchase_orders: [], notifications: [], pickups: [], eligible_pickups: [], documents: [], ship_identities: [], payment_methods: [{ method: 'ach_invoice', label: 'ACH invoice' }],
  };
  const distributor = await protectedContext(distributorSession, {
    '/api/account/bootstrap': { profile: { id: 'qa_dist', role: 'distributor', status: 'active', org_id: 'org_dist_qa' }, organization: { id: 'org_dist_qa', name: 'QA Distributor', segment: 'distributors', approval_status: 'approved', tier: 'distributor' }, membership: { id: 'ou_qa', user_id: 'qa_dist', org_id: 'org_dist_qa', role: 'owner', status: 'active' }, addresses: [], payment_methods: [], orders: [], order_items: [], invoices: [], quotes: [], shipments: [] },
    '/api/distributor/overview': distributorOverview,
  });
  const distributorPage = await distributor.newPage();
  await distributorPage.goto(`${WEB}/distributor`); await settle(distributorPage);
  const distributorText = await body(distributorPage);
  assert.match(distributorText, /Your warehouse/);
  assert.match(distributorText, /DIST-QA/);
  assert.doesNotMatch(distributorText, /customer po|customer identity|margin/i);
  await distributorPage.getByRole('button', { name: 'Place blind-ship order' }).click();
  assert.match(await body(distributorPage), /blind-ship/i);
  await distributorPage.getByRole('button', { name: 'Shipping & pickups' }).click();
  assert.match(await body(distributorPage), /pickup|shipping/i);
  await distributorPage.screenshot({ path: path.join(outDir, 'distributor-portal.png'), fullPage: false });
  pass('owner-scoped distributor portal renders operational tabs');
  await distributor.close();

  const warehouseSession = { user_id: 'qa_wh', email: 'qa-wh@example.test', name: 'QA Warehouse', role: 'warehouse_operator', org_id: 'org_unite', approval_status: 'approved', tier: 'A' };
  const warehouse = await protectedContext(warehouseSession, { '/api/wms/workstation': { purchase_orders: [], products: [], lots: [], movements: [] } });
  const warehousePage = await warehouse.newPage();
  await warehousePage.goto(`${WEB}/admin/inventory/receive`); await settle(warehousePage);
  assert.match(await body(warehousePage), /Receiving|purchase order/i);
  await warehousePage.screenshot({ path: path.join(outDir, 'warehouse-receiving.png'), fullPage: false });
  pass('warehouse receiving route is reachable by operator role');
  await warehouse.close();

  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, passed: report.passed.length, report: path.join(outDir, 'report.json') }, null, 2));
} catch (error) {
  report.errors.push({ message: error.message, stack: error.stack });
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.error(error.stack || error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
