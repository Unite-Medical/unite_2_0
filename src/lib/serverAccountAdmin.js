import { db } from './db.js';

export async function updateOrganizationPolicy(organizationId, patch) {
  const response = await fetch('/api/admin/organizations', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organization_id: organizationId, patch }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'organization_update_failed');
  db.applyRemoteSnapshot({ organizations: [body.organization] });
  return body.organization;
}

export async function updateAccountPaymentMethod(organizationId, method, action, creditLimit = null) {
  const response = await fetch('/api/admin/payment-methods', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organization_id: organizationId, method, action, credit_limit: creditLimit }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'payment_method_update_failed');
  db.applyRemoteSnapshot({ account_payment_methods: [body.payment_method] });
  return body.payment_method;
}

export async function updateContractPrice(organizationId, productSku, action, fields = {}) {
  const response = await fetch('/api/admin/contract-prices', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organization_id: organizationId, product_sku: productSku, action, ...fields }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'contract_price_update_failed');
    error.minimum_price = body.minimum_price;
    throw error;
  }
  db.applyRemoteSnapshot({ customer_contract_prices: [body.contract_price] });
  return body.contract_price;
}

export async function updateNotificationRecipient(organizationId, email, action, events) {
  const response = await fetch('/api/admin/notification-recipients', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organization_id: organizationId, email, action, events }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'notification_recipient_update_failed');
  db.applyRemoteSnapshot({ account_notification_recipients: [body.recipient] });
  return body.recipient;
}

export async function updateRepGrant(repId, grant, action, maxDiscountPct = null) {
  const response = await fetch('/api/admin/rep-grants', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rep_id: repId, grant, action, max_discount_pct: maxDiscountPct }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'rep_grant_update_failed');
  db.applyRemoteSnapshot({ rep_order_grants: [body.grant] });
  return body.grant;
}
