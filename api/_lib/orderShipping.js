import crypto from 'node:crypto';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}
function number(value) { return Number(value) || 0; }

export function buildLabelRequest({ order, address, items = [], now = new Date() } = {}) {
  if (!order) return { ok: false, reason: 'order_not_found' };
  if (!['paid', 'terms_approved'].includes(order.payment_status)) return { ok: false, reason: 'payment_not_released' };
  if (order.status !== 'inventory_reserved') return { ok: false, reason: 'inventory_not_reserved' };
  if (!address || address.id !== order.ship_to_address_id) return { ok: false, reason: 'shipping_address_not_found' };
  if (!items.length) return { ok: false, reason: 'order_lines_required' };
  const service = order.ship_method || 'fedex_ground';
  const carrier = service.startsWith('ups') ? 'ups' : service.startsWith('usps') ? 'stamps_com' : 'fedex';
  const weight = Math.max(2, items.reduce((sum, item) => sum + number(item.qty) * 0.6, 0));
  const shipDate = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
  return {
    ok: true,
    provider_reference: order.id,
    body: {
      carrierCode: carrier,
      serviceCode: service,
      packageCode: 'package',
      confirmation: 'delivery',
      shipDate,
      weight: { value: +weight.toFixed(1), units: 'pounds' },
      shipFrom: {
        name: 'Unite Medical', company: 'Unite Medical', street1: '1487 Trae Lane',
        city: 'Lithia Springs', state: 'GA', postalCode: '30122', country: 'US',
      },
      shipTo: {
        name: address.recipient || address.label || order.customer_name,
        company: address.company || order.customer_name,
        street1: address.line1,
        ...(address.line2 ? { street2: address.line2 } : {}),
        city: address.city, state: address.state, postalCode: address.zip,
        country: address.country || 'US',
      },
      testLabel: false,
    },
  };
}

export function applyLabelEvidence({ order, request, provider, now = new Date() } = {}) {
  if (!order || !request?.ok) return { ok: false, reason: 'label_request_invalid' };
  if (!provider?.shipmentId || !provider?.trackingNumber || !provider?.labelData) return { ok: false, reason: 'provider_label_evidence_required' };
  const createdAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const shipment = {
    id: `shp_${order.id}`, order_id: order.id,
    provider: 'shipstation', provider_shipment_id: String(provider.shipmentId),
    carrier: request.body.carrierCode, service: request.body.serviceCode,
    tracking_number: provider.trackingNumber,
    label_data_base64: provider.labelData,
    label_url: `data:application/pdf;base64,${provider.labelData}`,
    label_cost: number(provider.shipmentCost),
    status: 'label_created', created_at: createdAt,
    events: [{ ts: createdAt, kind: 'label_created' }],
  };
  return {
    ok: true,
    shipment,
    order: {
      ...order, status: 'ready_to_ship',
      tracking_number: shipment.tracking_number,
      carrier: shipment.carrier,
      label_created_at: createdAt,
      fulfillment_revision: number(order.fulfillment_revision) + 1,
      updated_at: createdAt,
    },
  };
}

async function getRow(sql, table, id) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${String(id)} AND deleted=false LIMIT 1`;
  return rows[0]?.data || null;
}
async function rowsWhere(sql, table, field, value) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false AND data->>${field}=${String(value)}`;
  return rows.map((row) => row.data);
}
async function upsert(sql, table, row) {
  await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
    VALUES (${table},${String(row.id)},${JSON.stringify(row)}::jsonb,false,now())
    ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()`;
}

async function shipstationLabel(body, { fetchImpl = fetch } = {}) {
  const key = process.env.SHIPSTATION_API_KEY;
  const secret = process.env.SHIPSTATION_API_SECRET;
  if (!key || !secret) return { ok: false, reason: 'shipstation_not_configured' };
  try {
    const response = await fetchImpl('https://ssapi.shipstation.com/shipments/createlabel', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64'),
        'Content-Type': 'application/json', Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(async () => ({ message: await response.text() }));
    if (!response.ok) return { ok: false, reason: 'shipstation_label_failed', status: response.status, detail: payload.message };
    return { ok: true, provider: payload };
  } catch (error) {
    return { ok: false, reason: 'shipstation_unreachable', detail: error.message };
  }
}

export async function createOrderLabel(sql, orderId, { actorId = 'system', fetchImpl = fetch } = {}) {
  const existingShipment = (await rowsWhere(sql, 'shipments', 'order_id', orderId))[0];
  if (existingShipment?.status === 'label_created' || existingShipment?.status === 'shipped') {
    return { ok: true, idempotent: true, shipment: existingShipment, order: await getRow(sql, 'orders', orderId) };
  }
  const order = await getRow(sql, 'orders', orderId);
  const items = await rowsWhere(sql, 'order_items', 'order_id', orderId);
  const address = order?.ship_to_address_id ? await getRow(sql, 'addresses', order.ship_to_address_id) : null;
  const request = buildLabelRequest({ order, address, items });
  if (!request.ok) return request;

  const operationId = stableId('labelop', orderId);
  const previous = await getRow(sql, 'label_operations', operationId);
  if (previous?.status === 'processing') return { ok: false, reason: 'label_reconciliation_required' };
  const nonce = crypto.randomBytes(16).toString('hex');
  const operation = {
    id: operationId, order_id: orderId, provider: 'shipstation',
    provider_reference: request.provider_reference,
    status: 'processing', processing_nonce: nonce,
    attempt_count: number(previous?.attempt_count) + 1,
    started_at: new Date().toISOString(), actor_id: actorId,
  };
  if (!previous) {
    const acquired = await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      VALUES ('label_operations',${operation.id},${JSON.stringify(operation)}::jsonb,false,now())
      ON CONFLICT (tbl,id) DO NOTHING RETURNING id`;
    if (!acquired.length) return { ok: false, reason: 'label_operation_busy' };
  } else {
    const acquired = await sql`UPDATE um_rows SET data=${JSON.stringify(operation)}::jsonb,updated_at=now()
      WHERE tbl='label_operations' AND id=${operation.id} AND deleted=false AND data->>'status'='failed'
      RETURNING id`;
    if (!acquired.length) return { ok: false, reason: 'label_reconciliation_required' };
  }

  const provider = await shipstationLabel(request.body, { fetchImpl });
  if (!provider.ok) {
    await upsert(sql, 'label_operations', { ...operation, status: 'failed', error: provider.reason, failed_at: new Date().toISOString() });
    return provider;
  }
  const applied = applyLabelEvidence({ order, request, provider: provider.provider });
  if (!applied.ok) {
    await upsert(sql, 'label_operations', { ...operation, status: 'provider_unknown', error: applied.reason });
    return applied;
  }
  const completedOperation = {
    ...operation, status: 'completed', completed_at: new Date().toISOString(),
    provider_shipment_id: applied.shipment.provider_shipment_id,
    tracking_number: applied.shipment.tracking_number,
  };
  const audit = {
    id: stableId('aud', `${orderId}:label_created`), kind: 'order.label_created',
    ref_id: orderId, actor_id: actorId,
    payload: { shipment_id: applied.shipment.id, provider_shipment_id: applied.shipment.provider_shipment_id },
    created_at: completedOperation.completed_at,
  };
  const results = await sql.transaction((txn) => [
    txn`UPDATE um_rows SET data=${JSON.stringify(applied.order)}::jsonb,updated_at=now()
      WHERE tbl='orders' AND id=${orderId} AND deleted=false AND data->>'status'='inventory_reserved'
        AND COALESCE((data->>'fulfillment_revision')::int,0)=${number(order.fulfillment_revision)}
        AND EXISTS (SELECT 1 FROM um_rows op WHERE op.tbl='label_operations' AND op.id=${operation.id} AND op.data->>'processing_nonce'=${nonce})
      RETURNING id`,
    txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      SELECT 'shipments',${applied.shipment.id},${JSON.stringify(applied.shipment)}::jsonb,false,now()
      WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'status'='ready_to_ship')
      ON CONFLICT (tbl,id) DO NOTHING`,
    txn`UPDATE um_rows SET data=${JSON.stringify(completedOperation)}::jsonb,updated_at=now()
      WHERE tbl='label_operations' AND id=${operation.id} AND data->>'processing_nonce'=${nonce}`,
    txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
      WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'status'='ready_to_ship')
      ON CONFLICT (tbl,id) DO NOTHING`,
  ]);
  if (!results[0]?.length) {
    await upsert(sql, 'label_operations', { ...operation, status: 'provider_unknown', error: 'order_state_changed_after_provider_success' });
    return { ok: false, reason: 'label_reconciliation_required' };
  }
  return applied;
}
