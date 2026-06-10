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

/** Backend proxy base URL, set in production once PRD-01 ships. */
export const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) || '';

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
 * Validate a webhook signature. Each upstream uses a different
 * algorithm but the call site stays uniform.
 */
export async function verifyWebhookSignature({ algorithm, secret, payload, header }) {
  if (!secret) return { ok: false, reason: 'no_secret_configured' };
  if (!header) return { ok: false, reason: 'no_signature_header' };
  // We don't run on the server yet — webhook verification is a
  // backend-only concern. Until PRD-01 ships, every webhook is logged
  // but considered untrusted.
  void algorithm;
  void payload;
  return { ok: false, reason: 'pending_pr_01_backend' };
}
