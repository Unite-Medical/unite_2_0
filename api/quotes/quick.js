import crypto from 'node:crypto';
import { resolve4, resolve6, resolveMx } from 'node:dns/promises';
import { isIP } from 'node:net';
import { neon } from '@neondatabase/serverless';
import { sessionFromRequest } from '../_lib/auth.js';
import { loadCommerceContext, resolveAuthoritativePrice } from '../_lib/commerce.js';
import { logEvent, readRawBody, sendJson } from '../_lib/http.js';

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'aol.com', 'proton.me', 'protonmail.com', 'live.com', 'msn.com',
]);

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}
function money(value) { return +Number(value || 0).toFixed(2); }
function emailDomain(email) { return String(email || '').split('@')[1]?.toLowerCase() || ''; }
function websiteDomain(website) {
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
function domainsMatch(emailHost, websiteHost) {
  return Boolean(emailHost && websiteHost && (emailHost === websiteHost || emailHost.endsWith(`.${websiteHost}`)));
}
function publicHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  return Boolean(host && !isIP(host) && host !== 'localhost'
    && !['.localhost', '.local', '.internal', '.test', '.invalid', '.example'].some((suffix) => host.endsWith(suffix)));
}
function publicAddress(address) {
  const value = String(address || '').toLowerCase();
  if (isIP(value) === 4) {
    const [a, b] = value.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168));
  }
  if (isIP(value) === 6) {
    return !(value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd')
      || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')
      || value.startsWith('::ffff:127.') || value.startsWith('::ffff:10.') || value.startsWith('::ffff:192.168.'));
  }
  return false;
}
function base64Url(value) { return Buffer.from(value).toString('base64url'); }

export function normalizeQuickQuoteRequest(body = {}) {
  const companyName = String(body.company_name || '').trim();
  const contactName = String(body.contact_name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const website = String(body.website || '').trim().toLowerCase();
  const shippingZip = String(body.shipping_zip || '').trim();
  const emailHost = emailDomain(email);
  const websiteHost = websiteDomain(website);
  if (!companyName || !contactName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !websiteHost || !/^\d{5}(?:-\d{4})?$/.test(shippingZip)) {
    return { ok: false, reason: 'business_identity_required' };
  }
  if (!publicHostname(emailHost) || !publicHostname(websiteHost)) return { ok: false, reason: 'business_website_invalid' };
  if (PERSONAL_DOMAINS.has(emailHost)) return { ok: false, reason: 'work_email_required' };
  if (!domainsMatch(emailHost, websiteHost)) return { ok: false, reason: 'email_website_mismatch' };
  const idempotencyKey = String(body.idempotency_key || '').trim();
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(idempotencyKey)) return { ok: false, reason: 'idempotency_key_required' };
  const quantityBySku = new Map();
  for (const raw of Array.isArray(body.lines) ? body.lines : []) {
    const sku = String(raw?.sku || '').trim();
    const qty = Number(raw?.qty);
    if (!sku || !Number.isInteger(qty) || qty < 1) continue;
    quantityBySku.set(sku, (quantityBySku.get(sku) || 0) + qty);
  }
  const lines = [...quantityBySku].map(([sku, qty]) => ({ sku, qty }));
  if (!lines.length) return { ok: false, reason: 'no_valid_lines' };
  return {
    ok: true,
    idempotency_key: idempotencyKey,
    identity: {
      company_name: companyName, contact_name: contactName, email, website,
      shipping_zip: shippingZip, email_domain: emailHost, website_domain: websiteHost,
    },
    lines,
  };
}

async function defaultResolveBusinessDomain(domain) {
  try {
    const mx = await resolveMx(domain);
    if (mx.length) return true;
  } catch { /* try address records */ }
  try {
    const addresses = await Promise.any([resolve4(domain), resolve6(domain)]);
    return addresses.length > 0;
  } catch {
    return false;
  }
}

async function defaultFetchWebsite(url) {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const response = await fetch(target, {
      method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'UniteMedical-QuickQuote-Verification/1.0' },
    });
    if (response.status === 405) {
      return fetch(target, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'UniteMedical-QuickQuote-Verification/1.0', Range: 'bytes=0-1024' },
      });
    }
    return response;
  } catch {
    return { ok: false, status: 0 };
  }
}

async function defaultResolveWebsiteAddresses(domain) {
  const settled = await Promise.allSettled([resolve4(domain), resolve6(domain)]);
  return settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
}

export async function verifyQuickQuoteNetwork(identity, {
  resolveBusinessDomain = defaultResolveBusinessDomain,
  resolveWebsiteAddresses = defaultResolveWebsiteAddresses,
  fetchWebsite = defaultFetchWebsite,
} = {}) {
  if (!identity?.website_domain || !identity?.email_domain) return { ok: false, reason: 'business_identity_required' };
  if (!await resolveBusinessDomain(identity.email_domain)) return { ok: false, reason: 'business_domain_unverified' };
  const addresses = await resolveWebsiteAddresses(identity.website_domain);
  if (!addresses.length || addresses.some((address) => !publicAddress(address))) return { ok: false, reason: 'business_website_invalid' };
  const response = await fetchWebsite(identity.website);
  if (!response?.ok) return { ok: false, reason: 'business_website_unreachable' };
  return { ok: true };
}

function deterministicQuoteToken(quoteId, revision, idempotencyKey, secret) {
  if (!secret || String(secret).length < 24) throw new Error('QUOTE_LINK_SECRET or SESSION_SECRET must be at least 24 characters');
  const entropy = crypto.createHmac('sha256', secret).update(`${quoteId}:${revision}:${idempotencyKey}`).digest('base64url');
  return `${base64Url(quoteId)}.${revision}.${entropy}`;
}

export function buildQuickQuotePlan({
  request,
  products = [],
  pricingRows = [],
  contractRows = [],
  volumeBreakRows = [],
  organization: organizationOverride = null,
  tokenSecret,
  now = new Date(),
} = {}) {
  if (!request?.ok) return request || { ok: false, reason: 'invalid_request' };
  const identity = request.identity;
  const organization = organizationOverride || {
    id: stableId('org', identity.email),
    name: identity.company_name,
    website: identity.website,
    contact_email: identity.email,
    shipping_zip: identity.shipping_zip,
    segment: 'asc', tier: 'C', terms: 'ach', credit_limit: 0,
    approval_status: 'quote_verified', status: 'active',
    quote_verified_at: now.toISOString(), created_at: now.toISOString(),
  };
  const quoteId = stableId('quote', `${identity.email}:${request.idempotency_key}`);
  const normalizedRequest = JSON.stringify({ email: identity.email, lines: [...request.lines].sort((a, b) => a.sku.localeCompare(b.sku)) });
  const requestHash = crypto.createHash('sha256').update(normalizedRequest).digest('hex');
  const token = deterministicQuoteToken(quoteId, 1, request.idempotency_key, tokenSecret);
  const tokenHash = crypto.createHash('sha256').update(`${quoteId}:1:${token}`).digest('hex');
  const items = [];
  for (const requested of request.lines) {
    const parent = products.find((product) => (
      product.sku === requested.sku || product.id === requested.sku
      || (product.variants || []).some((variant) => variant.sku === requested.sku)
    ));
    if (!parent) return { ok: false, reason: 'product_not_found', sku: requested.sku };
    const variant = parent.variants?.find((candidate) => candidate.sku === requested.sku);
    const product = variant
      ? { ...parent, sku: variant.sku, name: `${parent.name} · ${variant.title}`, price: variant.price }
      : parent;
    const priced = resolveAuthoritativePrice({
      product, quantity: requested.qty, organization,
      pricingRows, contractRows, volumeBreakRows, now,
    });
    if (!priced.ok) return { ...priced, sku: requested.sku };
    items.push({
      id: stableId('qitem', `${quoteId}:${requested.sku}`), quote_id: quoteId,
      sku: requested.sku, name: product.name, target_qty: requested.qty,
      list_price: priced.list_price, sell_per_unit: priced.unit_price,
      ext_sell: money(priced.unit_price * requested.qty),
      pricing_basis: priced.basis, tier: priced.tier,
    });
  }
  const total = money(items.reduce((sum, item) => sum + item.ext_sell, 0));
  const quote = {
    id: quoteId, customer_id: organization.id, customer_name: organization.name,
    contact_email: identity.email, customer_tier: organization.tier || 'C',
    line_count: items.length, subtotal: total, shipping_cost: 0, tax: 0, total,
    source: organization.approval_status === 'approved' ? 'self_serve_account' : 'quick_quote',
    status: 'sent', revision: 1,
    acceptance_token_hash: tokenHash, acceptance_token_revision: 1,
    request_hash: requestHash,
    valid_until: new Date(now.getTime() + 14 * 86400000).toISOString(),
    created_at: now.toISOString(),
  };
  const contact = {
    id: stableId('contact', identity.email), org_id: organization.id,
    name: identity.contact_name, email: identity.email, role: 'buyer',
    source: 'quick_quote', status: 'active', created_at: now.toISOString(),
  };
  const task = {
    id: stableId('task', `${quoteId}:follow_up`), kind: 'quick_quote_follow_up',
    subject: `Quick Quote follow-up · ${organization.name}`,
    owner_email: organization.account_owner_email || 'sales@unitemedical.net',
    status: 'open', ref_type: 'quote', ref_id: quoteId,
    payload: { org_id: organization.id, email: identity.email, shipping_zip: identity.shipping_zip },
    created_at: now.toISOString(),
  };
  return { ok: true, token, quote, items, organization, contact, task, request_hash: requestHash };
}

function safeQuote(plan) {
  return {
    id: plan.quote.id,
    customer_name: plan.quote.customer_name,
    status: plan.quote.status,
    revision: plan.quote.revision,
    valid_until: plan.quote.valid_until,
    subtotal: plan.quote.subtotal,
    total: plan.quote.total,
    currency: 'USD',
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const tokenSecret = process.env.QUOTE_LINK_SECRET || process.env.SESSION_SECRET;
  if (!process.env.DATABASE_URL || !tokenSecret) return sendJson(res, 503, { error: 'quick_quote_not_configured' });
  try {
    const raw = await readRawBody(req);
    const body = JSON.parse(raw.toString('utf8') || '{}');
    const session = sessionFromRequest(req);
    const sql = neon(process.env.DATABASE_URL);
    let normalized;
    let organization = null;
    let context = null;
    if (session) {
      context = await loadCommerceContext(sql, session);
      if (!context.ok) return sendJson(res, 403, { error: context.reason });
      organization = context.organization;
      normalized = normalizeQuickQuoteRequest({
        ...body,
        company_name: organization.name,
        contact_name: context.profile.name || session.name || 'Account buyer',
        email: context.profile.email,
        website: organization.website,
        shipping_zip: body.shipping_zip || organization.shipping_zip || '00000',
      });
      if (!normalized.ok) return sendJson(res, 400, { error: normalized.reason });
    } else {
      normalized = normalizeQuickQuoteRequest(body);
      if (!normalized.ok) return sendJson(res, 400, { error: normalized.reason });
      const network = await verifyQuickQuoteNetwork(normalized.identity);
      if (!network.ok) return sendJson(res, 422, { error: network.reason });
    }

    const [productRows, pricingRows, contractRows, volumeRows] = await Promise.all([
      sql`SELECT data FROM um_rows WHERE tbl='products' AND deleted=false`,
      sql`SELECT data FROM um_rows WHERE tbl='pricing' AND deleted=false`,
      sql`SELECT data FROM um_rows WHERE tbl='customer_contract_prices' AND deleted=false`,
      sql`SELECT data FROM um_rows WHERE tbl='volume_breaks' AND deleted=false`,
    ]);
    const plan = buildQuickQuotePlan({
      request: normalized,
      products: productRows.map((row) => row.data),
      pricingRows: pricingRows.map((row) => row.data),
      contractRows: contractRows.map((row) => row.data),
      volumeBreakRows: volumeRows.map((row) => row.data),
      organization,
      tokenSecret,
    });
    if (!plan.ok) return sendJson(res, 400, { error: plan.reason, sku: plan.sku });

    const existingRows = await sql`SELECT data FROM um_rows WHERE tbl='quotes' AND id=${plan.quote.id} AND deleted=false LIMIT 1`;
    const existing = existingRows[0]?.data;
    if (existing && existing.request_hash !== plan.request_hash) return sendJson(res, 409, { error: 'idempotency_conflict' });
    if (!existing) {
      const audit = {
        id: stableId('aud', `${plan.quote.id}:created`), kind: 'quick_quote.created',
        ref_id: plan.quote.id, actor_id: session?.user_id || plan.contact.email,
        payload: { organization_id: plan.organization.id, line_count: plan.items.length },
        created_at: plan.quote.created_at,
      };
      await sql.transaction((txn) => [
        ...(organization ? [] : [txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('organizations',${plan.organization.id},${JSON.stringify(plan.organization)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING`]),
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('contacts',${plan.contact.id},${JSON.stringify(plan.contact)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING`,
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('tasks',${plan.task.id},${JSON.stringify(plan.task)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING`,
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('quotes',${plan.quote.id},${JSON.stringify(plan.quote)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING`,
        ...plan.items.map((item) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('quote_items',${item.id},${JSON.stringify(item)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING`),
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING`,
      ]);
    }
    logEvent('quotes.quick', existing ? 'replayed' : 'created', { quote_id: plan.quote.id, org_id: plan.organization.id });
    return sendJson(res, existing ? 200 : 201, {
      ok: true,
      token: plan.token,
      quote: safeQuote(plan),
      items: plan.items.map((item) => ({ sku: item.sku, name: item.name, qty: item.target_qty, unit_price: item.sell_per_unit, ext_price: item.ext_sell })),
      account_completion_required: plan.organization.approval_status !== 'approved',
    });
  } catch (error) {
    logEvent('quotes.quick', 'error', { error: error.message });
    return sendJson(res, 500, { error: 'quick_quote_failed' });
  }
}
