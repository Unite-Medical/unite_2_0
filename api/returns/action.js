import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { buildCustomerIoOutbox } from '../_lib/customerioOutbox.js';
import { readRawBody, sendJson } from '../_lib/http.js';

function number(value) { return Number(value) || 0; }
function money(value) { return +number(value).toFixed(2); }
function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`;
}
function nowIso(now) { return (now instanceof Date ? now : new Date(now)).toISOString(); }
function owner(row = {}) {
  const type = row.inventory_owner_type || row.owner_type || 'unite';
  const org = row.inventory_owner_org_id || row.owner_org_id || null;
  return { owner_type: type, owner_org_id: type === 'distributor' ? org : null };
}
function lotMetadataSellable(lot, now) {
  const blocked = new Set(['quarantined', 'quality_hold', 'recalled', 'expired', 'disposed', 'returned_to_vendor']);
  if (!lot
      || blocked.has(String(lot.status || '').toLowerCase())
      || blocked.has(String(lot.quality_status || '').toLowerCase())
      || blocked.has(String(lot.hold_status || '').toLowerCase())
      || lot.recall_case_id
      || lot.recalled === true) return false;
  if (!lot.expiration_date) return true;
  const expiry = new Date(`${lot.expiration_date}T23:59:59.999Z`);
  return !Number.isNaN(expiry.getTime()) && expiry.getTime() > now.getTime();
}

export function planRmaStateAction(rma, { action, actorId, now = new Date() } = {}) {
  if (!rma) return { ok: false, reason: 'rma_not_found' };
  const at = nowIso(now);
  const revision = Number(rma.revision || 0) + 1;
  if (action === 'approve') {
    if (rma.status !== 'requested') return { ok: false, reason: `cannot_approve_${rma.status}` };
    return { ok: true, rma: { ...rma, status: 'approved', approved_by: actorId, approved_at: at, return_label_status: 'pending_generation', revision, updated_at: at } };
  }
  if (action === 'receive') {
    if (rma.status !== 'approved') return { ok: false, reason: `cannot_receive_${rma.status}` };
    return { ok: true, rma: { ...rma, status: 'quarantined', received_by: actorId, received_at: at, inventory_state: 'quarantine', revision, updated_at: at } };
  }
  return { ok: false, reason: 'invalid_rma_action' };
}

function authoritativeAcceptedItems({ rma, requestedItems, orderItems, acceptedItems }) {
  if (!Array.isArray(acceptedItems) || !acceptedItems.length) return { ok: false, reason: 'accepted_items_required' };
  const requested = new Map();
  for (const row of requestedItems || rma.items || []) {
    const key = `${row.order_item_id || ''}|${row.sku || ''}`;
    requested.set(key, number(requested.get(key)) + number(row.qty));
  }
  const aggregated = new Map();
  for (const input of acceptedItems) {
    const sku = String(input.sku || '').trim();
    const orderItemId = input.order_item_id ? String(input.order_item_id) : null;
    const qty = number(input.qty);
    if (!sku || !Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'invalid_accepted_item' };
    const candidates = orderItems.filter((row) => row.sku === sku && (!orderItemId || row.id === orderItemId));
    if (candidates.length !== 1) return { ok: false, reason: 'order_item_reference_required', sku };
    const orderItem = candidates[0];
    const requestKey = `${orderItemId || ''}|${sku}`;
    const skuFallback = `|${sku}`;
    const allowed = requested.has(requestKey) ? requested.get(requestKey) : requested.get(skuFallback);
    if (!(allowed > 0)) return { ok: false, reason: 'item_not_requested', sku };
    const key = `${orderItem.id}|${String(input.lot_id || '')}`;
    const current = aggregated.get(key) || {
      order_item_id: orderItem.id, sku, inventory_sku: orderItem.inventory_sku || sku,
      lot_id: input.lot_id ? String(input.lot_id) : null, qty: 0,
      unit_price: money(orderItem.unit_price),
    };
    current.qty += qty;
    aggregated.set(key, current);
  }
  const items = [...aggregated.values()];
  const acceptedByRequest = new Map();
  for (const row of items) {
    const key = `${row.order_item_id}|${row.sku}`;
    acceptedByRequest.set(key, number(acceptedByRequest.get(key)) + row.qty);
    const allowed = requested.get(key) ?? requested.get(`|${row.sku}`) ?? 0;
    if (acceptedByRequest.get(key) > allowed) return { ok: false, reason: 'return_exceeds_requested_quantity', sku: row.sku };
  }
  return { ok: true, items };
}

export function planRmaInspection({
  rma, orderItems = [], genealogy = [], movements = [], lots = [], ownerLots = [], inventory = [],
  disposition, acceptedItems = [], evidence = null, actorId, actorRole, now = new Date(),
} = {}) {
  if (!rma) return { ok: false, reason: 'rma_not_found' };
  if (rma.status !== 'quarantined') return { ok: false, reason: `cannot_inspect_${rma.status}` };
  const allowed = new Set(['restock_sellable', 'quality_hold', 'expired_disposal', 'return_to_vendor', 'investigation_hold']);
  if (!allowed.has(disposition)) return { ok: false, reason: 'invalid_disposition' };
  const releases = new Set(['restock_sellable', 'expired_disposal', 'return_to_vendor']).has(disposition);
  if (releases && actorRole !== 'admin') return { ok: false, reason: 'admin_release_required' };
  if (['expired_disposal', 'return_to_vendor'].includes(disposition)
      && !String(evidence?.reference || evidence?.note || '').trim()) return { ok: false, reason: 'disposition_evidence_required' };
  const accepted = authoritativeAcceptedItems({ rma, requestedItems: rma.items, orderItems, acceptedItems });
  if (!accepted.ok) return accepted;
  const at = nowIso(now);
  const nextLots = lots.map((row) => ({ ...row }));
  const nextOwnerLots = ownerLots.map((row) => ({ ...row }));
  const nextInventory = inventory.map((row) => ({ ...row }));
  const restockMovements = [];
  const tasks = [];
  if (disposition === 'restock_sellable') {
    for (const item of accepted.items) {
      if (!item.lot_id) return { ok: false, reason: 'return_lot_genealogy_required', sku: item.sku };
      const shippedRows = genealogy.filter((row) => row.order_id === rma.order_id && row.lot_id === item.lot_id
        && (row.product_sku === item.inventory_sku || row.ordered_sku === item.sku));
      const shipped = shippedRows.reduce((sum, row) => sum + number(row.qty), 0);
      const returned = movements.filter((row) => row.ref_type === 'rma' && row.lot_id === item.lot_id && row.reason === 'return_restock')
        .reduce((sum, row) => sum + Math.max(0, number(row.qty_delta)), 0);
      if (!(shipped > 0) || returned + item.qty > shipped) return { ok: false, reason: 'return_exceeds_shipment_genealogy', sku: item.sku, lot_id: item.lot_id };
      const standardLot = nextLots.find((row) => row.id === item.lot_id);
      const ownerLot = nextOwnerLots.find((row) => row.id === item.lot_id);
      const originalLot = standardLot || ownerLot;
      if (!originalLot || !lotMetadataSellable(originalLot, now instanceof Date ? now : new Date(now))) return { ok: false, reason: 'return_lot_not_sellable', sku: item.sku, lot_id: item.lot_id };
      const shippedOwner = owner(shippedRows[0]);
      const lotOwner = owner(originalLot);
      if (shippedOwner.owner_type !== lotOwner.owner_type || shippedOwner.owner_org_id !== lotOwner.owner_org_id) return { ok: false, reason: 'return_owner_genealogy_mismatch' };
      const warehouseId = originalLot.warehouse_id;
      if (standardLot) {
        standardLot.qty_received = number(standardLot.qty_received) + item.qty;
        standardLot.qty_remaining = number(standardLot.qty_remaining) + item.qty;
        standardLot.last_returned_at = at;
      } else {
        ownerLot.qty_on_hand = number(ownerLot.qty_on_hand) + item.qty;
        ownerLot.last_returned_at = at;
      }
      let pool = nextInventory.find((row) => row.sku === item.inventory_sku && row.warehouse_id === warehouseId
        && owner(row).owner_type === lotOwner.owner_type && owner(row).owner_org_id === lotOwner.owner_org_id);
      if (!pool) {
        const key = `${item.inventory_sku}:${warehouseId}:${lotOwner.owner_type}:${lotOwner.owner_org_id || ''}`;
        pool = { id: stableId('inv', key), sku: item.inventory_sku, warehouse_id: warehouseId, on_hand: 0, reserved: 0, owner_type: lotOwner.owner_type, owner_org_id: lotOwner.owner_org_id };
        nextInventory.push(pool);
      }
      pool.on_hand = number(pool.on_hand) + item.qty;
      pool.updated_at = at;
      restockMovements.push({
        id: stableId('mov', `${rma.id}:return_restock:${item.order_item_id}:${item.lot_id}`),
        sku: item.inventory_sku, ordered_sku: item.sku, warehouse_id: warehouseId,
        owner_type: lotOwner.owner_type, owner_org_id: lotOwner.owner_org_id,
        qty_delta: item.qty, reason: 'return_restock', ref_type: 'rma', ref_id: rma.id,
        lot_id: item.lot_id, actor_id: actorId,
        idempotency_key: `rma_restock:${rma.id}:${item.order_item_id}:${item.lot_id}`, occurred_at: at,
      });
      if (lotOwner.owner_type === 'distributor') {
        tasks.push({
          id: stableId('task', `${rma.id}:${item.lot_id}:owner-settlement-review`), kind: 'owner_return_settlement_review',
          subject: `Review owner settlement adjustment for ${rma.id}`, owner_email: 'finance@unitemedical.net',
          status: 'open', ref_type: 'rma', ref_id: rma.id,
          payload: { owner_org_id: lotOwner.owner_org_id, lot_id: item.lot_id, qty: item.qty }, created_at: at,
        });
      }
    }
  }
  const merchandiseValue = money(accepted.items.reduce((sum, item) => sum + item.qty * item.unit_price, 0));
  const feeRate = rma.reason === 'discretionary' ? 0.15 : 0;
  const restockingFee = money(merchandiseValue * feeRate);
  const refundTotal = money(merchandiseValue - restockingFee);
  return {
    ok: true,
    rma: {
      ...rma, status: 'refund_pending', disposition, accepted_items: accepted.items,
      inspected_by: actorId, inspected_at: at,
      released_by: releases ? actorId : null, release_role: releases ? actorRole : null,
      released_at: releases ? at : null, disposition_evidence: evidence || null,
      inventory_state: disposition === 'restock_sellable' ? 'sellable' : disposition,
      merchandise_value: merchandiseValue, restocking_fee_rate: feeRate,
      restocking_fee: restockingFee, refund_total: refundTotal,
      revision: Number(rma.revision || 0) + 1, updated_at: at,
    },
    lots: nextLots, owner_lots: nextOwnerLots, inventory: nextInventory,
    movements: restockMovements, tasks,
  };
}

export function planRmaRefund(rma, { evidence, actorId, actorRole, now = new Date() } = {}) {
  if (!rma) return { ok: false, reason: 'rma_not_found' };
  if (rma.status !== 'refund_pending') return { ok: false, reason: `cannot_refund_${rma.status}` };
  if (!['admin', 'finance'].includes(actorRole)) return { ok: false, reason: 'finance_authority_required' };
  const reference = String(evidence?.reference || '').trim();
  const provider = String(evidence?.provider || '').trim();
  const amount = money(evidence?.amount);
  if (!reference || !['stripe', 'qbo', 'ach', 'check', 'manual_credit'].includes(provider)) return { ok: false, reason: 'refund_provider_evidence_required' };
  if (Math.abs(amount - money(rma.refund_total)) > 0.001) return { ok: false, reason: 'refund_amount_mismatch' };
  const at = nowIso(now);
  const refund = {
    id: stableId('refund', `${rma.id}:${provider}:${reference}`), rma_id: rma.id, order_id: rma.order_id,
    provider, provider_reference: reference, amount, currency: 'usd', recorded_by: actorId, recorded_at: at,
  };
  return {
    ok: true, refund,
    rma: { ...rma, status: 'refunded', refund_approved_by: actorId, refunded_at: at, refund_evidence_id: refund.id, revision: Number(rma.revision || 0) + 1, updated_at: at },
  };
}

async function allRows(sql, table, condition = null) {
  if (condition) {
    const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false AND data->>${condition.field}=${String(condition.value)}`;
    return rows.map((row) => row.data);
  }
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false`;
  return rows.map((row) => row.data);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const live = await authorizeLiveRequest(req, sql, { roles: ['admin', 'finance', 'warehouse_manager', 'warehouse_operator', 'warehouse'] });
    if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    const rmaId = String(body.rma_id || '');
    const action = String(body.action || '');
    const expectedRevision = Number(body.expected_revision);
    if (!rmaId || !action || !Number.isInteger(expectedRevision)) return sendJson(res, 400, { error: 'rma_action_and_revision_required' });
    const rows = await sql`SELECT data FROM um_rows WHERE tbl='rmas' AND id=${rmaId} AND deleted=false LIMIT 1`;
    const rma = rows[0]?.data;
    if (!rma) return sendJson(res, 404, { error: 'rma_not_found' });
    if (Number(rma.revision || 0) !== expectedRevision) return sendJson(res, 409, { error: 'rma_revision_changed' });
    const role = live.profile.role;
    if (action === 'approve' && !['admin', 'warehouse_manager'].includes(role)) return sendJson(res, 403, { error: 'return_approval_authority_required' });
    if (action === 'receive' && !['admin', 'warehouse_manager', 'warehouse_operator', 'warehouse'].includes(role)) return sendJson(res, 403, { error: 'warehouse_authority_required' });
    if (['inspect', 'record_refund'].includes(action)) {
      const [orderItems, genealogy, movements, lots, ownerLots, inventory, orders, organizations] = await Promise.all([
        allRows(sql, 'order_items', { field: 'order_id', value: rma.order_id }),
        allRows(sql, 'lot_tracking', { field: 'order_id', value: rma.order_id }),
        allRows(sql, 'stock_movements'), allRows(sql, 'lots'), allRows(sql, 'inventory_lots'),
        allRows(sql, 'inventory'), allRows(sql, 'orders', { field: 'id', value: rma.order_id }), allRows(sql, 'organizations'),
      ]);
      const plan = action === 'inspect'
        ? planRmaInspection({ rma, orderItems, genealogy, movements, lots, ownerLots, inventory, disposition: body.disposition, acceptedItems: body.accepted_items, evidence: body.disposition_evidence, actorId: live.session.user_id, actorRole: role })
        : planRmaRefund(rma, { evidence: body.refund_evidence, actorId: live.session.user_id, actorRole: role });
      if (!plan.ok) return sendJson(res, 409, { error: plan.reason });
      const nonce = crypto.randomBytes(12).toString('hex');
      plan.rma.transition_nonce = nonce;
      const audit = {
        id: stableId('aud', `${rma.id}:${expectedRevision}:${action}`), kind: `rma.${action}`, ref_id: rma.id,
        actor_id: live.session.user_id, payload: { disposition: body.disposition || null, refund_evidence_id: plan.refund?.id || null }, created_at: plan.rma.updated_at,
      };
      const order = orders[0];
      const organization = organizations.find((row) => row.id === rma.customer_id);
      const email = order?.contact_email || organization?.contact_email || rma.requested_by || null;
      const notificationArgs = action === 'record_refund' && email ? {
        idempotency_key: `rma:${rma.id}:refund:${plan.refund.id}`,
        to: email, transactional_message_id: 'return_processed', subject: `Return ${rma.id} refund processed`,
        body: `Refund for ${rma.id}: $${money(rma.refund_total).toFixed(2)}.`,
        ref_type: 'rma', ref_id: rma.id, message_data: { rma_id: rma.id, refund_total: money(rma.refund_total) },
      } : null;
      const outbox = notificationArgs ? buildCustomerIoOutbox(notificationArgs) : null;
      const queries = [
        (txn) => txn`SELECT pg_advisory_xact_lock(hashtext(${rma.id}))`,
        (txn) => txn`UPDATE um_rows SET data=${JSON.stringify(plan.rma)}::jsonb,updated_at=now()
          WHERE tbl='rmas' AND id=${rma.id} AND deleted=false AND data->>'status'=${rma.status}
            AND COALESCE((data->>'revision')::int,0)=${expectedRevision} RETURNING id`,
      ];
      if (action === 'inspect') {
        for (const movement of plan.movements) {
          const movementOwner = owner(movement);
          queries.push((txn) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
            SELECT 'stock_movements',${movement.id},${JSON.stringify(movement)}::jsonb,false,now()
            WHERE EXISTS (SELECT 1 FROM um_rows r WHERE r.tbl='rmas' AND r.id=${rma.id} AND r.data->>'transition_nonce'=${nonce})
              AND EXISTS (SELECT 1 FROM um_rows l WHERE l.tbl IN ('lots','inventory_lots') AND l.id=${movement.lot_id} AND l.deleted=false
                AND COALESCE(l.data->>'status','') NOT IN ('quarantined','quality_hold','recalled','expired','disposed','returned_to_vendor')
                AND COALESCE(l.data->>'quality_status','') NOT IN ('quarantined','quality_hold','recalled','expired','disposed','returned_to_vendor')
                AND COALESCE(l.data->>'hold_status','') NOT IN ('quarantined','quality_hold','recalled','expired','disposed','returned_to_vendor')
                AND COALESCE(l.data->>'recall_case_id','')='' AND COALESCE((l.data->>'recalled')::boolean,false)=false
                AND (l.data->>'expiration_date' IS NULL OR (l.data->>'expiration_date')::date>current_date)
                AND COALESCE(l.data->>'inventory_owner_type',l.data->>'owner_type','unite')=${movementOwner.owner_type}
                AND COALESCE(l.data->>'inventory_owner_org_id',l.data->>'owner_org_id','')=${movementOwner.owner_org_id || ''})
            ON CONFLICT (tbl,id) DO NOTHING`);
          const standardLot = lots.find((row) => row.id === movement.lot_id);
          if (standardLot) {
            queries.push((txn) => txn`UPDATE um_rows SET data=
              jsonb_set(jsonb_set(data,'{qty_remaining}',to_jsonb(COALESCE((data->>'qty_remaining')::numeric,0)+${movement.qty_delta}),true),'{qty_received}',to_jsonb(COALESCE((data->>'qty_received')::numeric,0)+${movement.qty_delta}),true)
              || ${JSON.stringify({ last_returned_at: plan.rma.updated_at })}::jsonb,updated_at=now()
              WHERE tbl='lots' AND id=${movement.lot_id} AND deleted=false
                AND COALESCE(data->>'status','') NOT IN ('quarantined','quality_hold','recalled','expired','disposed','returned_to_vendor')
                AND COALESCE(data->>'quality_status','') NOT IN ('quarantined','quality_hold','recalled','expired','disposed','returned_to_vendor')
                AND COALESCE(data->>'hold_status','') NOT IN ('quarantined','quality_hold','recalled','expired','disposed','returned_to_vendor')
                AND COALESCE(data->>'recall_case_id','')='' AND COALESCE((data->>'recalled')::boolean,false)=false
                AND EXISTS (SELECT 1 FROM um_rows r WHERE r.tbl='rmas' AND r.id=${rma.id} AND r.data->>'transition_nonce'=${nonce})
                AND EXISTS (SELECT 1 FROM um_rows m WHERE m.tbl='stock_movements' AND m.id=${movement.id})`);
          } else {
            queries.push((txn) => txn`UPDATE um_rows SET data=
              jsonb_set(data,'{qty_on_hand}',to_jsonb(COALESCE((data->>'qty_on_hand')::numeric,0)+${movement.qty_delta}),true)
              || ${JSON.stringify({ last_returned_at: plan.rma.updated_at })}::jsonb,updated_at=now()
              WHERE tbl='inventory_lots' AND id=${movement.lot_id} AND deleted=false
                AND COALESCE(data->>'status','') NOT IN ('quarantined','quality_hold','recalled','expired','disposed','returned_to_vendor')
                AND COALESCE(data->>'quality_status','') NOT IN ('quarantined','quality_hold','recalled','expired','disposed','returned_to_vendor')
                AND COALESCE(data->>'hold_status','') NOT IN ('quarantined','quality_hold','recalled','expired','disposed','returned_to_vendor')
                AND COALESCE(data->>'recall_case_id','')='' AND COALESCE((data->>'recalled')::boolean,false)=false
                AND EXISTS (SELECT 1 FROM um_rows r WHERE r.tbl='rmas' AND r.id=${rma.id} AND r.data->>'transition_nonce'=${nonce})
                AND EXISTS (SELECT 1 FROM um_rows m WHERE m.tbl='stock_movements' AND m.id=${movement.id})`);
          }
          const identity = owner(movement);
          const pool = plan.inventory.find((row) => row.sku === movement.sku && row.warehouse_id === movement.warehouse_id
            && owner(row).owner_type === identity.owner_type && owner(row).owner_org_id === identity.owner_org_id);
          queries.push((txn) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
            SELECT 'inventory',${pool.id},${JSON.stringify({ ...pool, on_hand: movement.qty_delta })}::jsonb,false,now()
            WHERE EXISTS (SELECT 1 FROM um_rows r WHERE r.tbl='rmas' AND r.id=${rma.id} AND r.data->>'transition_nonce'=${nonce})
              AND EXISTS (SELECT 1 FROM um_rows m WHERE m.tbl='stock_movements' AND m.id=${movement.id})
            ON CONFLICT (tbl,id) DO UPDATE SET data=
              jsonb_set(um_rows.data,'{on_hand}',to_jsonb(COALESCE((um_rows.data->>'on_hand')::numeric,0)+${movement.qty_delta}),true)
              || ${JSON.stringify({ updated_at: plan.rma.updated_at })}::jsonb,deleted=false,updated_at=now()`);
          queries.push((txn) => txn`SELECT CASE WHEN EXISTS (
              SELECT 1 FROM um_rows m JOIN um_rows r ON r.tbl='rmas' AND r.id=${rma.id}
              WHERE m.tbl='stock_movements' AND m.id=${movement.id} AND r.data->>'transition_nonce'=${nonce}
            ) THEN 1 ELSE 1/0 END AS restock_verified`);
        }
        for (const task of plan.tasks) queries.push((txn) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'tasks',${task.id},${JSON.stringify(task)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows r WHERE r.tbl='rmas' AND r.id=${rma.id} AND r.data->>'transition_nonce'=${nonce}) ON CONFLICT (tbl,id) DO NOTHING`);
      } else {
        queries.push((txn) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'return_refunds',${plan.refund.id},${JSON.stringify(plan.refund)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows r WHERE r.tbl='rmas' AND r.id=${rma.id} AND r.data->>'transition_nonce'=${nonce}) ON CONFLICT (tbl,id) DO NOTHING`);
        if (outbox) queries.push((txn) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'customerio_outbox',${outbox.id},${JSON.stringify(outbox)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows r WHERE r.tbl='rmas' AND r.id=${rma.id} AND r.data->>'transition_nonce'=${nonce}) ON CONFLICT (tbl,id) DO NOTHING`);
      }
      queries.push((txn) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows r WHERE r.tbl='rmas' AND r.id=${rma.id} AND r.data->>'transition_nonce'=${nonce}) ON CONFLICT (tbl,id) DO NOTHING`);
      const results = await sql.transaction((txn) => queries.map((query) => query(txn)));
      if (!results[1]?.length) return sendJson(res, 409, { error: 'rma_state_changed' });
      return sendJson(res, 200, { ok: true, rma: plan.rma, refund: plan.refund || null, notification_status: outbox ? 'queued' : null });
    }
    const plan = planRmaStateAction(rma, { action, actorId: live.session.user_id });
    if (!plan.ok) return sendJson(res, 409, { error: plan.reason });
    const audit = { id: stableId('aud', `${rma.id}:${expectedRevision}:${action}`), kind: `rma.${action}`, ref_id: rma.id, actor_id: live.session.user_id, created_at: plan.rma.updated_at };
    const results = await sql.transaction((txn) => [
      txn`UPDATE um_rows SET data=${JSON.stringify(plan.rma)}::jsonb,updated_at=now() WHERE tbl='rmas' AND id=${rma.id} AND deleted=false AND data->>'status'=${rma.status} AND COALESCE((data->>'revision')::int,0)=${expectedRevision} RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows r WHERE r.tbl='rmas' AND r.id=${rma.id} AND r.data->>'status'=${plan.rma.status}) ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!results[0]?.length) return sendJson(res, 409, { error: 'rma_state_changed' });
    return sendJson(res, 200, { ok: true, rma: plan.rma });
  } catch (error) {
    return sendJson(res, 500, { error: 'rma_action_failed', detail: error.message });
  }
}
