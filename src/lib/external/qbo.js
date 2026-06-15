/**
 * QuickBooks Online client — PRD-02.
 *
 * Endpoints used (Intuit REST API v3, minorversion=75):
 *   POST /v3/company/{realmId}/invoice
 *   POST /v3/company/{realmId}/customer
 *   POST /v3/company/{realmId}/payment
 *   POST /v3/company/{realmId}/bill
 *   GET  /v3/company/{realmId}/query?query=...
 *
 * Auth: OAuth 2.0 (Authorization: Bearer <access_token>).
 * The access token is refreshed periodically by the backend; this
 * client expects the token via env or via a backend proxy.
 *
 * Because the API key + customer financial data must never live in
 * the browser, real() only fires when:
 *   - VITE_API_BASE is set AND
 *   - we're running in Node (server-side) OR proxying through the
 *     backend at /proxy/qbo/*
 *
 * Otherwise we hit the local DB stub so the admin UI still works
 * end-to-end.
 *
 * Docs:
 *   https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/invoice
 *   https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/customer
 */

import { db } from '../db.js';
import { delay, uid } from '../format.js';
import { API_BASE, IS_BROWSER, env, fetchJson, realOrStub, warn } from './_http.js';

const QBO_API_BASE_PROD = 'https://quickbooks.api.intuit.com/v3';
const QBO_API_BASE_SANDBOX = 'https://sandbox-quickbooks.api.intuit.com/v3';
const MINOR_VERSION = 75;

function apiRoot() {
  const env_ = env('QBO_ENVIRONMENT') || 'sandbox';
  return env_ === 'production' ? QBO_API_BASE_PROD : QBO_API_BASE_SANDBOX;
}

function isConfigured() {
  return Boolean(env('QBO_ACCESS_TOKEN') && env('QBO_REALM_ID'));
}

/** Use the backend proxy if it's available — handles refresh + storage. */
function viaBackendProxy() {
  return Boolean(API_BASE);
}

async function callQbo({ method = 'POST', entity, body, query }) {
  if (viaBackendProxy()) {
    const url = `${API_BASE}/proxy/qbo/${entity}${query ? `?q=${encodeURIComponent(query)}` : ''}`;
    return fetchJson(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  // Direct from Node only (never from the browser — the access token
  // is sensitive and the API doesn't send CORS headers).
  if (IS_BROWSER) {
    throw new Error('QBO direct call requires server-side execution');
  }
  const accessToken = env('QBO_ACCESS_TOKEN');
  const realmId = env('QBO_REALM_ID');
  const url = `${apiRoot()}/company/${realmId}/${entity}?minorversion=${MINOR_VERSION}`;
  return fetchJson(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Map our order line items to QBO Invoice.Line[]. */
function toQboLines(items) {
  return (items || []).map((it) => ({
    Amount: Number((it.qty * it.unit_price).toFixed(2)),
    DetailType: 'SalesItemLineDetail',
    SalesItemLineDetail: {
      ItemRef: { value: it.qbo_item_id || '1' },
      Qty: it.qty,
      UnitPrice: it.unit_price,
    },
    Description: it.name || it.product_sku,
  }));
}

export const qbo = {
  /**
   * Create a QBO Invoice for one of our orders.
   *
   * @param {object} args
   * @param {string} args.order_id          our orders.id (e.g. UM-26-00128)
   * @param {string} args.qbo_customer_id   QBO Customer.Id
   * @param {object[]} args.items           order line items
   * @param {string} [args.terms]           'net30' | 'net60' | 'card' | 'ach'
   * @param {Date}   [args.due_date]
   */
  async createInvoice({ order_id, qbo_customer_id, items, terms = 'net30', due_date }) {
    const body = {
      CustomerRef: { value: qbo_customer_id },
      Line: toQboLines(items),
      DueDate: (due_date || new Date(Date.now() + 30 * 86400000)).toISOString().slice(0, 10),
      DocNumber: order_id,
      AllowOnlinePayment: true,
      AllowOnlineACHPayment: terms === 'ach' || terms === 'net30' || terms === 'net60',
      PrivateNote: `Auto-created from Unite Medical order ${order_id}`,
    };

    return realOrStub({
      scope: 'qbo',
      label: `createInvoice(${order_id})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const { Invoice } = await callQbo({ entity: 'invoice', body });
        // Mirror into our DB so admin pages can see it without a re-fetch.
        const row = db.upsert('qbo_invoices', {
          id: `qbo_${order_id.toLowerCase()}`,
          qbo_invoice_id: Invoice.Id,
          order_id,
          customer_id: qbo_customer_id,
          doc_number: Invoice.DocNumber,
          amount: Invoice.TotalAmt,
          balance: Invoice.Balance,
          terms,
          status: 'open',
          due_date: Invoice.DueDate,
          raw_payload: Invoice,
          synced_at: new Date().toISOString(),
        });
        db.insert('audit_log', { id: uid('aud'), kind: 'qbo.invoice.created', ref_id: row.id, payload: { order_id, amount: Invoice.TotalAmt } });
        return row;
      },
      stub: async () => {
        await delay(220, 480);
        const id = `qbo_${order_id.toLowerCase()}`;
        const amount = (items || []).reduce((a, it) => a + (it.qty * it.unit_price), 0);
        const row = db.insert('qbo_invoices', {
          id,
          qbo_invoice_id: `STUB-${id}`,
          order_id,
          customer_id: qbo_customer_id,
          doc_number: `INV-${order_id.slice(3)}`,
          amount,
          balance: amount,
          terms,
          status: 'open',
          due_date: (due_date || new Date(Date.now() + 30 * 86400000)).toISOString().slice(0, 10),
          raw_payload: { stub: true },
          synced_at: new Date().toISOString(),
        });
        db.insert('audit_log', { id: uid('aud'), kind: 'qbo.invoice.created', ref_id: id, payload: { order_id, amount, stub: true } });
        return row;
      },
    });
  },

  /**
   * Record a payment against an open invoice (called from the
   * Stripe webhook, PRD-09).
   */
  async recordPayment({ qbo_invoice_id, amount, method = 'ach' }) {
    const body = {
      TotalAmt: amount,
      CustomerRef: { value: '1' /* resolved server-side */ },
      Line: [{
        Amount: amount,
        LinkedTxn: [{ TxnId: qbo_invoice_id, TxnType: 'Invoice' }],
      }],
      PaymentMethodRef: { value: method === 'card' ? '2' : '5' },
    };
    return realOrStub({
      scope: 'qbo',
      label: `recordPayment(${qbo_invoice_id})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const { Payment } = await callQbo({ entity: 'payment', body });
        const mirror = (db.list('qbo_invoices', { where: { qbo_invoice_id } }))[0];
        if (mirror) db.update('qbo_invoices', mirror.id, { status: 'paid', balance: 0, paid_at: new Date().toISOString() });
        db.insert('payments', { id: uid('pmt'), invoice_id: mirror?.id, qbo_payment_id: Payment.Id, amount, method, recorded_at: new Date().toISOString() });
        return { ok: true, payment_id: Payment.Id };
      },
      stub: async () => {
        await delay(180, 360);
        const mirror = (db.list('qbo_invoices', { where: { qbo_invoice_id } }))[0];
        if (mirror) db.update('qbo_invoices', mirror.id, { status: 'paid', balance: 0, paid_at: new Date().toISOString() });
        db.insert('payments', { id: uid('pmt'), invoice_id: mirror?.id, amount, method, recorded_at: new Date().toISOString() });
        return { ok: true, stub: true };
      },
    });
  },

  /** Upsert a QBO Customer for one of our organizations. */
  async upsertCustomer({ org }) {
    const body = {
      DisplayName: org.name,
      CompanyName: org.name,
      Notes: `Segment: ${org.segment} · Tier: ${org.tier}`,
      Active: true,
    };
    return realOrStub({
      scope: 'qbo',
      label: `upsertCustomer(${org.id})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const { Customer } = await callQbo({ entity: 'customer', body });
        return { id: Customer.Id, displayName: Customer.DisplayName };
      },
      stub: async () => {
        await delay(150, 320);
        return { id: `STUB-cust-${org.id}`, displayName: org.name, stub: true };
      },
    });
  },

  /** Post a Bill for a Flexport freight charge (called from PRD-03). */
  async createBillFromFlexport({ shipment, vendor_qbo_id }) {
    const body = {
      VendorRef: { value: vendor_qbo_id || '1' },
      Line: [{
        DetailType: 'AccountBasedExpenseLineDetail',
        Amount: shipment.freight_total_usd + (shipment.customs_total_usd || 0),
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: '7' /* COGS account, resolved server-side */ },
        },
        Description: `Flexport ${shipment.flexport_shipment_id} · ${shipment.origin_port} → ${shipment.destination_port}`,
      }],
      DueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    };
    return realOrStub({
      scope: 'qbo',
      label: `createBillFromFlexport(${shipment.id})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const { Bill } = await callQbo({ entity: 'bill', body });
        return { id: Bill.Id, amount: Bill.TotalAmt };
      },
      stub: async () => {
        await delay(220, 480);
        return { id: `STUB-bill-${shipment.id}`, amount: shipment.freight_total_usd, stub: true };
      },
    });
  },

  /**
   * Create a QBO PurchaseOrder for a vendor restock (PRD-02 / PRD-12).
   * Mirrors into our `qbo_invoices`-style ledger via the PO row itself.
   *
   * @param {object} args
   * @param {object} args.po               our `purchase_orders` row
   * @param {string} [args.vendor_qbo_id]  QBO Vendor.Id
   */
  async createPurchaseOrder({ po, vendor_qbo_id }) {
    const lines = (po?.line_items || []).map((li) => ({
      Amount: Number(((li.qty || 0) * (li.cost || 0)).toFixed(2)),
      DetailType: 'ItemBasedExpenseLineDetail',
      ItemBasedExpenseLineDetail: {
        ItemRef: { value: li.qbo_item_id || '1' },
        Qty: li.qty,
        UnitPrice: li.cost,
      },
      Description: li.name || li.sku,
    }));
    const body = {
      VendorRef: { value: vendor_qbo_id || '1' },
      Line: lines,
      POStatus: 'Open',
      DocNumber: po?.id,
      PrivateNote: `Unite Medical replenishment PO ${po?.id} · ${po?.vendor_name || ''}`,
    };
    return realOrStub({
      scope: 'qbo',
      label: `createPurchaseOrder(${po?.id})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const { PurchaseOrder } = await callQbo({ entity: 'purchaseorder', body });
        db.insert('audit_log', { id: uid('aud'), kind: 'qbo.po.created', ref_id: po?.id, payload: { qbo_po_id: PurchaseOrder.Id, total: PurchaseOrder.TotalAmt } });
        return { id: PurchaseOrder.Id, doc_number: PurchaseOrder.DocNumber, amount: PurchaseOrder.TotalAmt };
      },
      stub: async () => {
        await delay(220, 460);
        db.insert('audit_log', { id: uid('aud'), kind: 'qbo.po.created', ref_id: po?.id, payload: { stub: true } });
        return { id: `STUB-po-${po?.id}`, doc_number: po?.id, amount: po?.total_cost, stub: true };
      },
    });
  },

  /**
   * Post a vendor Bill against a received PurchaseOrder (AP side).
   * Called when goods are received so COGS/AP land in the books.
   *
   * @param {object} args
   * @param {object} args.po               our `purchase_orders` row
   * @param {number} [args.amount]         defaults to the PO total
   * @param {string} [args.vendor_qbo_id]  QBO Vendor.Id
   */
  async createBillFromPO({ po, amount, vendor_qbo_id }) {
    const total = amount ?? po?.total_cost ?? 0;
    const body = {
      VendorRef: { value: vendor_qbo_id || '1' },
      Line: [{
        DetailType: 'AccountBasedExpenseLineDetail',
        Amount: total,
        AccountBasedExpenseLineDetail: { AccountRef: { value: '7' /* COGS, resolved server-side */ } },
        Description: `Goods received against PO ${po?.id} · ${po?.vendor_name || ''}`,
      }],
      DocNumber: `BILL-${po?.id}`,
      DueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      PrivateNote: `Auto-created on receipt of PO ${po?.id}`,
    };
    return realOrStub({
      scope: 'qbo',
      label: `createBillFromPO(${po?.id})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const { Bill } = await callQbo({ entity: 'bill', body });
        db.insert('audit_log', { id: uid('aud'), kind: 'qbo.bill.created', ref_id: po?.id, payload: { bill_id: Bill.Id, amount: Bill.TotalAmt } });
        return { id: Bill.Id, amount: Bill.TotalAmt };
      },
      stub: async () => {
        await delay(220, 460);
        db.insert('audit_log', { id: uid('aud'), kind: 'qbo.bill.created', ref_id: po?.id, payload: { stub: true, amount: total } });
        return { id: `STUB-bill-${po?.id}`, amount: total, stub: true };
      },
    });
  },

  /** Health/auth ping. */
  async ping() {
    return realOrStub({
      scope: 'qbo',
      label: 'ping',
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const data = await callQbo({ entity: 'companyinfo/' + env('QBO_REALM_ID'), method: 'GET' });
        return { ok: true, company: data?.CompanyInfo?.CompanyName, environment: env('QBO_ENVIRONMENT') || 'sandbox' };
      },
      stub: async () => {
        warn('qbo', 'ping: no credentials — stub OK');
        return { ok: false, stub: true, reason: 'no_credentials' };
      },
    });
  },

  __isConfigured: isConfigured,
};
