/**
 * Gmail API client — PRD-05 (brief §5 "Central Team Brain").
 *
 * Docs: https://developers.google.com/gmail/api/reference/rest
 *
 * Auth: Google OAuth 2.0 refresh token held server-side
 * (GOOGLE_REFRESH_TOKEN via /api/auth/google/connect). The browser
 * calls `${API_BASE}/proxy/gmail/*` and the proxy mints access tokens.
 *
 * Endpoints used:
 *   POST /gmail/v1/users/me/messages/send      (RFC 2822, base64url)
 *   GET  /gmail/v1/users/me/messages?q=...     (inbox intelligence)
 *   GET  /gmail/v1/users/me/messages/{id}
 *
 * Every outbound message is mirrored into the local `gmail_outbox`
 * table regardless of transport so /admin pages render one queue:
 * status 'sent' when the real API accepted it, 'queued' in stub mode.
 */

import { db } from '../db.js';
import { uid, delay } from '../format.js';
import { API_BASE, fetchJson, realOrStub } from './_http.js';

function viaBackendProxy() {
  return Boolean(API_BASE);
}

async function callGmail({ method = 'GET', path, body }) {
  return fetchJson(`${API_BASE}/proxy/gmail${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Build an RFC 2822 message and base64url-encode it (Gmail's `raw`). */
function toRaw({ to, from, subject, body }) {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].join('\r\n');
  const bytes = new TextEncoder().encode(message);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function mirrorOutbox({ to, from, subject, body, template_key, drafted_by, status, gmail_message_id }) {
  return db.insert('gmail_outbox', {
    id: `gm_${uid().slice(3)}`,
    to_address: to,
    from_address: from,
    subject,
    body,
    body_format: 'text',
    status,
    drafted_by,
    template_key,
    gmail_message_id: gmail_message_id || null,
    created_at: new Date().toISOString(),
  });
}

export const gmail = {
  /** Send a transactional email. Falls back to the local outbox queue. */
  async send({ to, subject, body, from = 'sales@unitemedical.net', template_key, drafted_by = 'human' }) {
    return realOrStub({
      scope: 'gmail',
      label: `send(${to})`,
      predicate: () => viaBackendProxy(),
      real: async () => {
        const resp = await callGmail({
          method: 'POST',
          path: '/gmail/v1/users/me/messages/send',
          body: { raw: toRaw({ to, from, subject, body }) },
        });
        return mirrorOutbox({ to, from, subject, body, template_key, drafted_by, status: 'sent', gmail_message_id: resp.id });
      },
      stub: async () => {
        await delay(160, 320);
        return mirrorOutbox({ to, from, subject, body, template_key, drafted_by, status: 'queued' });
      },
    });
  },

  /** Search the operational inbox (order notifications, vendor replies). */
  async listInbox({ q = 'in:inbox is:unread', limit = 10 } = {}) {
    return realOrStub({
      scope: 'gmail',
      label: 'listInbox',
      predicate: () => viaBackendProxy(),
      real: async () => {
        const resp = await callGmail({ path: `/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${limit}` });
        return resp.messages || [];
      },
      stub: async () => {
        await delay(140, 280);
        // The outbox doubles as a believable inbox sample in stub mode.
        return db.list('gmail_outbox', { orderBy: 'created_at', dir: 'desc', limit })
          .map((m) => ({ id: m.id, threadId: m.id, snippet: m.subject, stub: true }));
      },
    });
  },

  /** Fetch one message with headers + body. */
  async getMessage(id) {
    return realOrStub({
      scope: 'gmail',
      label: `getMessage(${id})`,
      predicate: () => viaBackendProxy(),
      real: async () => callGmail({ path: `/gmail/v1/users/me/messages/${id}?format=full` }),
      stub: async () => {
        await delay(120, 240);
        const m = db.get('gmail_outbox', id);
        return m ? { id, snippet: m.subject, payload: { body: { data: m.body } }, stub: true } : null;
      },
    });
  },

  __isConfigured: () => viaBackendProxy(),
};
