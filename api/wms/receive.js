/** Server-authoritative PO receiving. */
import crypto from 'node:crypto';
import { handleWmsRoute } from '../_lib/wms.js';
import {
  isNotApplicable,
  trackingPolicyForProduct,
  validateTrackingCapture,
} from '../../src/lib/productTracking.js';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}
function number(value) { return Number(value) || 0; }

export function validateReceiveBody(body = {}) {
  if (!body.warehouse_id) return { ok: false, reason: 'missing_warehouse_id' };
  if (body.ref_type !== 'purchase_order' || !body.ref_id) return { ok: false, reason: 'po_required' };
  if (Array.isArray(body.lines)) {
    if (!body.lines.length) return { ok: false, reason: 'no_lines' };
    if (!/^[A-Za-z0-9_-]{12,128}$/.test(String(body.idempotency_key || ''))) return { ok: false, reason: 'idempotency_key_required' };
    return { ok: true, lines: body.lines };
  }
  const qty = Number(body.qty);
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'invalid_qty' };
  if (!body.sku) return { ok: false, reason: 'missing_sku' };
  return { ok: true, qty };
}

export function validateReceiveAgainstPurchaseOrder(po, body = {}, product = {}, actorId = body.actor_id) {
  if (!po) return { ok: false, reason: 'po_not_found' };
  if (po.po_type === 'consignment_settlement' || !['sent', 'partial'].includes(po.status)) return { ok: false, reason: 'po_not_receivable' };
  const line = (po.line_items || []).find((candidate) => candidate.sku === body.sku);
  if (!line) return { ok: false, reason: 'sku_not_on_po', sku: body.sku };
  const policy = trackingPolicyForProduct(product);
  const tracking = validateTrackingCapture(body.sku, policy, { ...body, actor_id: actorId });
  if (!tracking.ok) return tracking;
  const accepted = number(line.accepted_qty ?? line.received_qty);
  const remaining = Math.max(0, number(line.qty) - accepted);
  if (Number(body.qty) > remaining) return { ok: false, reason: 'overage_requires_manager', sku: body.sku, remaining };
  return { ok: true, line, remaining, policy };
}

export function planPurchaseOrderReceipt({ po, products = [], body = {}, session, now = new Date() } = {}) {
  const bodyValidation = validateReceiveBody(body);
  if (!bodyValidation.ok) return bodyValidation;
  if (!session?.user_id || !['admin', 'warehouse_manager', 'warehouse_operator'].includes(session.role)) {
    return { ok: false, reason: 'receiver_session_required' };
  }
  if (!po) return { ok: false, reason: 'po_not_found' };
  if (po.po_type === 'consignment_settlement' || !['sent', 'partial'].includes(po.status)) return { ok: false, reason: 'po_not_receivable' };
  if (po.ap_posting_lock) return { ok: false, reason: 'purchase_order_ap_locked' };
  const ownerType = po.inventory_owner_type || po.owner_type || (po.po_type === 'consignment_inbound' ? 'distributor' : 'unite');
  const ownerOrgId = po.inventory_owner_org_id || po.owner_org_id || null;
  if (!['unite', 'distributor'].includes(ownerType)) return { ok: false, reason: 'invalid_inventory_owner' };
  if (ownerType === 'distributor' && !ownerOrgId) return { ok: false, reason: 'inventory_owner_required' };
  const claimedOwnerType = body.inventory_owner_type || body.owner_type || null;
  const claimedOwnerOrgId = body.inventory_owner_org_id || body.owner_org_id || null;
  if ((claimedOwnerType && claimedOwnerType !== ownerType) || (claimedOwnerOrgId && claimedOwnerOrgId !== ownerOrgId)) {
    return { ok: false, reason: 'inventory_owner_mismatch' };
  }
  const inputLines = Array.isArray(body.lines) ? body.lines : [body];
  const actorId = session.user_id;
  const totalsBySku = new Map();
  const validated = [];

  for (const raw of inputLines) {
    const line = { ...raw, sku: String(raw?.sku || '').trim(), qty: Number(raw?.qty) };
    if (!line.sku) return { ok: false, reason: 'missing_sku' };
    if (!Number.isInteger(line.qty) || line.qty <= 0) return { ok: false, reason: 'invalid_qty', sku: line.sku };
    const product = products.find((candidate) => candidate.sku === line.sku || candidate.id === line.sku);
    if (!product) return { ok: false, reason: 'product_not_found', sku: line.sku };
    const result = validateReceiveAgainstPurchaseOrder(po, line, product, actorId);
    if (!result.ok && result.reason !== 'overage_requires_manager') return result;
    totalsBySku.set(line.sku, (totalsBySku.get(line.sku) || 0) + line.qty);
    validated.push({ input: line, product, po_line: result.line, policy: result.policy });
  }

  for (const [sku, quantity] of totalsBySku) {
    const poLine = (po.line_items || []).find((line) => line.sku === sku);
    const accepted = number(poLine?.accepted_qty ?? poLine?.received_qty);
    const remaining = Math.max(0, number(poLine?.qty) - accepted);
    if (quantity > remaining) return { ok: false, reason: 'overage_requires_manager', sku, remaining };
  }

  const occurredAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const receiptId = stableId('receipt', `${po.id}:${body.idempotency_key}`);
  const receivedBySku = new Map(totalsBySku);
  const updatedLines = (po.line_items || []).map((line) => {
    const receivedNow = receivedBySku.get(line.sku) || 0;
    const acceptedQty = number(line.accepted_qty ?? line.received_qty) + receivedNow;
    return {
      ...line,
      received_qty: acceptedQty,
      accepted_qty: acceptedQty,
      vendor_backorder_qty: Math.max(0, number(line.qty) - acceptedQty),
      billable_qty: Math.max(0, acceptedQty - number(line.billed_qty)),
      last_received_at: receivedNow ? occurredAt : line.last_received_at || null,
    };
  });
  const fullyReceived = updatedLines.every((line) => number(line.accepted_qty) >= number(line.qty));
  const receiptToken = stableId('receive_token', `${receiptId}:${occurredAt}`);
  const updatedPo = {
    ...po,
    line_items: updatedLines,
    status: fullyReceived ? 'received' : 'partial',
    receiving_revision: number(po.receiving_revision) + 1,
    last_receipt_id: receiptId,
    last_receipt_token: receiptToken,
    last_received_at: occurredAt,
    received_at: fullyReceived ? occurredAt : po.received_at || null,
    updated_at: occurredAt,
  };

  const lots = [];
  const movements = [];
  const scanEvents = [];
  validated.forEach(({ input, po_line: poLine }, index) => {
    const lotNumber = String(input.lot_number).trim();
    const expirationNotApplicable = isNotApplicable(input.expiration_date);
    const normalizedExpiration = expirationNotApplicable ? null : String(input.expiration_date).trim();
    const attestation = (isNotApplicable(lotNumber) || expirationNotApplicable) ? {
      actor_id: actorId,
      capture_method: input.capture_method,
      reason: input.not_applicable_reason,
      attested_at: occurredAt,
    } : null;
    const lotId = stableId('lot', `${input.sku}:${ownerType}:${ownerOrgId || 'unite'}:${body.warehouse_id}:${lotNumber}:${normalizedExpiration || 'NA'}`);
    lots.push({
      id: lotId, product_sku: input.sku, lot_number: lotNumber,
      expiration_date: normalizedExpiration,
      expiration_not_applicable: expirationNotApplicable,
      traceability_attestation: attestation,
      warehouse_id: body.warehouse_id,
      owner_type: ownerType,
      owner_org_id: ownerOrgId,
      bin_id: input.bin_id || null,
      qty_received: input.qty,
      qty_remaining: input.qty,
      unit_cost: number(poLine.cost),
      received_at: occurredAt,
      received_from_shipment: po.id,
      received_by: actorId,
    });
    movements.push({
      id: `${receiptId}-movement-${index + 1}`,
      occurred_at: occurredAt,
      product_sku: input.sku,
      sku: input.sku,
      warehouse_id: body.warehouse_id,
      owner_type: ownerType,
      owner_org_id: ownerOrgId,
      bin_id: input.bin_id || null,
      lot_id: lotId,
      qty_delta: input.qty,
      reason: 'receipt',
      ref_type: 'purchase_order',
      ref_id: po.id,
      unit_cost: number(poLine.cost),
      actor_id: actorId,
      idempotency_key: `${body.idempotency_key}:${index + 1}`,
      note: `Receive lot ${lotNumber}`,
    });
    scanEvents.push({
      id: `${receiptId}-scan-${index + 1}`,
      kind: 'receive',
      inventory_lot_id: lotId,
      ref_type: 'purchase_order',
      ref_id: po.id,
      raw_barcode: input.raw_barcode || input.resolution?.raw || null,
      parsed: {
        gtin: input.gtin || input.resolution?.gtin || null,
        lot: lotNumber,
        expiration: normalizedExpiration,
        sku: input.sku,
        owner_type: ownerType,
        owner_org_id: ownerOrgId,
      },
      capture_method: input.capture_method || input.resolution?.capture_method || 'manual',
      matched: input.matched ?? input.resolution?.matched ?? true,
      qty: input.qty,
      scanned_by: actorId,
      station: body.station || 'RECV-1',
      scanned_at: occurredAt,
    });
  });

  const receipt = {
    id: receiptId,
    po_id: po.id,
    warehouse_id: body.warehouse_id,
    owner_type: ownerType,
    owner_org_id: ownerOrgId,
    status: 'accepted',
    idempotency_key: body.idempotency_key,
    lines: movements.map((movement) => ({
      sku: movement.sku, qty: movement.qty_delta, lot_id: movement.lot_id,
      unit_cost: movement.unit_cost,
    })),
    received_by: actorId,
    received_at: occurredAt,
  };
  return {
    ok: true,
    receipt,
    updated_po: updatedPo,
    expected_revision: number(po.receiving_revision),
    receipt_token: receiptToken,
    lots,
    movements,
    scan_events: scanEvents,
    received: movements.reduce((sum, movement) => sum + movement.qty_delta, 0),
  };
}

export default function handler(req, res) {
  return handleWmsRoute(req, res, async (sql, body, session) => {
    if (!session) return { ok: false, reason: 'receiver_session_required' };
    const bodyValidation = validateReceiveBody(body);
    if (!bodyValidation.ok) return bodyValidation;
    const duplicateRows = await sql`SELECT data FROM um_rows WHERE tbl='po_receipts' AND deleted=false AND data->>'idempotency_key'=${String(body.idempotency_key)} LIMIT 1`;
    if (duplicateRows[0]?.data) return { ok: true, duplicate: true, receipt: duplicateRows[0].data };
    const poRows = await sql`SELECT data FROM um_rows WHERE tbl='purchase_orders' AND id=${String(body.ref_id)} AND deleted=false LIMIT 1`;
    const productRows = await sql`SELECT data FROM um_rows WHERE tbl='products' AND deleted=false`;
    const plan = planPurchaseOrderReceipt({ po: poRows[0]?.data || null, products: productRows.map((row) => row.data), body, session });
    if (!plan.ok) return plan;

    const nonce = crypto.randomBytes(16).toString('hex');
    const lock = { id: plan.receipt.id, nonce, created_at: new Date().toISOString() };
    const audit = {
      id: stableId('aud', plan.receipt.id), kind: 'wms.receipt', ref_id: plan.receipt.id,
      actor_id: session.user_id,
      payload: { po_id: plan.updated_po.id, received: plan.received, movement_ids: plan.movements.map((movement) => movement.id) },
    };
    const results = await sql.transaction((txn) => {
      const queries = [
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('receipt_locks',${plan.receipt.id},${JSON.stringify(lock)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING`,
        txn`UPDATE um_rows SET data=${JSON.stringify(plan.updated_po)}::jsonb,updated_at=now() WHERE tbl='purchase_orders' AND id=${plan.updated_po.id} AND deleted=false AND COALESCE((data->>'receiving_revision')::int,0)=${plan.expected_revision} AND (data->'ap_posting_lock' IS NULL OR data->'ap_posting_lock'='null'::jsonb) AND EXISTS (SELECT 1 FROM um_rows WHERE tbl='receipt_locks' AND id=${plan.receipt.id} AND deleted=false AND data->>'nonce'=${nonce}) RETURNING id`,
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'po_receipts',${plan.receipt.id},${JSON.stringify(plan.receipt)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='receipt_locks' AND id=${plan.receipt.id} AND deleted=false AND data->>'nonce'=${nonce}) AND EXISTS (SELECT 1 FROM um_rows WHERE tbl='purchase_orders' AND id=${plan.updated_po.id} AND data->>'last_receipt_token'=${plan.receipt_token}) ON CONFLICT (tbl,id) DO NOTHING`,
      ];
      plan.lots.forEach((lot) => {
        queries.push(txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'lots',${lot.id},${JSON.stringify(lot)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='receipt_locks' AND id=${plan.receipt.id} AND deleted=false AND data->>'nonce'=${nonce}) AND EXISTS (SELECT 1 FROM um_rows WHERE tbl='purchase_orders' AND id=${plan.updated_po.id} AND data->>'last_receipt_token'=${plan.receipt_token}) ON CONFLICT (tbl,id) DO UPDATE SET data=jsonb_set(jsonb_set(um_rows.data,'{qty_received}',to_jsonb(COALESCE((um_rows.data->>'qty_received')::numeric,0)+${lot.qty_received})),'{qty_remaining}',to_jsonb(COALESCE((um_rows.data->>'qty_remaining')::numeric,0)+${lot.qty_remaining})),updated_at=now()`);
      });
      plan.movements.forEach((movement) => {
        const inventoryId = movement.owner_type === 'distributor'
          ? stableId('inv', `${movement.sku}:${movement.warehouse_id}:distributor:${movement.owner_org_id}`)
          : `inv_${String(movement.warehouse_id).replace(/^wh_/, '')}_${movement.sku}`;
        const inventory = {
          id: inventoryId, sku: movement.sku, warehouse_id: movement.warehouse_id,
          owner_type: movement.owner_type || 'unite', owner_org_id: movement.owner_org_id || null,
          on_hand: movement.qty_delta, reserved: 0, reorder_at: 0, reorder_qty: 0,
        };
        queries.push(txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'stock_movements',${movement.id},${JSON.stringify(movement)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='receipt_locks' AND id=${plan.receipt.id} AND deleted=false AND data->>'nonce'=${nonce}) AND EXISTS (SELECT 1 FROM um_rows WHERE tbl='purchase_orders' AND id=${plan.updated_po.id} AND data->>'last_receipt_token'=${plan.receipt_token}) ON CONFLICT (tbl,id) DO NOTHING`);
        queries.push(txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'inventory',${inventoryId},${JSON.stringify(inventory)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='receipt_locks' AND id=${plan.receipt.id} AND deleted=false AND data->>'nonce'=${nonce}) AND EXISTS (SELECT 1 FROM um_rows WHERE tbl='purchase_orders' AND id=${plan.updated_po.id} AND data->>'last_receipt_token'=${plan.receipt_token}) ON CONFLICT (tbl,id) DO UPDATE SET data=jsonb_set(um_rows.data,'{on_hand}',to_jsonb(COALESCE((um_rows.data->>'on_hand')::numeric,0)+${movement.qty_delta})),updated_at=now()`);
      });
      plan.scan_events.forEach((event) => {
        queries.push(txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'scan_events',${event.id},${JSON.stringify(event)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='receipt_locks' AND id=${plan.receipt.id} AND deleted=false AND data->>'nonce'=${nonce}) AND EXISTS (SELECT 1 FROM um_rows WHERE tbl='purchase_orders' AND id=${plan.updated_po.id} AND data->>'last_receipt_token'=${plan.receipt_token}) ON CONFLICT (tbl,id) DO NOTHING`);
      });
      queries.push(txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='receipt_locks' AND id=${plan.receipt.id} AND deleted=false AND data->>'nonce'=${nonce}) AND EXISTS (SELECT 1 FROM um_rows WHERE tbl='purchase_orders' AND id=${plan.updated_po.id} AND data->>'last_receipt_token'=${plan.receipt_token}) ON CONFLICT (tbl,id) DO NOTHING`);
      return queries;
    });
    if (!results[1]?.length) {
      await sql`DELETE FROM um_rows WHERE tbl='receipt_locks' AND id=${plan.receipt.id} AND data->>'nonce'=${nonce}`;
      return { ok: false, reason: 'purchase_order_changed_retry' };
    }
    const inventoryRows = await sql`SELECT data FROM um_rows WHERE tbl='inventory' AND deleted=false AND data->>'warehouse_id'=${String(body.warehouse_id)}`;
    const receivedSkus = new Set(plan.movements.map((movement) => movement.sku));
    return {
      ok: true,
      receipt: plan.receipt,
      received: plan.received,
      po_status: plan.updated_po.status,
      events: plan.scan_events.length,
      updated_po: plan.updated_po,
      lots: plan.lots,
      movements: plan.movements,
      scan_events: plan.scan_events,
      inventory: inventoryRows.map((row) => row.data).filter((row) => receivedSkus.has(row.sku)
        && (row.owner_type || 'unite') === plan.receipt.owner_type
        && (row.owner_org_id || null) === (plan.receipt.owner_org_id || null)),
    };
  });
}
