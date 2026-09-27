import {quoteDeliveryValid} from '../_lib/quoteDelivery.js';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { readRawBody, sendJson, logEvent } from '../_lib/http.js';
import { buildCustomerIoOutbox, queueCustomerIoTransactional } from '../_lib/customerioOutbox.js';

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function hashQuoteAcceptanceToken(token, quoteId, revision = 1) {
  return crypto.createHash('sha256').update(`${quoteId}:${Number(revision || 1)}:${token}`).digest('hex');
}

function parseQuoteAcceptanceToken(token) {
  try {
    const [encodedId, revisionText, secret, extra] = String(token || '').split('.');
    if (!encodedId || !secret || extra || !/^\d+$/.test(revisionText) || secret.length < 40) return null;
    return {
      quote_id: Buffer.from(encodedId, 'base64url').toString('utf8'),
      revision: Number(revisionText),
    };
  } catch {
    return null;
  }
}

export function normalizeAcceptedQuoteItems(items = []) {
  return items.map((item) => {
    const qty = Number(item.target_qty ?? item.qty ?? item.moq ?? 0);
    const unitPrice = Number(item.sell_per_unit ?? item.unit_price ?? item.sell_price ?? 0);
    return {
      id: item.id || null,
      sku: item.sku || item.gtin || null,
      name: item.name || item.sku || item.gtin || 'Quoted item',
      qty,
      unit_price: unitPrice,
      ext_price: Number(item.ext_sell ?? item.ext_price ?? unitPrice * qty),
      source_quote_item_id: item.id || null,
    };
  });
}

export function quoteAcceptanceEligibility({ quote, organization, now = new Date() } = {}) {
  if (!quote) return { ok: false, reason: 'quote_not_found' };
  if (quote.status === 'accepted') return { ok: false, reason: 'quote_already_accepted' };
  if (quote.status !== 'sent') return { ok: false, reason: 'quote_not_sent' };
  const validUntil = quote.valid_until || quote.expires_at;
  if (validUntil && new Date(validUntil).getTime() <= now.getTime()) return { ok: false, reason: 'quote_expired' };
  if (!organization || organization.id !== quote.customer_id) return { ok: false, reason: 'organization_not_found' };
  if (organization.status && organization.status !== 'active') return { ok: false, reason: 'organization_inactive' };
  if (organization.approval_status !== 'approved') return { ok: false, reason: 'account_not_approved' };
  return { ok: true };
}

export function planQuoteResponse({ quote, items = [], action, input = {}, now = new Date() } = {}) {
  if (!quote) return { ok: false, reason: 'quote_not_found' };
  if (quote.status === 'accepted') return { ok: false, reason: 'quote_already_accepted' };
  if (quote.status === 'declined') return { ok: false, reason: 'quote_already_declined' };
  const at = now.toISOString();
  const expired = Boolean((quote.valid_until || quote.expires_at)
    && new Date(quote.valid_until || quote.expires_at).getTime() <= now.getTime());
  const responseId = crypto.createHash('sha256').update(`${quote.id}:${Number(quote.revision || 1)}:${action}`).digest('hex').slice(0, 20);
  if (action === 'counter') {
    if (quote.status !== 'sent') return { ok: false, reason: 'quote_not_sent' };
    if (expired) return { ok: false, reason: 'quote_expired' };
    const byId = new Map(items.map((item) => [String(item.id), item]));
    const patches = (input.counters || [])
      .filter((entry) => byId.has(String(entry.item_id)) && Number(entry.price) > 0)
      .map((entry) => ({ ...byId.get(String(entry.item_id)), counter_price: +Number(entry.price).toFixed(2), counter_applied: false }));
    if (!patches.length) return { ok: false, reason: 'no_valid_counters' };
    const updatedQuote = { ...quote, status: 'countered', counter_note: String(input.note || '').slice(0, 1000) || null, countered_at: at, updated_at: at };
    return {
      ok: true, quote: updatedQuote, items: patches,
      task: { id: `task_quote_counter_${responseId}`, kind: 'quote_counter', ref_id: quote.id, title: `Counter-offer on ${quote.id}`, detail: updatedQuote.counter_note || `${patches.length} line(s) countered.`, status: 'open', created_at: at },
      audit: { id: `aud_quote_counter_${responseId}`, kind: 'quote.countered', ref_id: quote.id, actor_id: quote.contact_email || 'quote_token', payload: { lines: patches.length, note: updatedQuote.counter_note }, created_at: at },
    };
  }
  if (action === 'decline') {
    if (!['sent', 'countered'].includes(quote.status)) return { ok: false, reason: 'quote_not_open' };
    const reason = String(input.reason || '').trim().slice(0, 1000);
    const updatedQuote = { ...quote, status: 'declined', decline_reason: reason || null, declined_at: at, updated_at: at };
    return {
      ok: true, quote: updatedQuote, items: [],
      audit: { id: `aud_quote_decline_${responseId}`, kind: 'quote.declined', ref_id: quote.id, actor_id: quote.contact_email || 'quote_token', payload: { reason: updatedQuote.decline_reason }, created_at: at },
    };
  }
  if (action === 'refresh') {
    if (!['sent', 'countered'].includes(quote.status)) return { ok: false, reason: 'quote_not_open' };
    if (quote.refresh_requested_at) return { ok: true, idempotent: true, quote, items: [] };
    if (!expired) return { ok: false, reason: 'quote_not_expired' };
    const updatedQuote = { ...quote, refresh_requested_at: at, updated_at: at };
    return {
      ok: true, quote: updatedQuote, items: [],
      task: { id: `task_quote_refresh_${responseId}`, kind: 'quote_refresh', ref_id: quote.id, title: `Refresh pricing for ${quote.id}`, detail: 'Customer requested refreshed pricing.', status: 'open', created_at: at },
      audit: { id: `aud_quote_refresh_${responseId}`, kind: 'quote.refresh_requested', ref_id: quote.id, actor_id: quote.contact_email || 'quote_token', payload: {}, created_at: at },
    };
  }
  return { ok: false, reason: 'invalid_action' };
}

function hmac(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function challengeHash(record, code, secret) {
  return hmac(secret, `${record.id}:${record.quote_id}:${record.quote_revision}:${record.email}:${code}`);
}

export function createSignerChallenge({ quote, email, ip = '', now = new Date(), secret = process.env.QUOTE_OTP_SECRET || process.env.SESSION_SECRET }) {
  if (!secret) throw new Error('QUOTE_OTP_SECRET or SESSION_SECRET required');
  const id = `qsc_${crypto.randomBytes(12).toString('hex')}`;
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const normalizedEmail = String(email).trim().toLowerCase();
  const record = {
    id,
    quote_id: quote.id,
    quote_revision: Number(quote.revision || 1),
    email: normalizedEmail,
    code_hash: null,
    ip_hash: hmac(secret, String(ip || 'unknown')),
    attempts: 0,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString(),
    verified_at: null,
    consumed_at: null,
    consumption_nonce: null,
  };
  record.code_hash = challengeHash(record, code, secret);
  return { code, record };
}

export function verifySignerChallenge({ challenge, code, quote, email, now = new Date(), secret = process.env.QUOTE_OTP_SECRET || process.env.SESSION_SECRET }) {
  if (!challenge || !quote) return { ok: false, reason: 'challenge_not_found' };
  if (challenge.consumed_at) return { ok: false, reason: 'challenge_consumed' };
  if (Number(challenge.attempts || 0) >= MAX_ATTEMPTS) return { ok: false, reason: 'challenge_locked' };
  if (new Date(challenge.expires_at).getTime() <= now.getTime()) return { ok: false, reason: 'challenge_expired' };
  if (challenge.quote_id !== quote.id || Number(challenge.quote_revision) !== Number(quote.revision || 1)) {
    return { ok: false, reason: 'quote_revision_changed' };
  }
  if (String(challenge.email).toLowerCase() !== String(email || '').trim().toLowerCase()) return { ok: false, reason: 'email_mismatch' };
  if (!secret || !code || !safeDigestEqual(challenge.code_hash, challengeHash(challenge, String(code), secret))) {
    return { ok: false, reason: 'invalid_code' };
  }
  return { ok: true };
}

function safeDigestEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function buildAcceptanceEvidence({ quote, items, signer, po_number, binding_acknowledged, ip, user_agent, accepted_at = new Date() }) {
  const normalizedItems = normalizeAcceptedQuoteItems(items);
  const canonicalDocument = {
    quote_id: quote.id,
    quote_revision: Number(quote.revision || 1),
    terms_version: quote.terms_version || 'current',
    customer_id: quote.customer_id,
    customer_po: String(po_number),
    payment_terms: quote.payment_terms || null,
    subtotal: Number(quote.subtotal || 0),
    shipping_cost: Number(quote.shipping_cost || 0),
    tax: Number(quote.tax || 0),
    total: Number(quote.total || 0),
    line_items: normalizedItems
      .map((item) => ({
        sku: item.sku, name: item.name, qty: item.qty,
        unit_price: item.unit_price, ext_price: item.ext_price,
      }))
      .sort((a, b) => `${a.sku}:${a.name}`.localeCompare(`${b.sku}:${b.name}`)),
    signer: {
      name: String(signer.name).trim(),
      title: String(signer.title).trim(),
      email: String(signer.email).trim().toLowerCase(),
    },
    binding_acknowledged: Boolean(binding_acknowledged),
    accepted_at: accepted_at.toISOString(),
    ip: ip || null,
    user_agent: user_agent || null,
  };
  return {
    quote_id: quote.id,
    quote_revision: canonicalDocument.quote_revision,
    terms_version: canonicalDocument.terms_version,
    accepted_at: canonicalDocument.accepted_at,
    signer: canonicalDocument.signer,
    customer_po: canonicalDocument.customer_po,
    ip: canonicalDocument.ip,
    user_agent: canonicalDocument.user_agent,
    binding_acknowledged: canonicalDocument.binding_acknowledged,
    canonical_document: canonicalDocument,
    document_hash: crypto.createHash('sha256').update(JSON.stringify(canonicalDocument)).digest('hex'),
  };
}

export function sanitizePublicQuoteAcceptance({ quote, items = [], organization = null }) {
  const acceptanceAvailable = organization?.status === 'active' && organization?.approval_status === 'approved';
  return {
    quote: {
      id: quote.id,
      customer_name: quote.customer_name || null,
      contact_email: quote.contact_email || null,
      status: quote.status,
      revision: Number(quote.revision || 1),
      valid_until: quote.valid_until || null,
      terms_version: quote.terms_version || 'current',
      payment_terms: quote.payment_terms || null,
      subtotal: Number(quote.subtotal || 0),
      shipping_cost: Number(quote.shipping_cost || 0),
      tax: Number(quote.tax || 0),
      total: Number(quote.total || 0),
      currency: quote.currency || 'USD',
      acceptance_available: acceptanceAvailable&&quoteDeliveryValid(quote,items),
      delivery_review_required:!quoteDeliveryValid(quote,items),
      account_completion_required: !acceptanceAvailable,
    },
    items: items.map((item) => {
      const qty = Number(item.target_qty ?? item.qty ?? item.moq ?? 1);
      const unitPrice = Number(item.sell_per_unit ?? item.unit_price ?? 0);
      return {
        id: item.id,
        sku: item.sku || item.gtin || null,
        gtin: item.gtin || null,
        name: item.name || item.sku,
        target_qty: qty,
        qty,
        moq: Number(item.moq || 0),
        sell_per_unit: unitPrice,
        unit_price: unitPrice,
        ext_sell: Number(item.ext_sell ?? item.ext_price ?? unitPrice * qty),
        ext_price: Number(item.ext_sell ?? item.ext_price ?? unitPrice * qty),
        lead_time_days: item.lead_time_days ?? null,
        fda_validated: Boolean(item.fda_validated),
        hts_code: item.hts_code || null,
        origin_country: item.origin_country || null,
      };
    }),
  };
}

function client() {
  return process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
}

async function getRow(sql, table, id) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${String(id)} AND deleted=false LIMIT 1`;
  return rows[0]?.data || null;
}

async function findQuoteByToken(sql, token) {
  const parsed = parseQuoteAcceptanceToken(token);
  if (parsed) {
    const quote = await getRow(sql, 'quotes', parsed.quote_id);
    if (!quote) return null;
    const revision = Number(quote.revision || 1);
    if (parsed.revision !== revision || Number(quote.acceptance_token_revision || revision) !== revision) return null;
    const expected = hashQuoteAcceptanceToken(token, quote.id, revision);
    if (!quote.acceptance_token_hash || !safeDigestEqual(quote.acceptance_token_hash, expected)) return null;
    return quote;
  }
  if (process.env.NODE_ENV === 'production') return null;
  const rows = await sql`SELECT data FROM um_rows WHERE tbl='quotes' AND deleted=false AND data->>'acceptance_token'=${String(token)} LIMIT 1`;
  return rows[0]?.data || null;
}

async function upsertRow(sql, table, id, data) {
  await sql`
    INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
    VALUES (${table},${String(id)},${JSON.stringify(data)}::jsonb,false,now())
    ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()`;
}

function requestIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}

function authorizedSignerEmails(quote, profiles = []) {
  return new Set([
    quote.contact_email,
    ...(quote.authorized_signer_emails || []),
    ...profiles.filter((profile) => profile.org_id === quote.customer_id).map((profile) => profile.email),
  ].filter(Boolean).map((email) => String(email).trim().toLowerCase()));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const sql = client();
  if (!sql) return sendJson(res, 503, { error: 'acceptance_not_configured' });

  if (req.method === 'GET') {
    try {
      const quote = await findQuoteByToken(sql, req.query?.token);
      if (!quote) return sendJson(res, 404, { error: 'quote_not_found' });
      const organization = await getRow(sql, 'organizations', quote.customer_id);
      if (quote.status !== 'accepted') {
        const eligibility = quoteAcceptanceEligibility({ quote, organization });
        const quickQuoteView = quote.source === 'quick_quote'
          && organization?.status === 'active'
          && organization?.approval_status === 'quote_verified'
          && quote.status === 'sent'
          && (!quote.valid_until || new Date(quote.valid_until).getTime() > Date.now());
        if (!eligibility.ok && !quickQuoteView) return sendJson(res, eligibility.reason === 'quote_expired' ? 410 : 403, { error: eligibility.reason });
      } else if (!organization || organization.approval_status !== 'approved') {
        return sendJson(res, 403, { error: 'account_not_approved' });
      }
      const itemRows = await sql`SELECT data FROM um_rows WHERE tbl='quote_items' AND deleted=false AND data->>'quote_id'=${String(quote.id)}`;
      return sendJson(res, 200, sanitizePublicQuoteAcceptance({ quote, organization, items: itemRows.map((row) => row.data) }));
    } catch (error) {
      logEvent('quotes.acceptance', 'view_error', { error: error.message });
      return sendJson(res, 500, { error: 'quote_view_failed' });
    }
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const secret = process.env.QUOTE_OTP_SECRET || process.env.SESSION_SECRET;
  if (!secret) return sendJson(res, 503, { error: 'acceptance_not_configured' });

  try {
    const raw = await readRawBody(req);
    const body = JSON.parse(raw.toString('utf8') || '{}');
    const quote = await findQuoteByToken(sql, body.token);
    if (!quote) return sendJson(res, 404, { error: 'quote_not_found' });
    const now = new Date();
    const ip = requestIp(req);
    if (['counter', 'decline', 'refresh'].includes(body.action)) {
      const itemRows = await sql`SELECT data FROM um_rows WHERE tbl='quote_items' AND deleted=false AND data->>'quote_id'=${String(quote.id)}`;
      const plan = planQuoteResponse({ quote, items: itemRows.map((row) => row.data), action: body.action, input: body, now });
      if (!plan.ok) return sendJson(res, plan.reason === 'quote_expired' ? 410 : 409, { error: plan.reason });
      if (plan.idempotent) return sendJson(res, 200, { ok: true, duplicate: true, quote: plan.quote });
      const revision = Number(quote.revision || 1);
      const recipient = quote.assigned_owner_email || 'support@unitemedical.net';
      const outbox = buildCustomerIoOutbox({
        idempotency_key: `quote:${quote.id}:r${revision}:${body.action}`,
        to: recipient,
        transactional_message_id: `quote_${body.action}`,
        subject: `Quote ${quote.id} ${body.action}`,
        body: body.action === 'counter'
          ? `A counter-offer was submitted for quote ${quote.id}.`
          : body.action === 'decline'
            ? `Quote ${quote.id} was declined${plan.quote.decline_reason ? `: ${plan.quote.decline_reason}` : '.'}`
            : `Refreshed pricing was requested for quote ${quote.id}.`,
        ref_type: 'quote', ref_id: quote.id,
        message_data: { quote_id: quote.id, quote_revision: revision, action: body.action },
        now,
      });
      const queries = [
        (txn) => txn`UPDATE um_rows SET data=${JSON.stringify(plan.quote)}::jsonb,updated_at=now()
          WHERE tbl='quotes' AND id=${quote.id} AND deleted=false
            AND data->>'status'=${quote.status}
            AND COALESCE((data->>'revision')::int,1)=${revision}
          RETURNING id`,
        ...plan.items.map((item) => (txn) => txn`UPDATE um_rows SET data=${JSON.stringify(item)}::jsonb,updated_at=now()
          WHERE tbl='quote_items' AND id=${item.id} AND deleted=false AND data->>'quote_id'=${quote.id}
          RETURNING id`),
        ...(plan.task ? [(txn) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          VALUES ('tasks',${plan.task.id},${JSON.stringify(plan.task)}::jsonb,false,now())
          ON CONFLICT (tbl,id) DO NOTHING`] : []),
        (txn) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          VALUES ('audit_log',${plan.audit.id},${JSON.stringify(plan.audit)}::jsonb,false,now())
          ON CONFLICT (tbl,id) DO NOTHING`,
        (txn) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          VALUES ('customerio_outbox',${outbox.id},${JSON.stringify(outbox)}::jsonb,false,now())
          ON CONFLICT (tbl,id) DO NOTHING`,
      ];
      const results = await sql.transaction((txn) => queries.map((query) => query(txn)));
      if (!results[0]?.length) return sendJson(res, 409, { error: 'quote_state_changed' });
      return sendJson(res, 200, { ok: true, quote: plan.quote, outbox_id: outbox.id });
    }
    if (body.action === 'accept' && quote.status === 'accepted' && quote.accepted_order_id) {
      const existingOrder = await getRow(sql, 'orders', quote.accepted_order_id);
      return sendJson(res, 200, { ok: true, already_accepted: true, order: existingOrder });
    }
    const organization = await getRow(sql, 'organizations', quote.customer_id);
    const eligibility = quoteAcceptanceEligibility({ quote, organization, now });
    if (!eligibility.ok) {
      const status = eligibility.reason === 'quote_expired' ? 410
        : eligibility.reason === 'quote_already_accepted' ? 409 : 403;
      return sendJson(res, status, { error: eligibility.reason });
    }

    if (body.action === 'request_verification') {
      const email = String(body.email || '').trim().toLowerCase();
      const profileRows = await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND deleted=false AND data->>'org_id'=${String(quote.customer_id)}`;
      if (!authorizedSignerEmails(quote, profileRows.map((row) => row.data)).has(email)) {
        return sendJson(res, 403, { error: 'unauthorized_signer_email' });
      }
      const recent = await sql`
        SELECT count(*)::int AS count FROM um_rows
        WHERE tbl='quote_signer_challenges' AND deleted=false
          AND data->>'quote_id'=${String(quote.id)} AND data->>'email'=${email}
          AND (data->>'created_at')::timestamptz > now() - interval '1 hour'`;
      if (Number(recent[0]?.count || 0) >= 3) return sendJson(res, 429, { error: 'verification_rate_limited' });
      const challenge = createSignerChallenge({ quote, email, ip, now, secret });
      await upsertRow(sql, 'quote_signer_challenges', challenge.record.id, challenge.record);
      const delivery = await queueCustomerIoTransactional(sql, {
        idempotency_key: `quote:${quote.id}:challenge:${challenge.record.id}`,
        to: email,
        transactional_message_id: 'quote_signer_verification',
        subject: 'Your Unite Medical verification code',
        body: `Your verification code is ${challenge.code}. It expires in 10 minutes.`,
        ref_type: 'quote_signer_challenge', ref_id: challenge.record.id,
        message_data: { quote_id: quote.id, challenge_id: challenge.record.id },
      });
      if (!delivery.ok) return sendJson(res, 503, { error: 'verification_delivery_failed' });
      return sendJson(res, 200, { ok: true, challenge_id: challenge.record.id, expires_at: challenge.record.expires_at });
    }

    if (body.action === 'confirm_verification') {
      const challenge = await getRow(sql, 'quote_signer_challenges', body.challenge_id);
      const result = verifySignerChallenge({ challenge, code: body.code, quote, email: body.email, now, secret });
      if (!result.ok) {
        if (challenge && result.reason === 'invalid_code') {
          await sql`
            UPDATE um_rows
            SET data=jsonb_set(data,'{attempts}',to_jsonb(COALESCE((data->>'attempts')::int,0)+1)),updated_at=now()
            WHERE tbl='quote_signer_challenges' AND id=${challenge.id} AND deleted=false
              AND COALESCE((data->>'attempts')::int,0) < ${MAX_ATTEMPTS}
              AND data->>'verified_at' IS NULL`;
        }
        return sendJson(res, 400, { error: result.reason });
      }
      const verified = { ...challenge, verified_at: now.toISOString() };
      const verifiedRows = await sql`
        UPDATE um_rows SET data=${JSON.stringify(verified)}::jsonb,updated_at=now()
        WHERE tbl='quote_signer_challenges' AND id=${challenge.id} AND deleted=false
          AND COALESCE((data->>'attempts')::int,0) < ${MAX_ATTEMPTS}
          AND data->>'verified_at' IS NULL AND data->>'consumed_at' IS NULL
        RETURNING data`;
      if (!verifiedRows.length) return sendJson(res, 409, { error: 'challenge_locked_or_verified' });
      return sendJson(res, 200, { ok: true, verified_at: verifiedRows[0].data.verified_at });
    }

    if (body.action === 'accept') {
      const signer = {
        name: String(body.signer_name || '').trim(),
        title: String(body.signer_title || '').trim(),
        email: String(body.signer_email || '').trim().toLowerCase(),
      };
      if (!signer.name || !signer.title || !signer.email) return sendJson(res, 400, { error: 'signer_identity_required' });
      if (!String(body.po_number || '').trim()) return sendJson(res, 400, { error: 'po_required' });
      if (body.binding_acknowledged !== true) return sendJson(res, 400, { error: 'binding_acknowledgment_required' });
      const challenge = await getRow(sql, 'quote_signer_challenges', body.challenge_id);
      if (!challenge || !challenge.verified_at) return sendJson(res, 400, { error: 'signer_verification_required' });
      if (challenge.consumed_at) return sendJson(res, 409, { error: 'challenge_consumed' });
      if (new Date(challenge.expires_at).getTime() <= now.getTime()) return sendJson(res, 400, { error: 'challenge_expired' });
      if (challenge.quote_id !== quote.id || Number(challenge.quote_revision) !== Number(quote.revision || 1)) return sendJson(res, 409, { error: 'quote_revision_changed' });
      if (challenge.email !== signer.email) return sendJson(res, 400, { error: 'email_mismatch' });
      const itemRows = await sql`SELECT data FROM um_rows WHERE tbl='quote_items' AND deleted=false AND data->>'quote_id'=${String(quote.id)}`;
      const items = itemRows.map((row) => row.data);
      if(!quoteDeliveryValid(quote,items)||quote.delivery_review.tax_exempt_basis!==(organization.tax_exempt===true||organization.shopify_tax_exempt===true))return sendJson(res,409,{error:'delivered_price_review_required'});
      const address=await getRow(sql,'addresses',quote.ship_to_address_id);
      if(!address||address.org_id!==quote.customer_id||JSON.stringify(address)!==JSON.stringify(quote.delivery_review.address))return sendJson(res,409,{error:'delivery_address_changed_review_again'});
      if (!items.length) return sendJson(res, 400, { error: 'no_items' });
      const normalizedItems = normalizeAcceptedQuoteItems(items);
      if (normalizedItems.some((item) => !item.sku || !(item.qty > 0) || !(item.unit_price > 0) || !(item.ext_price > 0))) {
        return sendJson(res, 400, { error: 'invalid_quote_items' });
      }
      const expectedSubtotal = Number(quote.subtotal ?? (Number(quote.total || 0) - Number(quote.shipping_cost || 0) - Number(quote.tax || 0)));
      const computedSubtotal = +normalizedItems.reduce((sum, item) => sum + item.ext_price, 0).toFixed(2);
      if (Math.abs(computedSubtotal - expectedSubtotal) > 0.01) return sendJson(res, 409, { error: 'quote_totals_changed' });
      const evidence = buildAcceptanceEvidence({
        quote, items, signer, po_number: body.po_number, binding_acknowledged: true,
        ip, user_agent: req.headers['user-agent'] || null, accepted_at: now,
      });
      const nonce = crypto.randomBytes(16).toString('hex');
      const revision = Number(quote.revision || 1);
      const evidenceId = `qae_${quote.id}_r${revision}`;
      const orderDigest = crypto.createHash('sha256').update(`${quote.id}:${revision}`).digest('hex').slice(0, 12).toUpperCase();
      const orderId = `Unite-WMS-${orderDigest.slice(0, 6)}-${orderDigest.slice(6)}`;
      const order = {
        id: orderId, quote_id: quote.id, customer_id: quote.customer_id,
        customer_name: quote.customer_name || organization.name || null,
        contact_email: quote.contact_email || signer.email,
        customer_po: String(body.po_number).trim(), po_number: String(body.po_number).trim(),
        status: 'payment_pending', payment_status: 'pending',
        payment_terms: quote.payment_terms || 'prepaid', payment_method: quote.payment_method || 'ach',
        totals_verified:true,ship_to_address_id:quote.ship_to_address_id,ship_from:quote.ship_from,shipping_package:quote.shipping_package,carrier:quote.carrier,ship_method:quote.ship_method,tax_basis:quote.tax_basis,
        subtotal: computedSubtotal, shipping_cost: Number(quote.shipping_cost || 0),
        tax: Number(quote.tax || 0), total: Number(quote.total || 0),
        acceptance_event_id: evidenceId, accepted_at: now.toISOString(),
        placed_at: now.toISOString(), created_at: now.toISOString(), source: 'quote_acceptance',
      };
      const orderItems = normalizedItems.map((item, index) => ({
        id: `${orderId}_line_${index + 1}`, order_id: orderId, customer_id: quote.customer_id,
        ...item,
      }));
      const acceptedQuote = {
        ...quote, status: 'accepted', accepted_at: now.toISOString(), accepted_order_id: orderId,
        acceptance_event_id: evidenceId, customer_po: String(body.po_number).trim(), acceptance_nonce: nonce,
      };
      const consumed = { ...challenge, consumed_at: now.toISOString(), consumption_nonce: nonce };
      const evidenceRow = { id: evidenceId, challenge_id: challenge.id, ...evidence };
      const audit = {
        id: `aud_${crypto.randomBytes(12).toString('hex')}`,
        kind: 'quote.accepted', ref_id: quote.id, actor_id: signer.email,
        payload: { order_id: orderId, evidence_id: evidenceId, document_hash: evidence.document_hash },
        created_at: now.toISOString(),
      };

      const results = await sql.transaction((txn) => [
        txn`UPDATE um_rows SET data=${JSON.stringify(acceptedQuote)}::jsonb,updated_at=now()
          WHERE tbl='quotes' AND id=${quote.id} AND deleted=false
            AND data->>'status'='sent' AND COALESCE((data->>'revision')::int,1)=${revision}
            AND EXISTS (
              SELECT 1 FROM um_rows challenge
              WHERE challenge.tbl='quote_signer_challenges' AND challenge.id=${challenge.id} AND challenge.deleted=false
                AND challenge.data->>'verified_at' IS NOT NULL AND challenge.data->>'consumed_at' IS NULL
                AND challenge.data->>'quote_id'=${quote.id}
                AND COALESCE((challenge.data->>'quote_revision')::int,1)=${revision}
                AND lower(challenge.data->>'email')=${signer.email}
            )
          RETURNING id`,
        txn`UPDATE um_rows SET data=${JSON.stringify(consumed)}::jsonb,updated_at=now()
          WHERE tbl='quote_signer_challenges' AND id=${challenge.id} AND deleted=false
            AND data->>'verified_at' IS NOT NULL AND data->>'consumed_at' IS NULL
            AND EXISTS (SELECT 1 FROM um_rows q WHERE q.tbl='quotes' AND q.id=${quote.id} AND q.data->>'acceptance_nonce'=${nonce})
          RETURNING id`,
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          SELECT 'quote_acceptance_events',${evidenceId},${JSON.stringify(evidenceRow)}::jsonb,false,now()
          WHERE EXISTS (SELECT 1 FROM um_rows q WHERE q.tbl='quotes' AND q.id=${quote.id} AND q.data->>'acceptance_nonce'=${nonce})
            AND EXISTS (SELECT 1 FROM um_rows c WHERE c.tbl='quote_signer_challenges' AND c.id=${challenge.id} AND c.data->>'consumption_nonce'=${nonce})
          ON CONFLICT (tbl,id) DO NOTHING`,
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          SELECT 'orders',${orderId},${JSON.stringify(order)}::jsonb,false,now()
          WHERE EXISTS (SELECT 1 FROM um_rows q WHERE q.tbl='quotes' AND q.id=${quote.id} AND q.data->>'acceptance_nonce'=${nonce})
            AND EXISTS (SELECT 1 FROM um_rows c WHERE c.tbl='quote_signer_challenges' AND c.id=${challenge.id} AND c.data->>'consumption_nonce'=${nonce})
          ON CONFLICT (tbl,id) DO NOTHING`,
        ...orderItems.map((item) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          SELECT 'order_items',${item.id},${JSON.stringify(item)}::jsonb,false,now()
          WHERE EXISTS (SELECT 1 FROM um_rows q WHERE q.tbl='quotes' AND q.id=${quote.id} AND q.data->>'acceptance_nonce'=${nonce})
            AND EXISTS (SELECT 1 FROM um_rows c WHERE c.tbl='quote_signer_challenges' AND c.id=${challenge.id} AND c.data->>'consumption_nonce'=${nonce})
          ON CONFLICT (tbl,id) DO NOTHING`),
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
          WHERE EXISTS (SELECT 1 FROM um_rows q WHERE q.tbl='quotes' AND q.id=${quote.id} AND q.data->>'acceptance_nonce'=${nonce})
          ON CONFLICT (tbl,id) DO NOTHING`,
      ]);
      if (!results[0]?.length) {
        const currentQuote = await getRow(sql, 'quotes', quote.id);
        if (currentQuote?.status === 'accepted' && currentQuote.accepted_order_id) {
          const existingOrder = await getRow(sql, 'orders', currentQuote.accepted_order_id);
          const existingEvidence = currentQuote.acceptance_event_id
            ? await getRow(sql, 'quote_acceptance_events', currentQuote.acceptance_event_id)
            : null;
          const replayDelivery = await queueCustomerIoTransactional(sql, {
            idempotency_key: `quote:${currentQuote.id}:accepted:${currentQuote.accepted_order_id}`,
            to: signer.email, transactional_message_id: 'quote_acceptance_receipt',
            subject: `Quote ${currentQuote.id} accepted`,
            body: `Acceptance recorded for quote ${currentQuote.id}. Order ${currentQuote.accepted_order_id}. Evidence hash ${existingEvidence?.document_hash || 'recorded'}.`,
            ref_type: 'order', ref_id: currentQuote.accepted_order_id,
            message_data: { quote_id: currentQuote.id, order_id: currentQuote.accepted_order_id, evidence_hash: existingEvidence?.document_hash || null },
          });
          return sendJson(res, 200, { ok: true, already_accepted: true, order: existingOrder, receipt_delivery: replayDelivery.ok ? 'accepted' : 'queued_for_retry' });
        }
        return sendJson(res, 409, { error: 'quote_acceptance_conflict' });
      }
      if (!results[1]?.length) return sendJson(res, 500, { error: 'acceptance_transaction_incomplete' });

      const delivery = await queueCustomerIoTransactional(sql, {
        idempotency_key: `quote:${quote.id}:accepted:${orderId}`,
        to: signer.email, transactional_message_id: 'quote_acceptance_receipt',
        subject: `Quote ${quote.id} accepted`,
        body: `Acceptance recorded for quote ${quote.id}. Order ${orderId}. Evidence hash ${evidence.document_hash}.`,
        ref_type: 'order', ref_id: orderId,
        message_data: { quote_id: quote.id, order_id: orderId, evidence_hash: evidence.document_hash },
      });
      if (!delivery.ok) logEvent('quotes.acceptance', 'receipt_delivery_failed', { quote_id: quote.id, order_id: orderId, reason: delivery.reason });
      return sendJson(res, 200, { ok: true, order, evidence: { id: evidenceId, document_hash: evidence.document_hash }, receipt_delivery: delivery.ok ? 'accepted' : 'queued_for_retry' });
    }

    return sendJson(res, 400, { error: 'invalid_action' });
  } catch (error) {
    logEvent('quotes.acceptance', 'error', { error: error.message });
    return sendJson(res, 500, { error: 'acceptance_failed' });
  }
}
