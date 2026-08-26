import { db } from './db.js';

export async function mutatePurchaseOrder(po, action, { reason = null } = {}) {
  const response = await fetch('/api/vendor/purchase-orders/action', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ po_id: po.id, action, expected_revision: Number(po.revision || 1), reason }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, reason: body.error || `HTTP ${response.status}` };
  if (body.purchase_order) db.applyRemoteSnapshot({ purchase_orders: [body.purchase_order] });
  return { ok: true, po: body.purchase_order };
}

export async function draftServerPurchaseOrders(source, fields = {}) {
  const response = await fetch('/api/vendor/purchase-orders/draft', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, ...fields }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, reason: body.error || `HTTP ${response.status}` };
  const snapshot = {};
  if (body.purchase_orders?.length) snapshot.purchase_orders = body.purchase_orders;
  if (body.purchase_order) snapshot.purchase_orders = [body.purchase_order];
  if (body.offer) snapshot.vendor_offers = [body.offer];
  if (body.request) snapshot.sourcing_requests = [body.request];
  if (Object.keys(snapshot).length) db.applyRemoteSnapshot(snapshot);
  return { ok: body.ok !== false, ...body };
}
