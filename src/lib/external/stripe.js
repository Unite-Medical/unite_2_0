/**
 * Stripe client — PRD-09.
 *
 * Docs:
 *   https://docs.stripe.com/api/invoices/create
 *   https://docs.stripe.com/api/invoices/send
 *   https://docs.stripe.com/api/customers/create
 *   https://docs.stripe.com/api/payment_intents
 *
 * Auth: secret key in Bearer header (server-side only — never to the
 * browser). Plus a webhook signing secret for /hooks/stripe.
 *
 * Endpoints used here:
 *   POST /v1/customers
 *   POST /v1/invoices                       create draft
 *   POST /v1/invoiceitems                   add line items
 *   POST /v1/invoices/{id}/finalize
 *   POST /v1/invoices/{id}/send             trigger the email
 *   POST /v1/payment_intents                card/ACH up-front payment
 *   POST /v1/payment_intents/{id}/confirm
 *   POST /v1/accounts                       Connect Express account (1099 reps)
 *   POST /v1/account_links                  onboarding link for the rep
 *   POST /v1/transfers                      commission payout to a connected account
 */

import { db } from '../db.js';
import { delay, uid } from '../format.js';
import { qbo } from './qbo.js';
import { API_BASE, env, fetchJson, realOrStub } from './_http.js';

const STRIPE_BASE = 'https://api.stripe.com/v1';

function isConfigured() {
  return Boolean(env('STRIPE_SECRET_KEY'));
}

function viaBackendProxy() {
  return Boolean(API_BASE);
}

// Stripe uses x-www-form-urlencoded, not JSON. Build a flat encoder.
function encodeForm(obj, prefix = '') {
  const params = new URLSearchParams();
  function walk(prefix, value) {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(`${prefix}[${i}]`, v));
      return;
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(prefix ? `${prefix}[${k}]` : k, v);
      return;
    }
    params.append(prefix, String(value));
  }
  for (const [k, v] of Object.entries(obj || {})) walk(prefix ? `${prefix}[${k}]` : k, v);
  return params.toString();
}

async function callStripe({ method = 'POST', path, body }) {
  if (viaBackendProxy()) {
    return fetchJson(`${API_BASE}/proxy/stripe${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  return fetchJson(`${STRIPE_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? encodeForm(body) : undefined,
  });
}

function termsToDays(terms) {
  if (terms === 'net30') return 30;
  if (terms === 'net60') return 60;
  return 7; // card / ach default
}

export const stripe = {
  /** Create or fetch a Stripe Customer for one of our orgs. */
  async upsertCustomer({ org }) {
    if (!org?.id) throw new Error('stripe.upsertCustomer requires an org');
    const body = {
      name: org.name,
      email: org.billing_email,
      metadata: { unite_org_id: org.id, unite_segment: org.segment, unite_tier: org.tier },
    };
    return realOrStub({
      scope: 'stripe',
      label: `upsertCustomer(${org.id})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const resp = await callStripe({ path: '/customers', body });
        return { id: resp.id, email: resp.email };
      },
      stub: async () => {
        await delay(140, 320);
        return { id: `cus_STUB_${org.id}`, email: org.billing_email, stub: true };
      },
    });
  },

  /**
   * Create a Net-30 / Net-60 invoice that emails the customer with a
   * payment link. Per Stripe billing docs, `collection_method =
   * send_invoice` + `days_until_due` gives the dunning UX we want.
   */
  async createInvoice({ stripe_customer_id, line_items, terms = 'net30', payment_methods = ['ach_debit', 'card'], order_id }) {
    const dueDate = new Date(Date.now() + termsToDays(terms) * 86400000).toISOString().slice(0, 10);
    const localAmount = (line_items || []).reduce((a, li) => a + (li.unit_price * li.qty), 0);
    return realOrStub({
      scope: 'stripe',
      label: `createInvoice(${order_id})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        // 1) add invoice items
        for (const li of line_items || []) {
          await callStripe({
            path: '/invoiceitems',
            body: {
              customer: stripe_customer_id,
              amount: Math.round((li.unit_price * li.qty) * 100), // cents
              currency: 'usd',
              description: li.name || li.product_sku,
              quantity: li.qty,
              metadata: { unite_order_id: order_id, unite_sku: li.product_sku || '' },
            },
          });
        }
        // 2) create the invoice
        const invoice = await callStripe({
          path: '/invoices',
          body: {
            customer: stripe_customer_id,
            collection_method: 'send_invoice',
            days_until_due: termsToDays(terms),
            payment_settings: { payment_method_types: payment_methods },
            metadata: { unite_order_id: order_id, unite_terms: terms },
            auto_advance: true,
          },
        });
        // 3) finalize + send
        await callStripe({ path: `/invoices/${invoice.id}/finalize`, body: {} });
        const sent = await callStripe({ path: `/invoices/${invoice.id}/send`, body: {} });
        const row = db.upsert('stripe_invoices', {
          id: `sinv_${order_id}`,
          order_id,
          stripe_invoice_id: sent.id,
          hosted_invoice_url: sent.hosted_invoice_url || null,
          amount: sent.amount_due / 100,
          balance: sent.amount_remaining / 100,
          terms,
          status: sent.status || 'open',
          due_date: sent.due_date ? new Date(sent.due_date * 1000).toISOString().slice(0, 10) : dueDate,
          issued_at: new Date().toISOString(),
        });
        return row;
      },
      stub: async () => {
        await delay(280, 540);
        const row = db.upsert('stripe_invoices', {
          id: `sinv_${order_id}`,
          order_id,
          stripe_invoice_id: `STUB_in_${uid().slice(3)}`,
          hosted_invoice_url: null,
          amount: localAmount,
          balance: localAmount,
          terms,
          status: 'open',
          due_date: dueDate,
          issued_at: new Date().toISOString(),
          stub: true,
        });
        return row;
      },
    });
  },

  /** Create a PaymentIntent (card / ACH up-front flow). */
  async createPaymentIntent({ amount, currency = 'usd', stripe_customer_id, payment_method_types = ['card', 'us_bank_account'], metadata = {} }) {
    const body = {
      amount: Math.round(amount * 100),
      currency,
      customer: stripe_customer_id,
      payment_method_types,
      metadata,
    };
    return realOrStub({
      scope: 'stripe',
      label: 'createPaymentIntent',
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const pi = await callStripe({ path: '/payment_intents', body });
        const row = db.insert('stripe_payments', {
          id: pi.id,
          stripe_pi_id: pi.id,
          amount,
          currency,
          metadata,
          status: pi.status,
        });
        return row;
      },
      stub: async () => {
        await delay(180, 380);
        const row = db.insert('stripe_payments', {
          id: `pi_${uid().slice(3)}`,
          stripe_pi_id: `pi_STUB_${uid().slice(3)}`,
          amount,
          currency,
          metadata,
          status: 'requires_payment_method',
        });
        return row;
      },
    });
  },

  /** Confirm a PaymentIntent (mock client-side confirmation). */
  async confirmPaymentIntent(stripe_pi_id) {
    return realOrStub({
      scope: 'stripe',
      label: `confirmPaymentIntent(${stripe_pi_id})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const pi = await callStripe({ path: `/payment_intents/${stripe_pi_id}/confirm`, body: {} });
        const mirror = db.list('stripe_payments', { where: { stripe_pi_id } })[0];
        if (mirror) db.update('stripe_payments', mirror.id, { status: pi.status, confirmed_at: new Date().toISOString() });
        return pi;
      },
      stub: async () => {
        await delay(220, 480);
        const mirror = db.list('stripe_payments', { where: { stripe_pi_id } })[0];
        if (mirror) db.update('stripe_payments', mirror.id, { status: 'succeeded', confirmed_at: new Date().toISOString() });
        return { id: stripe_pi_id, status: 'succeeded', stub: true };
      },
    });
  },

  // -------------------------------------------------------------------------
  // Stripe Connect — 1099 rep payout rail (brief §2 #5)
  // -------------------------------------------------------------------------

  /** Create an Express connected account for a 1099 rep. */
  async createConnectedAccount({ rep }) {
    if (!rep?.email) throw new Error('stripe.createConnectedAccount requires a rep with an email');
    return realOrStub({
      scope: 'stripe',
      label: `createConnectedAccount(${rep.email})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const acct = await callStripe({
          path: '/accounts',
          body: {
            type: 'express',
            email: rep.email,
            business_type: 'individual',
            capabilities: { transfers: { requested: true } },
            metadata: { unite_rep_id: rep.id, unite_rep_name: rep.name },
          },
        });
        return { id: acct.id, email: rep.email };
      },
      stub: async () => {
        await delay(220, 420);
        return { id: `acct_STUB_${rep.id}`, email: rep.email, stub: true };
      },
    });
  },

  /** Hosted onboarding link so the rep can add their bank details. */
  async createAccountLink({ stripe_account_id, return_url, refresh_url }) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://unitemedical.net';
    return realOrStub({
      scope: 'stripe',
      label: `createAccountLink(${stripe_account_id})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const link = await callStripe({
          path: '/account_links',
          body: {
            account: stripe_account_id,
            type: 'account_onboarding',
            return_url: return_url || `${origin}/admin/reps`,
            refresh_url: refresh_url || `${origin}/admin/reps`,
          },
        });
        return { url: link.url, expires_at: link.expires_at };
      },
      stub: async () => {
        await delay(140, 280);
        return { url: `https://connect.stripe.com/setup/e/stub/${stripe_account_id}`, stub: true };
      },
    });
  },

  /** Transfer a commission to a rep's connected account. */
  async createTransfer({ stripe_account_id, amount, currency = 'usd', metadata = {} }) {
    if (!stripe_account_id) throw new Error('stripe.createTransfer requires a destination account');
    return realOrStub({
      scope: 'stripe',
      label: `createTransfer(${stripe_account_id})`,
      predicate: () => isConfigured() || viaBackendProxy(),
      real: async () => {
        const tr = await callStripe({
          path: '/transfers',
          body: {
            amount: Math.round(amount * 100),
            currency,
            destination: stripe_account_id,
            metadata,
          },
        });
        return { id: tr.id, amount, currency, destination: stripe_account_id };
      },
      stub: async () => {
        await delay(260, 520);
        return { id: `tr_STUB_${uid().slice(3)}`, amount, currency, destination: stripe_account_id, stub: true };
      },
    });
  },

  /** Webhook entrypoint. Real signature verification happens in the
   *  backend route handler (PRD-01); this dispatches the payload. */
  async handleWebhookEvent(event) {
    const { type, data } = event || {};
    if (!type) return { ok: false, reason: 'no_type' };
    db.insert('audit_log', { id: uid('aud'), kind: `stripe.${type}`, ref_id: data?.object?.id, payload: event });
    if (type === 'invoice.paid') {
      const obj = data.object || {};
      const invoiceId = obj.id;
      const paidAt = new Date().toISOString();
      const paidAmount = typeof obj.amount_paid === 'number' ? obj.amount_paid / 100 : undefined;
      const method = obj.payment_settings?.payment_method_types?.[0] === 'card' ? 'card' : 'ach';

      // 1) Stripe-side mirror.
      const smirror = db.list('stripe_invoices', { where: { stripe_invoice_id: invoiceId } })[0];
      if (smirror) db.update('stripe_invoices', smirror.id, { status: 'paid', balance: 0, paid_at: paidAt });

      // 2) Canonical AR invoice — match by stripe_invoice_id or order_id.
      const orderId = smirror?.order_id || obj.metadata?.unite_order_id;
      const canonical = db.list('invoices', { where: { stripe_invoice_id: invoiceId } })[0]
        || (orderId ? db.list('invoices', { where: { order_id: orderId } })[0] : null);
      if (canonical) {
        db.update('invoices', canonical.id, { status: 'paid', balance: 0, paid_at: paidAt, payment_method: method });
        if (canonical.order_id) {
          const order = db.get('orders', canonical.order_id);
          if (order) db.update('orders', order.id, { payment_status: 'paid' });
        }
      }

      // 3) Reconcile to QBO — post the Payment against the open invoice.
      let qboResult = null;
      try {
        const qboInvoiceId = canonical?.qbo_id
          || db.list('qbo_invoices', { where: { order_id: orderId } })[0]?.qbo_invoice_id;
        if (qboInvoiceId) {
          qboResult = await qbo.recordPayment({
            qbo_invoice_id: qboInvoiceId,
            amount: paidAmount ?? canonical?.amount ?? smirror?.amount ?? 0,
            method,
          });
        }
      } catch (err) {
        db.insert('audit_log', { id: uid('aud'), kind: 'stripe.reconcile_failed', ref_id: invoiceId, payload: { error: err.message } });
      }

      // 4) Record the local payment row for the AR ledger.
      if (canonical) {
        db.insert('payments', {
          id: uid('pmt'),
          invoice_id: canonical.id,
          order_id: canonical.order_id,
          amount: paidAmount ?? canonical.amount,
          method,
          source: 'stripe',
          stripe_invoice_id: invoiceId,
          received_at: paidAt,
        });
      }
      return { ok: true, kind: 'invoice.paid', mirrored: Boolean(canonical), reconciled: Boolean(qboResult) };
    }
    if (type === 'payment_intent.succeeded') {
      const pi_id = data.object.id;
      const mirror = db.list('stripe_payments', { where: { stripe_pi_id: pi_id } })[0];
      if (mirror) db.update('stripe_payments', mirror.id, { status: 'succeeded', confirmed_at: new Date().toISOString() });
      return { ok: true, kind: 'pi.succeeded' };
    }
    if (type === 'invoice.payment_failed') {
      const invoiceId = data.object?.id;
      const smirror = db.list('stripe_invoices', { where: { stripe_invoice_id: invoiceId } })[0];
      if (smirror) db.update('stripe_invoices', smirror.id, { status: 'payment_failed', last_failure_at: new Date().toISOString() });
      return { ok: true, kind: 'invoice.payment_failed', mirrored: Boolean(smirror) };
    }
    return { ok: true, kind: type, ignored: true };
  },

  __isConfigured: isConfigured,
};
