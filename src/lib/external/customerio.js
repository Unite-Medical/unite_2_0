/** Customer.io transactional email over the server-side App API proxy. */

import { API_BASE, fetchJson, realOrStub } from './_http.js';

function triggerName(value) {
  return String(value || 'unite_transactional')
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unite_transactional';
}

export function buildTransactionalEmail({
  to,
  from,
  subject,
  body,
  template_key = 'unite_transactional',
  message_data = {},
  send_to_unsubscribed = true,
}) {
  return {
    transactional_message_id: triggerName(template_key),
    auto_create: true,
    identifiers: { email: String(to).trim().toLowerCase() },
    to,
    from,
    subject,
    body_plain: body,
    body: `<div style="white-space:pre-wrap">${String(body || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`,
    message_data,
    send_to_unsubscribed,
  };
}

async function callCustomerIo({ method = 'POST', path, body }) {
  return fetchJson(`${API_BASE}/proxy/customerio${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const customerio = {
  async sendRaw({ to, from, subject, body, template_key, message_data = {} }) {
    const response = await callCustomerIo({
      path: '/v1/send/email',
      body: buildTransactionalEmail({ to, from, subject, body, template_key, message_data }),
    });
    return { id: response.delivery_id || response.id || response.message_id };
  },

  async ping() {
    return realOrStub({
      scope: 'customerio',
      label: 'ping',
      predicate: () => Boolean(API_BASE),
      real: async () => callCustomerIo({ method: 'GET', path: '/v1/transactional' }),
      stub: async () => ({ stub: true }),
    });
  },
};
