/**
 * Shared HTTP utilities for the external API clients.
 *
 * Every client in this folder follows the same shape:
 *   - real fetch() when credentials are present + we're server-side
 *     (or VITE_API_BASE points to a proxy)
 *   - graceful stub fallback otherwise so the demo + dev keeps working
 *
 * Centralizing the timeout, error wrapping, retry, and warn-on-dev
 * here means every client stays small and consistent.
 */

export const DEFAULT_TIMEOUT_MS = 6000;
export const DEFAULT_USER_AGENT = 'Unite-Medical/2.0 (+https://unitemedical.net)';

export const IS_BROWSER = typeof window !== 'undefined';
export const IS_DEV =
  typeof import.meta !== 'undefined' && import.meta.env?.DEV;

/**
 * Backend proxy base URL.
 *
 * PRD-01 shipped as Vercel serverless functions under /api — in the
 * browser we default to the same-origin '/api' so every client
 * attempts the real upstream through the proxy first. When a service
 * has no credentials configured server-side the proxy answers 503 and
 * `realOrStub` drops to the local stub, so dev/demo behavior is
 * unchanged until env vars are set in Vercel.
 *
 * VITE_API_BASE still overrides (e.g. pointing at a preview deploy).
 */
export const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE)
  || (typeof window !== 'undefined' ? '/api' : '');

/** Lightweight env reader. Browser: Vite injects via `import.meta.env`.
 *  Node: `process.env`. We use `globalThis.process` so the browser
 *  build doesn't try to resolve the `process` global. */
export function env(name) {
  const proc = globalThis.process;
  if (proc?.env?.[name]) return proc.env[name];
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[`VITE_${name}`] || import.meta.env[name] || '';
  }
  return '';
}

/** Dev-only console warning, namespaced. */
export function warn(scope, msg) {
  if (IS_DEV) console.warn(`[${scope}] ${msg}`);
}

/**
 * fetch() wrapper with timeout + JSON parsing + non-2xx → throw.
 */
export async function fetchJson(url, init = {}, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) {
      // 404 often means "no record" upstream — let callers decide.
      const text = await res.text().catch(() => '');
      const err = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      err.status = res.status;
      err.body = text;
      throw err;
    }
    if (res.status === 204) return null;
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Stub-or-real helper. If `predicate()` is true, call `real()`. On
 * error OR when predicate is false, fall back to `stub()`. Used by
 * every client to drop into stub mode without exposing the branch
 * everywhere.
 */
export async function realOrStub({ scope, label, predicate, real, stub }) {
  if (!predicate()) return stub();
  try {
    return await real();
  } catch (err) {
    warn(scope, `${label} failed (${err.message}); using stub`);
    return stub();
  }
}

/**
 * Validate a webhook signature (HMAC-SHA256, hex or base64 output).
 *
 * Server-side verification with timestamp tolerance lives in
 * `api/_lib/http.js` — that's what the /api/hooks/* receivers use.
 * This WebCrypto version exists so client-side dispatchers can
 * re-verify events when a secret is intentionally exposed (e.g. a
 * sandboxed integration test) and for Node-based verifier scripts.
 */
export async function verifyWebhookSignature({ algorithm = 'sha256', secret, payload, header }) {
  if (!secret) return { ok: false, reason: 'no_secret_configured' };
  if (!header) return { ok: false, reason: 'no_signature_header' };
  if (algorithm !== 'sha256') return { ok: false, reason: `unsupported_algorithm_${algorithm}` };
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { ok: false, reason: 'webcrypto_unavailable' };
  try {
    const enc = new TextEncoder();
    const key = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await subtle.sign('HMAC', key, enc.encode(String(payload))));
    const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
    const b64 = btoa(String.fromCharCode(...mac));
    const given = String(header).replace(/^sha256=/, '').trim();
    const ok = given === hex || given === b64;
    return ok ? { ok: true } : { ok: false, reason: 'signature_mismatch' };
  } catch (err) {
    return { ok: false, reason: `verify_failed_${err.message}` };
  }
}
