function cents(value) { return Math.round(Number(value || 0) * 100); }

async function stripePost(path, form, { stripeKey, fetchImpl, idempotencyKey }) {
  const response = await fetchImpl(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + stripeKey,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idempotencyKey,
    },
    body: new URLSearchParams(form).toString(),
  });
  const payload = await response.json().catch(async () => ({ error: { message: await response.text() } }));
  if (!response.ok) {
    const error = new Error(payload.error?.message || `Stripe request failed: ${response.status}`);
    error.code = 'stripe_request_failed';
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function createHostedOrderPayment({
  order,
  items = [],
  stripeKey = process.env.STRIPE_SECRET_KEY,
  fetchImpl = fetch,
} = {}) {
  if (!stripeKey) return { ok: false, reason: 'stripe_not_configured' };
  if (!order?.id) return { ok: false, reason: 'order_required' };
  const email = String(order.contact_email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: 'customer_email_required' };
  if (!items.length) return { ok: false, reason: 'order_lines_required' };

  try {
    const customer = await stripePost('/customers', {
      email,
      name: order.customer_name || order.customer_id,
      'metadata[organization_id]': order.customer_id,
    }, { stripeKey, fetchImpl, idempotencyKey: `organization:${order.customer_id}:customer` });

    let merchandise = 0;
    for (const [index, item] of items.entries()) {
      const amount = cents(item.ext_price ?? Number(item.qty || 0) * Number(item.unit_price || 0));
      merchandise += amount;
      await stripePost('/invoiceitems', {
        customer: customer.id,
        currency: 'usd',
        amount,
        description: `${item.name || item.sku} · ${Number(item.qty || 0)} × $${Number(item.unit_price || 0).toFixed(2)}`,
        'metadata[order_id]': order.id,
        'metadata[sku]': item.sku,
      }, { stripeKey, fetchImpl, idempotencyKey: `order:${order.id}:line:${item.id || index + 1}` });
    }
    const shippingAmount = Math.max(0, cents(order.total) - merchandise - cents(order.tax));
    if (shippingAmount > 0) {
      await stripePost('/invoiceitems', {
        customer: customer.id,
        currency: 'usd',
        amount: shippingAmount,
        description: 'Shipping',
        'metadata[order_id]': order.id,
        'metadata[sku]': 'SHIPPING',
      }, { stripeKey, fetchImpl, idempotencyKey: `order:${order.id}:shipping` });
    }

    const invoice = await stripePost('/invoices', {
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: '7',
      description: `Unite Medical order ${order.id}`,
      'metadata[order_id]': order.id,
      'metadata[organization_id]': order.customer_id,
      'payment_settings[payment_method_types][0]': 'us_bank_account',
      'payment_settings[payment_method_types][1]': 'card',
    }, { stripeKey, fetchImpl, idempotencyKey: `order:${order.id}:invoice` });
    const finalized = await stripePost(`/invoices/${encodeURIComponent(invoice.id)}/finalize`, {}, {
      stripeKey, fetchImpl, idempotencyKey: `order:${order.id}:invoice:finalize`,
    });
    const sent = await stripePost(`/invoices/${encodeURIComponent(invoice.id)}/send`, {}, {
      stripeKey, fetchImpl, idempotencyKey: `order:${order.id}:invoice:send`,
    });
    const provider = sent || finalized;
    return {
      ok: true,
      provider_customer_id: customer.id,
      provider_invoice_id: provider.id || invoice.id,
      payment_url: provider.hosted_invoice_url || finalized.hosted_invoice_url || null,
      status: provider.status || finalized.status || 'open',
    };
  } catch (error) {
    return { ok: false, reason: error.code || 'stripe_payment_request_failed', detail: error.message, status: error.status };
  }
}
