/**
 * Resend client — transactional email (PRD-05, primary sender).
 *
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 *
 * Resend replaces Gmail OAuth as the default transactional rail: a
 * single server-side API key (RESEND_API_KEY), domain auth
 * (SPF/DKIM/DMARC), and deliverability built for app-generated mail —
 * none of the OAuth-refresh fragility or per-user send limits of Gmail.
 *
 * Auth: RESEND_API_KEY held server-side; the browser calls
 * `${API_BASE}/proxy/resend/*` and the serverless proxy injects the key.
 *
 * This is a REAL-ONLY transport: `sendRaw` throws when the proxy isn't
 * configured (503) so the provider chain in `src/lib/mailer.js` can fall
 * through to Gmail or the local outbox. Inbox reading stays on Gmail
 * (`src/lib/external/gmail.js`) — Resend is send-only.
 */

import { API_BASE, fetchJson, realOrStub } from './_http.js';

function viaBackendProxy() {
  return Boolean(API_BASE);
}

async function callResend({ method = 'POST', path, body }) {
  return fetchJson(`${API_BASE}/proxy/resend${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const resend = {
  /**
   * Send one email. Real-only — throws if the proxy/key isn't available
   * so the mailer can try the next provider.
   * @returns {{ id: string }}
   */
  async sendRaw({ to, from, subject, body, reply_to }) {
    const resp = await callResend({
      path: '/emails',
      body: {
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        text: body,
        ...(reply_to ? { reply_to } : {}),
      },
    });
    return { id: resp.id };
  },

  /** Status ping for /admin/integrations — lists verified domains. */
  async ping() {
    return realOrStub({
      scope: 'resend',
      label: 'ping',
      predicate: viaBackendProxy,
      real: async () => {
        const r = await callResend({ method: 'GET', path: '/domains' });
        const domains = r?.data || r || [];
        return { domains: Array.isArray(domains) ? domains.length : 0 };
      },
      stub: async () => ({ stub: true }),
    });
  },

  __isConfigured: viaBackendProxy,
};
