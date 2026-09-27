import {quotePricingGate} from '../_lib/quotePricing.js';
import {isDamon,isJacobe} from '../_lib/launchPolicy.js';
import {atomicTransition} from '../_lib/atomicTransition.js';
import {projectCommercialRecord} from '../../src/lib/commercialPolicy.js';
import {quoteDeliveryValid} from '../_lib/quoteDelivery.js';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveProfile, sessionFromRequest } from '../_lib/auth.js';
import { buildCustomerIoOutbox, queueCustomerIoTransactional } from '../_lib/customerioOutbox.js';
import { logEvent, readRawBody, sendJson } from '../_lib/http.js';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}
function quoteToken(quoteId, revision, secret) {
  if (!secret || String(secret).length < 24) throw new Error('QUOTE_LINK_SECRET or SESSION_SECRET must be at least 24 characters');
  const entropy = crypto.createHmac('sha256', secret).update(`${quoteId}:${revision}:issued`).digest('base64url');
  return `${Buffer.from(quoteId).toString('base64url')}.${revision}.${entropy}`;
}

export function buildQuoteIssuePlan({ quote, tokenSecret, now = new Date(), actorId = 'admin' } = {}) {
  if (!quote) return { ok: false, reason: 'quote_not_found' };
  if (['accepted', 'declined'].includes(quote.status)) return { ok: false, reason: 'quote_locked' };
  if (quote.needs_approval) return { ok: false, reason: 'manager_approval_required' };
  if (quote.duty_confirmed === false) return { ok: false, reason: 'duty_confirmation_required' };
  const recipient = String(quote.contact_email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return { ok: false, reason: 'recipient_email_required' };
  const revision = Number(quote.revision || 0) + 1;
  const token = quoteToken(quote.id, revision, tokenSecret);
  const tokenHash = crypto.createHash('sha256').update(`${quote.id}:${revision}:${token}`).digest('hex');
  const issuedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  return {
    ok: true,
    token,
    quote: {
      ...quote,
      status: 'sent', revision,
      acceptance_token_hash: tokenHash,
      acceptance_token_revision: revision,
      issued_at: issuedAt, issued_to: recipient, issued_by: actorId,
      updated_at: issuedAt,
    },
  };
}

async function getRow(sql, table, id) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${String(id)} AND deleted=false LIMIT 1`;
  return rows[0]?.data || null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (!isDamon(session)&&!isJacobe(session)) return sendJson(res, 403, { error: 'admin_required' });
  const tokenSecret = process.env.QUOTE_LINK_SECRET || process.env.SESSION_SECRET;
  if (!process.env.DATABASE_URL || !tokenSecret) return sendJson(res, 503, { error: 'quote_issue_not_configured' });

  try {
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    const quoteId = String(body.quote_id || '').trim();
    if (!quoteId) return sendJson(res, 400, { error: 'quote_id_required' });
    const sql = neon(process.env.DATABASE_URL);
    const profile = await getRow(sql, 'profiles', session.user_id);
    const live = authorizeLiveProfile(session, profile, { roles: ['admin','sales','sales_manager'] });
    if (!live.ok) return sendJson(res, 403, { error: live.reason });
    const quote = await getRow(sql, 'quotes', quoteId);
    const itemRows=quote?await sql`SELECT data FROM um_rows WHERE tbl='quote_items' AND deleted=false AND data->>'quote_id'=${quote.id}`:[];
    const pricingSource=await sql`SELECT tbl,data FROM um_rows WHERE tbl IN ('products','organizations','pricing','customer_contract_prices','volume_breaks') AND deleted=false`;
    const source=t=>pricingSource.filter(r=>r.tbl===t).map(r=>r.data);
    const priceGate=quotePricingGate({quote,items:itemRows.map(r=>r.data),products:source('products'),organization:source('organizations').find(o=>o.id===quote?.customer_id),pricingRows:source('pricing'),contractRows:source('customer_contract_prices'),volumeBreakRows:source('volume_breaks')});
    if(!priceGate.ok)return sendJson(res,409,{error:priceGate.reason});
    if(!quoteDeliveryValid(quote,itemRows.map(r=>r.data)))return sendJson(res,409,{error:'delivered_price_review_required'});
    const plan = buildQuoteIssuePlan({ quote, tokenSecret, actorId: session.user_id });
    if (!plan.ok) return sendJson(res, 400, { error: plan.reason });
    const expectedRevision = Number(body.expected_revision ?? quote.revision ?? 0);
    if (expectedRevision !== Number(quote.revision || 0)) return sendJson(res, 409, { error: 'quote_revision_changed' });
    const publicBase = String(process.env.PUBLIC_APP_ORIGIN || process.env.PUBLIC_SITE_URL || 'https://unitemedical.net').replace(/\/$/, '');
    const link = `${publicBase}/q/${encodeURIComponent(plan.token)}`;
    const outbox = {
      id: stableId('outbox', `${quote.id}:r${plan.quote.revision}:issued`),
      kind: 'quote_issued', provider: 'customerio', status: 'pending',
      to_address: plan.quote.issued_to, from_address: 'support@unitemedical.net',
      subject: `Quote ${quote.id} from Unite Medical`,
      body: `Your Unite Medical quote ${quote.id} is ready. Review it securely at ${link}`,
      template_key: 'quote_issued', ref_type: 'quote', ref_id: quote.id,
      quote_revision: plan.quote.revision, created_at: plan.quote.issued_at,
    };
    const audit = {
      id: stableId('aud', `${quote.id}:r${plan.quote.revision}:issued`), kind: 'quote.issued',
      ref_id: quote.id, actor_id: session.user_id,
      payload: { revision: plan.quote.revision, recipient: plan.quote.issued_to, outbox_id: outbox.id },
      created_at: plan.quote.issued_at,
    };
    const notificationArgs = {
      idempotency_key: `quote:${quote.id}:revision:${plan.quote.revision}:issued`,
      to: outbox.to_address, transactional_message_id: 'quote_issued',
      subject: outbox.subject, body: outbox.body,
      ref_type: 'quote', ref_id: quote.id,
      message_data: { quote_id: quote.id, quote_revision: plan.quote.revision, secure_link: link },
      now: new Date(plan.quote.issued_at),
    };
    const durableOutbox = buildCustomerIoOutbox(notificationArgs);
    const committed=await atomicTransition(sql,{checks:[{table:'quotes',id:quote.id,before:quote},...itemRows.map(r=>({table:'quote_items',id:r.data.id,before:r.data})),...pricingSource.filter(r=>r.tbl==='organizations'?r.data.id===quote.customer_id:itemRows.some(i=>r.data.sku===i.data.sku||r.data.product_sku===i.data.sku||(r.data.variants||[]).some(v=>v.sku===i.data.sku))).map(r=>({table:r.tbl,id:r.data.id,before:r.data}))],writes:[{table:'quotes',before:quote,data:plan.quote},{table:'gmail_outbox',data:outbox},{table:'customerio_outbox',data:durableOutbox},{table:'audit_log',data:audit}]});
    if(!committed.ok)return sendJson(res,409,{error:'quote_issue_conflict'});

    const delivery = await queueCustomerIoTransactional(sql, notificationArgs);
    const deliveredOutbox = {
      ...outbox,
      status: delivery.ok ? 'sent' : 'queued',
      customerio_message_id: delivery.provider_message_id || null,
      provider_message_id: delivery.provider_message_id || null,
      sent_at: delivery.ok ? new Date().toISOString() : null,
      error: delivery.ok ? null : delivery.reason,
    };
    await sql`UPDATE um_rows SET data=${JSON.stringify(deliveredOutbox)}::jsonb,updated_at=now() WHERE tbl='gmail_outbox' AND id=${outbox.id}`;
    logEvent('quotes.issue', 'issued', { quote_id: quote.id, revision: plan.quote.revision, delivery: deliveredOutbox.status });
    return sendJson(res, 200, {
      ok: true, token: plan.token, quote: projectCommercialRecord(plan.quote,session),
      delivery: delivery.ok ? 'sent' : 'queued', outbox_id: outbox.id,
    });
  } catch (error) {
    logEvent('quotes.issue', 'error', { error: error.message });
    return sendJson(res, 500, { error: 'quote_issue_failed' });
  }
}
