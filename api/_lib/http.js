/**
 * Shared helpers for the Vercel serverless layer (PRD-01).
 *
 * Plain Node runtime — no framework. Every function here is
 * dependency-free so the functions cold-start fast.
 */

import crypto from 'node:crypto';

/** Read the raw request body as a Buffer, regardless of parsing state. */
export async function readRawBody(req) {
  // Vercel's Node runtime may have already parsed the body for
  // application/json. If so, the stream is consumed — re-serialize.
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body);
    return Buffer.from(JSON.stringify(req.body));
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

/** Constant-time string comparison. */
export function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function hmacHex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function hmacBase64(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

/**
 * Verify a Stripe-style signature header:
 *   Stripe-Signature: t=<ts>,v1=<hex hmac of "<ts>.<payload>">
 * Docs: https://docs.stripe.com/webhooks/signatures
 */
export function verifyStripeSignature({ header, payload, secret, toleranceSec = 300 }) {
  if (!secret) return { ok: false, reason: 'no_secret_configured' };
  if (!header) return { ok: false, reason: 'no_signature_header' };
  const parts = Object.fromEntries(
    String(header).split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const ts = Number(parts.t);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad_timestamp' };
  if (Math.abs(Date.now() / 1000 - ts) > toleranceSec) return { ok: false, reason: 'timestamp_out_of_tolerance' };
  const expected = hmacHex(secret, `${parts.t}.${payload}`);
  if (!parts.v1 || !safeEqual(expected, parts.v1)) return { ok: false, reason: 'signature_mismatch' };
  return { ok: true };
}

/**
 * Verify a plain HMAC-SHA256 signature header (hex or base64).
 * Used by ShipStation, Flexport, Fathom, Calendly-style webhooks.
 */
export function verifyHmacSignature({ header, payload, secret }) {
  if (!secret) return { ok: false, reason: 'no_secret_configured' };
  if (!header) return { ok: false, reason: 'no_signature_header' };
  const sig = String(header).replace(/^sha256=/, '').trim();
  const hex = hmacHex(secret, payload);
  const b64 = hmacBase64(secret, payload);
  if (safeEqual(sig, hex) || safeEqual(sig, b64)) return { ok: true };
  return { ok: false, reason: 'signature_mismatch' };
}

/** Forwarded-event log. Without Postgres (PRD-13) we log to stdout —
 *  Vercel keeps these in the function logs, queryable from the dash. */
export function logEvent(scope, kind, detail) {
  console.log(JSON.stringify({ at: new Date().toISOString(), scope, kind, ...detail }));
}
