function triggerName(value) {
  return String(value || 'unite_transactional').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unite_transactional';
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendCustomerIoTransactional({
  to,
  transactional_message_id,
  subject,
  body,
  from = 'support@unitemedical.net',
  message_data = {},
  idempotency_key = null,
}) {
  const key = process.env.CUSTOMERIO_APP_API_KEY;
  if (!key) return { ok: false, reason: 'customerio_not_configured' };
  const base = process.env.CUSTOMERIO_REGION === 'eu' ? 'https://api-eu.customer.io' : 'https://api.customer.io';
  try {
    const response = await fetch(`${base}/v1/send/email`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(idempotency_key ? { 'Idempotency-Key': String(idempotency_key) } : {}),
      },
      body: JSON.stringify({
        transactional_message_id: triggerName(transactional_message_id),
        auto_create: true,
        identifiers: { email: String(to).trim().toLowerCase() },
        to,
        from,
        subject,
        body_plain: body,
        body: `<div style="white-space:pre-wrap">${escapeHtml(body)}</div>`,
        message_data,
        send_to_unsubscribed: true,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, reason: 'customerio_send_failed', status: response.status };
    return { ok: true, provider: 'customerio', provider_message_id: payload.delivery_id || payload.id || payload.message_id || null };
  } catch (error) {
    return { ok: false, reason: 'customerio_unreachable', detail: error.message };
  }
}
