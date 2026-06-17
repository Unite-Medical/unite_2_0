/**
 * Transactional email — provider-agnostic sender (PRD-05).
 *
 * One `send()` used everywhere (order confirmations, invoices, dunning,
 * POs, outreach, rep statements, customer confirmations). It walks a
 * provider chain and mirrors every message into the single `gmail_outbox`
 * queue so the admin views render one timeline regardless of transport:
 *
 *   1. Resend   — primary; real key → real send
 *   2. Gmail    — fallback if the Google grant is configured
 *   3. outbox   — final fallback; message is queued ('queued') so nothing
 *                 is ever lost when no email provider is wired yet
 *
 * Because the browser never holds a secret, we don't detect provider
 * config client-side — we attempt each transport through the serverless
 * proxy in order; an unconfigured provider answers 503 and we fall to the
 * next. Set RESEND_API_KEY server-side and email goes live with no code
 * change.
 */

import { db } from './db.js';
import { uid, delay } from './format.js';
import { API_BASE } from './external/_http.js';
import { resend } from './external/resend.js';
import { gmail } from './external/gmail.js';

const PROVIDERS = [
  { name: 'resend', send: (m) => resend.sendRaw(m) },
  { name: 'gmail', send: (m) => gmail.sendRaw(m) },
];

function mirror({ to, from, subject, body, template_key, drafted_by, status, provider, message_id, error }) {
  return db.insert('gmail_outbox', {
    id: `gm_${uid().slice(3)}`,
    to_address: to,
    from_address: from,
    subject,
    body,
    body_format: 'text',
    status,
    provider,
    drafted_by,
    template_key,
    gmail_message_id: message_id || null,
    error: error || null,
    created_at: new Date().toISOString(),
  });
}

export const mailer = {
  /**
   * Send a transactional email. Never throws — always resolves to the
   * mirrored outbox row (status 'sent' or 'queued').
   */
  async send({ to, subject, body, from = 'sales@unitemedical.net', template_key, drafted_by = 'human' }) {
    let lastErr = null;
    if (API_BASE) {
      for (const p of PROVIDERS) {
        try {
          const r = await p.send({ to, from, subject, body });
          return mirror({ to, from, subject, body, template_key, drafted_by, status: 'sent', provider: p.name, message_id: r.id });
        } catch (err) {
          lastErr = err;
        }
      }
    } else {
      // Node / no proxy — queue without attempting the network.
      await delay(120, 240);
    }
    return mirror({ to, from, subject, body, template_key, drafted_by, status: 'queued', provider: 'outbox', error: lastErr?.message });
  },
};
