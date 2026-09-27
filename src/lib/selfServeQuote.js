/**
 * Customer self-serve quoting — PRD-19.
 *
 * Lets a (logged-in or anonymous) customer assemble a quote from the
 * stocked catalog without a rep: pick SKUs + quantities, and we price
 * each line through the role-based pricing engine (`priceFor`), persist a
 * real `quotes` + `quote_items` record with an acceptance token, and hand
 * back the quote so the UI can route to `/q/:token`.
 *
 * Anything we don't stock routes to the sourcing desk as a lead, so the
 * intent is captured instead of lost.
 */

import { db } from './db.js';
import { uid } from './format.js';
import { priceFor } from './pricing.js';
import { loadMarginPolicy } from './marginPolicy.js';
import { emailDomainMatchesWebsite, evaluateAccount } from './accountApproval.js';
import { createQuoteAcceptanceToken } from './quoteTokens.js';

/**
 * Verify the minimum business identity required to unlock a priced Quick Quote.
 * This creates CRM records only. It does not create credentials or ordering access.
 */
export function verifyQuickQuoteBusiness({
  company_name,
  contact_name,
  email,
  website,
  shipping_zip,
} = {}) {
  const companyName = String(company_name || '').trim();
  const contactName = String(contact_name || '').trim();
  const workEmail = String(email || '').trim().toLowerCase();
  const companyWebsite = String(website || '').trim().toLowerCase();
  const shippingZip = String(shipping_zip || '').trim();
  if (!companyName || !contactName || !workEmail || !companyWebsite || !/^\d{5}(?:-\d{4})?$/.test(shippingZip)) {
    return { ok: false, reason: 'business_identity_required' };
  }
  const verification = evaluateAccount({ email: workEmail, website: companyWebsite });
  if (verification.decision !== 'AUTO_APPROVE' || !emailDomainMatchesWebsite(workEmail, companyWebsite)) {
    return { ok: false, reason: 'work_email_required' };
  }

  const existingContact = db.list('contacts', { where: { email: workEmail } })[0];
  let organization = existingContact?.org_id ? db.get('organizations', existingContact.org_id) : null;
  if (!organization) {
    organization = db.insert('organizations', {
      id: uid('org'),
      name: companyName,
      website: companyWebsite,
      contact_email: workEmail,
      shipping_zip: shippingZip,
      segment: 'asc',
      tier: 'C',
      terms: 'ach',
      credit_limit: 0,
      approval_status: 'quote_verified',
      quote_verification_score: verification.score,
      quote_verification_reasons: verification.reasons,
    });
    db.insert('contacts', {
      id: uid('contact'), org_id: organization.id, name: contactName,
      email: workEmail, role: 'buyer', source: 'quick_quote', status: 'active',
    });
  }
  if (!db.list('tasks', { where: { kind: 'quick_quote_follow_up', ref_id: organization.id } }).length) {
    db.insert('tasks', {
      id: uid('task'), kind: 'quick_quote_follow_up',
      subject: `Quick Quote follow-up · ${organization.name}`,
      owner_email: organization.account_owner_email || 'sales@unitemedical.net',
      status: 'open', ref_type: 'organization', ref_id: organization.id,
      payload: { contact_name: contactName, email: workEmail, shipping_zip: shippingZip },
    });
  }
  db.insert('audit_log', {
    id: uid('aud'), kind: 'quick_quote.business_verified', ref_id: organization.id,
    payload: { email: workEmail, website: companyWebsite, shipping_zip: shippingZip },
  });
  return { ok: true, organization, contact_email: workEmail, contact_name: contactName, verification };
}

/**
 * Build a self-serve quote from catalog selections.
 *
 * @param {object} args
 * @param {{sku:string, qty:number}[]} args.items
 * @param {object} [args.org]            Signed-in org (drives tier pricing)
 * @param {string} [args.customerName]
 * @param {string} [args.contactEmail]
 * @param {string} [args.note]
 * @returns {{ ok:boolean, reason?:string, quote?:object, lines?:object[] }}
 */
export async function buildSelfServeQuote({ items = [], org = null, customerName, contactEmail, note = '' }) {
  const clean = (items || []).filter((it) => it.sku && Number(it.qty) > 0);
  if (!clean.length) return { ok: false, reason: 'no_items' };

  const policy = loadMarginPolicy();
  const lines = [];
  for (const it of clean) {
    const product = db.list('products', { where: { sku: it.sku } })[0];
    if (!product) continue;
    const qty = Math.max(1, Math.round(Number(it.qty)));
    const { unit_price, list_price, tier, tier_discount_pct, contract } = priceFor({
      sku: it.sku, qty, basePrice: product.price, org,
    });
    lines.push({
      sku: it.sku,
      name: product.name,
      hts: product.hts_code || product.hts || null,
      fda_product_code: product.fda_product_code || null,
      target_qty: qty,
      list_price,
      sell_per_unit: unit_price,
      ext_sell: +(unit_price * qty).toFixed(2),
      tier,
      tier_discount_pct,
      contract: Boolean(contract),
    });
  }
  if (!lines.length) return { ok: false, reason: 'no_valid_products' };

  const total = +lines.reduce((a, l) => a + l.ext_sell, 0).toFixed(2);
  const quoteId = `Q-26-${String(284 + db.count('quotes')).padStart(5, '0')}`;
  const validityDays = policy.quote_validity_days || 14;
  const access = await createQuoteAcceptanceToken(quoteId, 1);

  const persistedQuote = db.insert('quotes', {
    id: quoteId,
    vendor: 'Unite Medical (stocked catalog)',
    customer_name: customerName || org?.name || 'Self-serve customer',
    customer_id: org?.id || null,
    contact_email: contactEmail || null,
    customer_tier: org?.tier || 'C',
    line_count: lines.length,
    total,
    source: 'self_serve',
    note: note || null,
    cover_letter: `Thank you for building this quote on unitemedical.net. The ${lines.length} item(s) below are priced at your account tier and ship from our Georgia warehouse. Accept online to convert this into a confirmed order.`,
    status: 'sent',
    revision: 1,
    acceptance_token_hash: access.token_hash,
    acceptance_token_revision: 1,
    ...((typeof window === 'undefined' || import.meta.env?.DEV) ? { acceptance_token: access.token } : {}),
    valid_until: new Date(Date.now() + validityDays * 86400000).toISOString(),
    eta: new Date(Date.now() + 5 * 86400000).toISOString(),
  });
  lines.forEach((l, idx) => db.insert('quote_items', { id: `${quoteId}-li-${idx}`, quote_id: quoteId, ...l }));
  db.insert('audit_log', { id: uid('aud'), kind: 'quote.self_serve_created', ref_id: quoteId, payload: { total, lines: lines.length } });

  return { ok: true, quote: { ...persistedQuote, acceptance_token: access.token }, lines };
}

/**
 * Capture a sourcing request for something we don't stock → a lead the
 * sourcing desk can action. Returns the created lead.
 */
export function requestSourcing({ description, org = null, contactEmail, qty = null }) {
  if (!description || !String(description).trim()) return { ok: false, reason: 'empty' };
  const lead = db.insert('leads', {
    id: uid('lead'),
    kind: 'sourcing_request',
    source: 'self_serve_portal',
    company: org?.name || null,
    org_id: org?.id || null,
    email: contactEmail || null,
    status: 'new',
    notes: String(description).trim(),
    requested_qty: qty,
  });
  db.insert('audit_log', { id: uid('aud'), kind: 'lead.sourcing_request', ref_id: lead.id, payload: { description: String(description).slice(0, 200) } });
  return { ok: true, lead };
}
