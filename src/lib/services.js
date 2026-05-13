/**
 * External-API service simulators.
 *
 * Each function is shaped like the real upstream call so a future migration
 * is mechanical: replace the body with a fetch() to the real endpoint, keep
 * the signature. Where useful we also persist the payload to a local table
 * (qbo_invoices, flexport_shipments, etc.) so admin pages can show the
 * "ledger" of what was sent where.
 */

import { db } from './db.js';
import { delay, uid } from './format.js';

// ---------- openFDA (api.fda.gov/device/) ----------

const OPENFDA_PRODUCT_CODES = {
  FRO: { device_class: '2', regulation_number: '880.6230', name: 'Examination Glove, Patient' },
  IMI: { device_class: '2', regulation_number: '866.3870', name: 'Test, Influenza Antigen' },
  NHM: { device_class: '1', regulation_number: '878.4040', name: 'Surgical Apparel' },
  KGN: { device_class: '2', regulation_number: '888.3060', name: 'Brace, Knee' },
};

export const openfda = {
  async classification(productCode) {
    await delay(120, 280);
    const found = OPENFDA_PRODUCT_CODES[productCode];
    if (!found) return { meta: { results: { total: 0 } }, results: [] };
    return {
      meta: { last_updated: new Date().toISOString(), results: { total: 1 } },
      results: [{ product_code: productCode, ...found }],
    };
  },
  async registrationListing(fei) {
    await delay(150, 320);
    return {
      meta: { last_updated: new Date().toISOString() },
      results: [{ registration_number: fei, owner_operator_number: 'OO-12348', name: 'Vetted Manufacturer A', country_code: 'CN' }],
    };
  },
};

// ---------- USITC HTS (hts.usitc.gov) ----------

const HTS_RATES = {
  '9021.10': { description: 'Orthopedic appliances', mfn: 0, special: 0 },
  '3822.19': { description: 'Diagnostic reagents', mfn: 0, special: 0 },
  '4015.19': { description: 'Surgical gloves', mfn: 0, special: 0 },
  '3005.10': { description: 'Adhesive dressings', mfn: 0, special: 0 },
  '3004.90': { description: 'Pharmaceuticals (other)', mfn: 0, special: 0 },
  '6307.90': { description: 'PPE / textiles (other)', mfn: 7.0, special: 0 },
  '6115.10': { description: 'Compression hosiery', mfn: 14.6, special: 0 },
  '9025.19': { description: 'Thermometers', mfn: 0, special: 0 },
  '3824.99': { description: 'Therapy gel', mfn: 5.0, special: 0 },
};

export const hts = {
  async lookup(htsCode) {
    await delay(100, 220);
    const r = HTS_RATES[htsCode] || { description: 'Other (provisional)', mfn: 6.7, special: 0 };
    return { hts_code: htsCode, ...r, retrieved_at: new Date().toISOString() };
  },
};

// ---------- our freight forwarder (api.flexport.com) ----------

export const flexport = {
  async getFreightQuote({ origin = 'CNSHA', destination = 'USATL', mode = 'LCL', cbm = 1.8, weight_kg = 220 }) {
    await delay(280, 520);
    const base = mode === 'FCL' ? 4200 : 412;
    return {
      data: {
        id: uid('flx_quote'),
        origin_port: origin,
        destination_port: destination,
        mode,
        rates: [
          { service: 'standard', total_usd: base * (1 + (cbm / 25)), transit_days: mode === 'FCL' ? 32 : 28, valid_until: new Date(Date.now() + 7 * 86400000).toISOString() },
          { service: 'expedited', total_usd: base * 1.4 * (1 + (cbm / 25)), transit_days: mode === 'FCL' ? 22 : 18, valid_until: new Date(Date.now() + 7 * 86400000).toISOString() },
        ],
        cbm,
        weight_kg,
      },
    };
  },
  async createShipment({ vendor, mode, line_items }) {
    await delay(320, 600);
    const row = db.insert('flexport_shipments', {
      id: uid('flx_shp'),
      vendor,
      mode,
      line_items_count: line_items?.length || 0,
      status: 'booked',
      eta: new Date(Date.now() + 28 * 86400000).toISOString(),
    });
    return { data: row };
  },
};

// ---------- our WMS (ssapi.shipstation.com) ----------

const RATES = [
  { service: 'fedex_ground', label: 'FedEx Ground', amount: 0, transit_days: 4 },
  { service: 'ups_ground', label: 'UPS Ground', amount: 0, transit_days: 4 },
  { service: 'fedex_2day', label: 'FedEx 2Day', amount: 38, transit_days: 2 },
  { service: 'fedex_overnight', label: 'FedEx Standard Overnight', amount: 95, transit_days: 1 },
];

export const shipstation = {
  async getRates({ weight_lbs = 12 }) {
    await delay(140, 320);
    return RATES.map((r) => ({ ...r, amount: r.amount + Math.max(0, (weight_lbs - 10) * 0.6) }));
  },
  async createLabel({ order_id, carrier = 'fedex_ground', warehouse_id = 'wh_atl', weight_lbs = 12 }) {
    await delay(320, 720);
    const tracking = `1Z${Math.floor(Math.random() * 9e10).toString().padStart(11, '0')}`;
    const row = db.insert('shipstation_labels', {
      id: uid('ssl'),
      order_id,
      carrier,
      tracking_number: tracking,
      warehouse_id,
      weight_lbs,
      status: 'label_created',
    });
    return { tracking_number: tracking, label_url: `https://ss-labels.example/${row.id}.pdf`, carrier };
  },
};

// ---------- our billing system Online (api.intuit.com) ----------

export const qbo = {
  async createInvoice({ order_id, customer_id, amount, terms = 'net30' }) {
    await delay(320, 700);
    const id = `qbo_${order_id.toLowerCase()}`;
    const row = db.insert('qbo_invoices', {
      id,
      order_id,
      customer_id,
      amount,
      terms,
      status: 'open',
      doc_number: `INV-${order_id.slice(3)}`,
      due_date: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    db.insert('audit_log', { id: uid('aud'), kind: 'qbo.invoice.created', ref_id: id, payload: { order_id, amount } });
    return row;
  },
  async recordPayment({ invoice_id, amount, method = 'ach' }) {
    await delay(220, 480);
    const inv = db.list('qbo_invoices', { where: { id: invoice_id } })[0];
    if (inv) db.update('qbo_invoices', invoice_id, { status: 'paid', paid_at: new Date().toISOString(), payment_method: method });
    db.insert('payments', { id: uid('pmt'), invoice_id, amount, method, recorded_at: new Date().toISOString() });
    return { ok: true };
  },
};

// ---------- Stripe (api.stripe.com) ----------

export const stripe = {
  async createPaymentIntent({ amount, currency = 'usd', metadata = {} }) {
    await delay(180, 380);
    const row = db.insert('stripe_payments', {
      id: `pi_${uid().slice(3)}`,
      amount,
      currency,
      metadata,
      status: 'requires_payment_method',
    });
    return row;
  },
  async confirmPaymentIntent(id) {
    await delay(220, 480);
    return db.update('stripe_payments', id, { status: 'succeeded', confirmed_at: new Date().toISOString() });
  },
};

// ---------- HubSpot (api.hubapi.com) ----------

export const hubspot = {
  async createContact({ email, firstname, lastname, company, phone, lifecyclestage = 'lead' }) {
    await delay(160, 340);
    const row = db.insert('hubspot_contacts', {
      id: `hs_${uid().slice(3)}`,
      properties: { email, firstname, lastname, company, phone, lifecyclestage, createdate: new Date().toISOString() },
    });
    return row;
  },
  async createDeal({ dealname, amount, stage = 'appointmentscheduled', contact_id }) {
    await delay(160, 340);
    return { id: `hs_deal_${uid().slice(3)}`, properties: { dealname, amount, dealstage: stage, contact_id } };
  },
};

// ---------- Gmail / SES (gmail.googleapis.com) ----------

export const gmail = {
  async send({ to, subject, body, from = 'sales@unitemedical.net' }) {
    await delay(160, 320);
    const row = db.insert('gmail_outbox', {
      id: `gm_${uid().slice(3)}`,
      to, subject, body, from, sent_at: new Date().toISOString(),
    });
    return row;
  },
};

// ---------- Fathom (webhooks) ----------

export const fathom = {
  async ingestCallSummary({ rep, organization, transcript, duration_min }) {
    await delay(220, 480);
    const items = (transcript || '')
      .split(/[.\n]/)
      .filter((s) => /(send|schedule|follow up|email|book|quote)/i.test(s))
      .slice(0, 5)
      .map((s) => s.trim());
    db.insert('activities', {
      id: uid('act'),
      kind: 'call',
      who: rep,
      subject: `Call · ${organization}`,
      body: transcript?.slice(0, 200),
      duration_min,
      action_items: items,
      created_at: new Date().toISOString(),
    });
    return { ok: true, action_items_extracted: items.length };
  },
};

// ---------- Cin7 (replaces Shopify PO/inventory) ----------

export const cin7 = {
  async syncInventory(warehouse_id) {
    await delay(220, 480);
    const rows = db.list('inventory', { where: { warehouse_id } });
    return { synced_at: new Date().toISOString(), rows: rows.length };
  },
};

// ---------- GS1 ----------

export const gs1 = {
  async validateGTIN(gtin) {
    await delay(120, 240);
    const valid = typeof gtin === 'string' && /^\d{14}$/.test(gtin);
    return { gtin, valid, validated_at: new Date().toISOString() };
  },
};

// ---------- Claude (api.anthropic.com/v1/messages) ----------

export const claude = {
  /** Used by the quoting engine to draft a customer-facing cover letter. */
  async generateQuoteLetter({ customer_name, contact_name, product_count, total_usd, eta_iso }) {
    await delay(420, 820);
    const eta = new Date(eta_iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return {
      id: `msg_${uid().slice(3)}`,
      content: `${contact_name} —\n\nPer our conversation, here is the landed-cost quote on ${product_count} SKUs for ${customer_name}, totaling $${total_usd.toLocaleString()} delivered FOB Georgia.\n\nMargin is calibrated to our standard tier. Vessel arrives ${eta}; we'll release inventory the day it clears CBP. Reach back with any line edits and we'll re-cost in real time.\n\n— Damon\nFounder, Unite Medical`,
    };
  },
  async classifyHTS({ product_name }) {
    await delay(280, 560);
    const guesses = ['9021.10', '3822.19', '4015.19', '6307.90', '3005.10', '3004.90', '9025.19'];
    return { content: guesses[product_name.length % guesses.length] };
  },
};
