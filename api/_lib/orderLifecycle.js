import crypto from 'node:crypto';
import { buildSettlementDrafts } from './distributorSettlement.js';
import { buildCustomerIoOutbox } from './customerioOutbox.js';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}
function number(value) { return Number(value) || 0; }
function lotUsable(lot, now = new Date()) {
  const blocked = new Set(['quarantined', 'quality_hold', 'recalled', 'expired', 'disposed', 'returned_to_vendor']);
  if (!lot || blocked.has(String(lot.status || '').toLowerCase())
      || blocked.has(String(lot.quality_status || '').toLowerCase())
      || blocked.has(String(lot.hold_status || '').toLowerCase())
      || lot.recall_case_id || lot.recalled === true) return false;
  const today = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
  return !lot.expiration_date || lot.expiration_date >= today;
}

export function buildHandoffNotification({ order, shipment, organizations = [], notificationRecipients = [], now = new Date() } = {}) {
  if (!order?.id || !shipment?.handoff_reference) return { ok: false, reason: 'handoff_notification_context_required' };
  const recipientOrgId = order.blind_ship ? (order.on_behalf_of_org_id || order.customer_id) : order.customer_id;
  const recipientOrg = organizations.find((row) => row.id === recipientOrgId);
  const primary = order.blind_ship
    ? (recipientOrg?.contact_email || recipientOrg?.billing_email || null)
    : (order.contact_email || recipientOrg?.contact_email || recipientOrg?.billing_email || null);
  const recipients = [...new Set([
    primary,
    ...notificationRecipients
      .filter((row) => row.org_id === recipientOrgId && (!row.status || row.status === 'active'))
      .filter((row) => (row.events || ['order_placed', 'shipped', 'delivered', 'invoice', 'backorder']).includes('shipped'))
      .map((row) => row.email),
  ].filter(Boolean).map((email) => String(email).trim().toLowerCase()))];
  const at = (now instanceof Date ? now : new Date(now)).toISOString();
  const subject = `Order ${order.id} shipped`;
  const body = `Order ${order.id} has transferred to the carrier. Tracking: ${shipment.tracking_number || 'pending'}.`;
  const deliveries = recipients.map((to, index) => {
    const args = {
      idempotency_key: index === 0
        ? `order:${order.id}:handoff:${shipment.handoff_reference}`
        : `order:${order.id}:handoff:${shipment.handoff_reference}:recipient:${crypto.createHash('sha256').update(to).digest('hex').slice(0, 12)}`,
      to, transactional_message_id: 'order_shipped', subject, body,
      ref_type: 'order', ref_id: order.id,
      message_data: { order_id: order.id, tracking_number: shipment.tracking_number, carrier: shipment.carrier },
      now: new Date(at),
    };
    return { to, args, outbox: buildCustomerIoOutbox(args) };
  });
  const first = deliveries[0] || null;
  return {
    ok: true, to: first?.to || null, args: first?.args || null, outbox: first?.outbox || null,
    deliveries,
    legacy_outbox: {
      id: stableId('outbox', `${order.id}:shipped`), kind: 'order_shipped', provider: 'customerio',
      status: deliveries.length ? 'queued' : 'blocked', to_address: first?.to || null, recipients,
      from_address: 'support@unitemedical.net', subject, body,
      template_key: 'order_shipped', ref_type: 'order', ref_id: order.id,
      error: deliveries.length ? null : 'recipient_required', created_at: at,
    },
    task: deliveries.length ? null : {
      id: `task_tracking_${order.id}`, kind: 'tracking_recipient_required',
      subject: `Tracking recipient required · ${order.id}`, owner_email: 'ops@unitemedical.net',
      status: 'open', ref_type: 'order', ref_id: order.id,
      payload: { shipment_id: shipment.id }, created_at: at,
    },
  };
}

export function planPaidOrderRelease({ order, items = [], inventory = [], lots = [], ownerLots = [], reservations = [], now = new Date() } = {}) {
  if (!order) return { ok: false, reason: 'order_not_found' };
  const ownerOnlyNoCharge = order.distributor_flow === 'blind_ship' && order.payment_status === 'not_required' && number(order.total) === 0;
  if (!['paid', 'terms_approved'].includes(order.payment_status) && !ownerOnlyNoCharge) return { ok: false, reason: 'payment_not_released' };
  if (!items.length) return { ok: false, reason: 'order_lines_required' };
  const existing = reservations.filter((row) => row.order_id === order.id && ['held', 'committed'].includes(row.status));
  if (existing.length) {
    return { ok: true, idempotent: true, order, reservations: existing, inventory, owner_lots: ownerLots };
  }

  const workingInventory = inventory.map((row) => ({ ...row }));
  const workingOwnerLots = ownerLots.map((row) => ({ ...row }));
  const plannedReservations = [];
  const occurredAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  for (const item of items) {
    const qty = number(item.fulfillment_qty ?? item.qty);
    if (!item.sku || !Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'invalid_order_line', sku: item.sku || null };
    let remaining = qty;
    if (item.inventory_owner_type === 'distributor') {
      if (!item.inventory_owner_org_id) return { ok: false, reason: 'inventory_owner_required', sku: item.sku };
      const inventorySku = item.inventory_sku || item.sku;
      const ownerPools = workingOwnerLots
        .filter((lot) => lot.owner_org_id === item.inventory_owner_org_id
          && (lot.product_sku === inventorySku || (item.distributor_sku && lot.distributor_sku === item.distributor_sku)))
        .filter((lot) => lotUsable(lot, now))
        .sort((a, b) => String(a.expiration_date || '9999-12-31').localeCompare(String(b.expiration_date || '9999-12-31')));
      for (const lot of ownerPools) {
        if (remaining <= 0) break;
        const available = Math.max(0, number(lot.qty_on_hand) - number(lot.qty_reserved));
        const allocated = Math.min(available, remaining);
        if (allocated <= 0) continue;
        lot.qty_reserved = number(lot.qty_reserved) + allocated;
        plannedReservations.push({
          id: stableId('resv', `${order.id}:${item.id || item.sku}:${lot.id}`),
          order_id: order.id, order_item_id: item.id || null,
          customer_id: order.customer_id, sku: item.sku, ordered_sku: item.sku,
          inventory_sku: inventorySku, product_sku: inventorySku,
          distributor_sku: item.distributor_sku || lot.distributor_sku || null,
          warehouse_id: lot.warehouse_id, inventory_lot_id: lot.id,
          inventory_owner_type: 'distributor', inventory_owner_org_id: item.inventory_owner_org_id,
          distributor_flow: item.distributor_flow || order.distributor_flow,
          settlement_eligible: Boolean(item.settlement_eligible),
          qty: allocated, status: 'held', held_at: occurredAt,
        });
        remaining -= allocated;
      }
      if (remaining > 0) return { ok: false, reason: 'owner_allocation_shortfall', sku: item.sku, shortfall: remaining };
      continue;
    }
    const pools = workingInventory
      .filter((row) => row.sku === (item.inventory_sku || item.sku) && (row.owner_type || 'unite') === 'unite')
      .sort((a, b) => String(a.warehouse_id).localeCompare(String(b.warehouse_id)));
    for (const pool of pools) {
      if (remaining <= 0) break;
      const poolLots = lots.filter((lot) => lot.product_sku === (item.inventory_sku || item.sku) && lot.warehouse_id === pool.warehouse_id);
      const heldLotQty = poolLots.filter((lot) => !lotUsable(lot, now)).reduce((sum, lot) => sum + number(lot.qty_remaining), 0);
      const available = Math.max(0, number(pool.on_hand) - number(pool.reserved) - heldLotQty);
      const allocated = Math.min(available, remaining);
      if (allocated <= 0) continue;
      pool.reserved = number(pool.reserved) + allocated;
      plannedReservations.push({
        id: stableId('resv', `${order.id}:${item.id || item.sku}:${pool.id}`),
        order_id: order.id, order_item_id: item.id || null,
        customer_id: order.customer_id, sku: item.sku,
        inventory_sku: item.inventory_sku || item.sku,
        warehouse_id: pool.warehouse_id, inventory_id: pool.id,
        qty: allocated, status: 'held', held_at: occurredAt,
      });
      remaining -= allocated;
    }
    if (remaining > 0) return { ok: false, reason: 'allocation_shortfall', sku: item.sku, shortfall: remaining };
  }

  return {
    ok: true,
    order: {
      ...order, status: 'inventory_reserved',
      fulfillment_revision: number(order.fulfillment_revision) + 1,
      inventory_reserved_at: occurredAt, updated_at: occurredAt,
    },
    reservations: plannedReservations,
    inventory: workingInventory,
    owner_lots: workingOwnerLots,
  };
}

export function planOrderHandoff({
  order,
  shipment,
  reservations = [],
  inventory = [],
  lots = [],
  ownerLots = [],
  actorId,
  handoffReference,
  now = new Date(),
} = {}) {
  if (!order) return { ok: false, reason: 'order_not_found' };
  if (!shipment) return { ok: false, reason: 'shipment_not_found' };
  const actor = String(actorId || '').trim();
  const reference = String(handoffReference || '').trim();
  if (!actor) return { ok: false, reason: 'handoff_actor_required' };
  if (!reference) return { ok: false, reason: 'handoff_reference_required' };
  if (shipment.status === 'shipped') {
    if (shipment.handoff_reference && shipment.handoff_reference !== reference) return { ok: false, reason: 'handoff_already_recorded' };
    return { ok: true, idempotent: true, order, shipment, reservations, inventory, lots, owner_lots: ownerLots, movements: [], genealogy: [], consignment_movements: [], settlement_candidates: [] };
  }
  const parcelReady = shipment.status === 'label_created' && order.status === 'ready_to_ship';
  const pickupReady = shipment.status === 'pickup_ready' && shipment.mode === 'distributor_pickup' && order.status === 'ready_for_pickup';
  if (!parcelReady && !pickupReady) return { ok: false, reason: 'shipment_not_ready' };
  const held = reservations.filter((row) => row.order_id === order.id && row.status === 'held');
  if (!held.length) return { ok: false, reason: 'held_reservations_required' };
  const workingInventory = inventory.map((row) => ({ ...row }));
  const workingLots = lots.map((row) => ({ ...row }));
  const workingOwnerLots = ownerLots.map((row) => ({ ...row }));
  const handedOffAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const movements = [];
  const genealogy = [];
  const consignmentMovements = [];
  const settlementCandidates = [];
  const committedReservations = held.map((reservation) => {
    if (reservation.inventory_owner_type === 'distributor') {
      const ownerLot = workingOwnerLots.find((lot) => lot.id === reservation.inventory_lot_id
        && lot.owner_org_id === reservation.inventory_owner_org_id);
      if (!ownerLot || !lotUsable(ownerLot, now) || number(ownerLot.qty_on_hand) < number(reservation.qty)
          || number(ownerLot.qty_reserved) < number(reservation.qty)) {
        throw new Error(`owner_reservation_projection_mismatch:${reservation.id}`);
      }
      ownerLot.qty_on_hand = number(ownerLot.qty_on_hand) - number(reservation.qty);
      ownerLot.qty_reserved = number(ownerLot.qty_reserved) - number(reservation.qty);
      const sellThrough = (reservation.distributor_flow || order.distributor_flow) === 'unite_sell_through'
        && reservation.settlement_eligible === true;
      const inventorySku = reservation.inventory_sku || reservation.product_sku || ownerLot.product_sku || reservation.sku;
      const orderedSku = reservation.ordered_sku || reservation.sku;
      const movement = {
        id: stableId('cm', `${order.id}:${reference}:${reservation.id}`),
        owner_org_id: reservation.inventory_owner_org_id,
        inventory_lot_id: ownerLot.id,
        distributor_sku: reservation.distributor_sku || ownerLot.distributor_sku || null,
        product_sku: inventorySku,
        ordered_sku: orderedSku,
        qty: number(reservation.qty),
        movement: sellThrough ? 'sold_by_unite' : 'fulfilled_for_owner',
        settlement_eligible: sellThrough,
        settled: false,
        handoff_reference: reference,
        created_at: handedOffAt,
      };
      consignmentMovements.push(movement);
      genealogy.push({
        id: stableId('lottrack', `${order.id}:${reservation.id}:${ownerLot.id}`),
        lot_id: ownerLot.id, lot_number: ownerLot.lot_number || null,
        product_sku: inventorySku, ordered_sku: orderedSku, order_id: order.id,
        customer_id: order.customer_id || null,
        recipient_org_id: order.on_behalf_of_org_id || order.customer_id || null,
        owner_type: 'distributor', owner_org_id: ownerLot.owner_org_id,
        qty: number(reservation.qty), expiration_date: ownerLot.expiration_date || null,
        shipped_at: handedOffAt, shipped_by: actor,
      });
      if (sellThrough) {
        settlementCandidates.push({
          movement_id: movement.id,
          owner_org_id: movement.owner_org_id,
          inventory_lot_id: movement.inventory_lot_id,
          distributor_sku: movement.distributor_sku,
          product_sku: movement.product_sku,
          ordered_sku: movement.ordered_sku,
          qty: movement.qty,
          eligible_at: handedOffAt,
        });
      }
      return {
        ...reservation, status: 'committed', committed_at: handedOffAt,
        committed_by: actor, handoff_reference: reference,
        consignment_movement_id: movement.id,
      };
    }
    const inventorySku = reservation.inventory_sku || reservation.sku;
    const unitePool = (row) => (row.inventory_owner_type || row.owner_type || 'unite') === 'unite'
      && !(row.inventory_owner_org_id || row.owner_org_id);
    const pool = workingInventory.find((row) => row.id === reservation.inventory_id && unitePool(row))
      || workingInventory.find((row) => row.sku === inventorySku && row.warehouse_id === reservation.warehouse_id && unitePool(row));
    if (!pool || number(pool.on_hand) < number(reservation.qty) || number(pool.reserved) < number(reservation.qty)) {
      throw new Error(`reservation_projection_mismatch:${reservation.id}`);
    }
    let needed = number(reservation.qty);
    const allocations = [];
    const eligibleLots = workingLots
      .filter((lot) => lot.product_sku === inventorySku && lot.warehouse_id === reservation.warehouse_id && number(lot.qty_remaining) > 0)
      .filter((lot) => (lot.inventory_owner_type || lot.owner_type || 'unite') === 'unite'
        && !(lot.inventory_owner_org_id || lot.owner_org_id))
      .filter((lot) => lotUsable(lot, now))
      .sort((a, b) => {
        const ax = a.expiration_date || '9999-12-31';
        const bx = b.expiration_date || '9999-12-31';
        if (ax !== bx) return ax.localeCompare(bx);
        return String(a.received_at || '').localeCompare(String(b.received_at || ''));
      });
    for (const lot of eligibleLots) {
      if (needed <= 0) break;
      const take = Math.min(needed, number(lot.qty_remaining));
      if (take <= 0) continue;
      lot.qty_remaining = number(lot.qty_remaining) - take;
      allocations.push({ lot_id: lot.id, lot_number: lot.lot_number, expiration_date: lot.expiration_date || null, qty: take, inventory_sku: inventorySku, ordered_sku: reservation.sku });
      movements.push({
        id: stableId('mov', `${order.id}:${reference}:${reservation.id}:${lot.id}`),
        order_id: order.id, sku: reservation.sku, inventory_sku: inventorySku,
        warehouse_id: reservation.warehouse_id, lot_id: lot.id,
        lot_number: lot.lot_number, expiration_date: lot.expiration_date || null,
        owner_type: 'unite', owner_org_id: null,
        qty_delta: -take, reason: 'ship', ref_type: 'order', ref_id: order.id,
        actor_id: actor, handoff_reference: reference,
        idempotency_key: `handoff:${order.id}:${reference}:${reservation.id}:${lot.id}`,
        occurred_at: handedOffAt,
      });
      genealogy.push({
        id: stableId('lottrack', `${order.id}:${reservation.id}:${lot.id}`),
        lot_id: lot.id, lot_number: lot.lot_number,
        product_sku: inventorySku, ordered_sku: reservation.sku, order_id: order.id,
        customer_id: order.customer_id, qty: take,
        owner_type: 'unite', owner_org_id: null,
        expiration_date: lot.expiration_date || null,
        shipped_at: handedOffAt, shipped_by: actor,
      });
      needed -= take;
    }
    if (needed > 0) throw new Error(`lot_allocation_shortfall:${reservation.sku}:${needed}`);
    pool.on_hand = number(pool.on_hand) - number(reservation.qty);
    pool.reserved = number(pool.reserved) - number(reservation.qty);
    return {
      ...reservation, status: 'committed', committed_at: handedOffAt,
      committed_by: actor, handoff_reference: reference, lot_allocations: allocations,
    };
  });
  return {
    ok: true,
    order: {
      ...order, status: 'shipped', shipped_at: handedOffAt,
      fulfillment_revision: number(order.fulfillment_revision) + 1,
      updated_at: handedOffAt,
    },
    shipment: {
      ...shipment, status: 'shipped', handed_off_at: handedOffAt,
      handed_off_by: actor, handoff_reference: reference,
      events: [...(shipment.events || []), { ts: handedOffAt, kind: 'custody_handoff', reference }],
    },
    reservations: committedReservations,
    inventory: workingInventory,
    lots: workingLots,
    owner_lots: workingOwnerLots,
    movements,
    genealogy,
    consignment_movements: consignmentMovements,
    settlement_candidates: settlementCandidates,
  };
}

async function rowsFor(sql, table, predicate = null) {
  const rows = predicate
    ? await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false AND data @> ${JSON.stringify(predicate)}::jsonb`
    : await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false`;
  return rows.map((row) => row.data);
}

export async function releasePaidOrder(sql, orderId, { actorId = 'payment_webhook', now = new Date() } = {}) {
  const [orders, items, inventory, lots, ownerLots, reservations] = await Promise.all([
    rowsFor(sql, 'orders', { id: orderId }),
    rowsFor(sql, 'order_items', { order_id: orderId }),
    rowsFor(sql, 'inventory'),
    rowsFor(sql, 'lots'),
    rowsFor(sql, 'inventory_lots'),
    rowsFor(sql, 'reservations', { order_id: orderId }),
  ]);
  const plan = planPaidOrderRelease({ order: orders[0], items, inventory, lots, ownerLots, reservations, now });
  if (!plan.ok || plan.idempotent) return plan;
  const nonce = crypto.randomBytes(16).toString('hex');
  plan.order.release_nonce = nonce;
  plan.order.released_by = actorId;
  const inventoryIds = [...new Set(plan.reservations.map((row) => row.inventory_id).filter(Boolean))];
  const ownerLotIds = [...new Set(plan.reservations.map((row) => row.inventory_lot_id).filter(Boolean))];
  const beforeById = new Map(inventory.map((row) => [row.id, row]));
  const inventoryChecks = inventoryIds.map((id) => ({
    id, on_hand: number(beforeById.get(id)?.on_hand), reserved: number(beforeById.get(id)?.reserved),
  }));
  const ownerBefore = new Map(ownerLots.map((row) => [row.id, row]));
  const ownerChecks = ownerLotIds.map((id) => ({
    id, qty_on_hand: number(ownerBefore.get(id)?.qty_on_hand), qty_reserved: number(ownerBefore.get(id)?.qty_reserved),
  }));
  const updatedById = new Map(plan.inventory.map((row) => [row.id, row]));
  const updatedOwnerLots = new Map(plan.owner_lots.map((row) => [row.id, row]));
  const audit = {
    id: stableId('aud', `${orderId}:inventory_released`), kind: 'order.inventory_reserved',
    ref_id: orderId, actor_id: actorId,
    payload: { reservation_ids: plan.reservations.map((row) => row.id) },
    created_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
  };
  const locks = [...new Set([...inventoryIds, ...ownerLotIds])].sort();
  const results = await sql.transaction((txn) => [
    ...locks.map((id) => txn`SELECT pg_advisory_xact_lock(hashtext(${id}))`),
    txn`UPDATE um_rows SET data=${JSON.stringify(plan.order)}::jsonb,updated_at=now()
      WHERE tbl='orders' AND id=${orderId} AND deleted=false
        AND (data->>'payment_status' IN ('paid','terms_approved')
          OR (data->>'payment_status'='not_required' AND data->>'distributor_flow'='blind_ship' AND COALESCE((data->>'total')::numeric,0)=0))
        AND COALESCE((data->>'fulfillment_revision')::int,0)=${number(orders[0]?.fulfillment_revision)}
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(inventoryChecks)}::jsonb) AS expected(id text,on_hand numeric,reserved numeric)
          LEFT JOIN um_rows inv ON inv.tbl='inventory' AND inv.id=expected.id AND inv.deleted=false
          WHERE inv.id IS NULL OR COALESCE((inv.data->>'on_hand')::numeric,0)<>expected.on_hand
            OR COALESCE((inv.data->>'reserved')::numeric,0)<>expected.reserved
        )
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(ownerChecks)}::jsonb) AS expected(id text,qty_on_hand numeric,qty_reserved numeric)
          LEFT JOIN um_rows lot ON lot.tbl='inventory_lots' AND lot.id=expected.id AND lot.deleted=false
          WHERE lot.id IS NULL OR COALESCE((lot.data->>'qty_on_hand')::numeric,0)<>expected.qty_on_hand
            OR COALESCE((lot.data->>'qty_reserved')::numeric,0)<>expected.qty_reserved
        )
      RETURNING id`,
    ...plan.reservations.map((row) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      SELECT 'reservations',${row.id},${JSON.stringify(row)}::jsonb,false,now()
      WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'release_nonce'=${nonce})
      ON CONFLICT (tbl,id) DO NOTHING`),
    ...inventoryIds.map((id) => txn`UPDATE um_rows SET data=${JSON.stringify(updatedById.get(id))}::jsonb,updated_at=now()
      WHERE tbl='inventory' AND id=${id} AND deleted=false
        AND EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'release_nonce'=${nonce})`),
    ...ownerLotIds.map((id) => txn`UPDATE um_rows SET data=${JSON.stringify(updatedOwnerLots.get(id))}::jsonb,updated_at=now()
      WHERE tbl='inventory_lots' AND id=${id} AND deleted=false
        AND EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'release_nonce'=${nonce})`),
    txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
      WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'release_nonce'=${nonce})
      ON CONFLICT (tbl,id) DO NOTHING`,
  ]);
  if (!results[locks.length]?.length) return { ok: false, reason: 'inventory_changed_retry' };
  return plan;
}

export async function persistOrderHandoff(sql, orderId, {
  actorId,
  handoffReference,
  now = new Date(),
} = {}) {
  const [orders, shipments, reservations, inventory, lots, ownerLots, agreements, organizations, notificationRecipients] = await Promise.all([
    rowsFor(sql, 'orders', { id: orderId }),
    rowsFor(sql, 'shipments', { order_id: orderId }),
    rowsFor(sql, 'reservations', { order_id: orderId }),
    rowsFor(sql, 'inventory'),
    rowsFor(sql, 'lots'),
    rowsFor(sql, 'inventory_lots'),
    rowsFor(sql, 'distributor_products'),
    rowsFor(sql, 'organizations'),
    rowsFor(sql, 'account_notification_recipients'),
  ]);
  let plan;
  try {
    plan = planOrderHandoff({
      order: orders[0], shipment: shipments[0], reservations, inventory, lots, ownerLots,
      actorId, handoffReference, now,
    });
  } catch (error) {
    return { ok: false, reason: error.message };
  }
  if (!plan.ok) return plan;
  plan.notification = buildHandoffNotification({ order: plan.order, shipment: plan.shipment, organizations, notificationRecipients, now });
  if (plan.idempotent) return plan;
  const settlement = buildSettlementDrafts({
    candidates: plan.settlement_candidates,
    agreements,
    organizations,
  });
  if (!settlement.ok) return settlement;
  const movementSettlement = new Map(settlement.movements.map((row) => [row.id, row]));
  plan.consignment_movements = plan.consignment_movements.map((row) => ({
    ...row,
    ...(movementSettlement.get(row.id) || {}),
  }));
  plan.settlement_candidates = settlement.candidates;
  const nonce = crypto.randomBytes(16).toString('hex');
  plan.order.handoff_nonce = nonce;
  const reservationById = new Map(reservations.map((row) => [row.id, row]));
  const touchedReservationIds = plan.reservations.map((row) => row.id);
  const inventoryIds = [...new Set(touchedReservationIds.map((id) => reservationById.get(id)?.inventory_id).filter(Boolean))];
  const updatedInventory = new Map(plan.inventory.map((row) => [row.id, row]));
  const sourceInventory = new Map(inventory.map((row) => [row.id, row]));
  const inventoryChecks = inventoryIds.map((id) => ({
    id, on_hand: number(sourceInventory.get(id)?.on_hand), reserved: number(sourceInventory.get(id)?.reserved),
  }));
  const updatedLots = new Map(plan.lots.map((row) => [row.id, row]));
  const lotIds = [...new Set(plan.movements.map((row) => row.lot_id).filter(Boolean))];
  const sourceLots = new Map(lots.map((row) => [row.id, row]));
  const lotChecks = lotIds.map((id) => ({ id, qty_remaining: number(sourceLots.get(id)?.qty_remaining) }));
  const ownerLotIds = [...new Set(plan.consignment_movements.map((row) => row.inventory_lot_id).filter(Boolean))];
  const sourceOwnerLots = new Map(ownerLots.map((row) => [row.id, row]));
  const updatedOwnerLots = new Map(plan.owner_lots.map((row) => [row.id, row]));
  const ownerChecks = ownerLotIds.map((id) => ({
    id, qty_on_hand: number(sourceOwnerLots.get(id)?.qty_on_hand), qty_reserved: number(sourceOwnerLots.get(id)?.qty_reserved),
  }));
  const audit = {
    id: stableId('aud', `${orderId}:handoff:${handoffReference}`), kind: 'order.custody_handoff',
    ref_id: orderId, actor_id: actorId,
    payload: {
      handoff_reference: handoffReference,
      movement_ids: [...plan.movements, ...plan.consignment_movements].map((row) => row.id),
    },
    created_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
  };
  const locks = [...new Set([...inventoryIds, ...lotIds, ...ownerLotIds])].sort();
  const results = await sql.transaction((txn) => [
    ...locks.map((id) => txn`SELECT pg_advisory_xact_lock(hashtext(${id}))`),
    txn`UPDATE um_rows SET data=${JSON.stringify(plan.order)}::jsonb,updated_at=now()
      WHERE tbl='orders' AND id=${orderId} AND deleted=false AND data->>'status' IN ('ready_to_ship','ready_for_pickup')
        AND COALESCE((data->>'fulfillment_revision')::int,0)=${number(orders[0]?.fulfillment_revision)}
        AND EXISTS (SELECT 1 FROM um_rows s WHERE s.tbl='shipments' AND s.id=${plan.shipment.id} AND s.data->>'status' IN ('label_created','pickup_ready'))
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(inventoryChecks)}::jsonb) AS expected(id text,on_hand numeric,reserved numeric)
          LEFT JOIN um_rows inv ON inv.tbl='inventory' AND inv.id=expected.id AND inv.deleted=false
          WHERE inv.id IS NULL OR COALESCE((inv.data->>'on_hand')::numeric,0)<>expected.on_hand
            OR COALESCE((inv.data->>'reserved')::numeric,0)<>expected.reserved
        )
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(lotChecks)}::jsonb) AS expected(id text,qty_remaining numeric)
          LEFT JOIN um_rows lot ON lot.tbl='lots' AND lot.id=expected.id AND lot.deleted=false
          WHERE lot.id IS NULL OR COALESCE((lot.data->>'qty_remaining')::numeric,0)<>expected.qty_remaining
        )
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(ownerChecks)}::jsonb) AS expected(id text,qty_on_hand numeric,qty_reserved numeric)
          LEFT JOIN um_rows owner_lot ON owner_lot.tbl='inventory_lots' AND owner_lot.id=expected.id AND owner_lot.deleted=false
          WHERE owner_lot.id IS NULL OR COALESCE((owner_lot.data->>'qty_on_hand')::numeric,0)<>expected.qty_on_hand
            OR COALESCE((owner_lot.data->>'qty_reserved')::numeric,0)<>expected.qty_reserved
        )
      RETURNING id`,
    txn`UPDATE um_rows SET data=${JSON.stringify(plan.shipment)}::jsonb,updated_at=now()
      WHERE tbl='shipments' AND id=${plan.shipment.id} AND deleted=false
        AND EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})`,
    ...plan.reservations.map((row) => txn`UPDATE um_rows SET data=${JSON.stringify(row)}::jsonb,updated_at=now()
      WHERE tbl='reservations' AND id=${row.id} AND deleted=false AND data->>'status'='held'
        AND EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})`),
    ...inventoryIds.map((id) => txn`UPDATE um_rows SET data=${JSON.stringify(updatedInventory.get(id))}::jsonb,updated_at=now()
      WHERE tbl='inventory' AND id=${id} AND deleted=false
        AND EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})`),
    ...lotIds.map((id) => txn`UPDATE um_rows SET data=${JSON.stringify(updatedLots.get(id))}::jsonb,updated_at=now()
      WHERE tbl='lots' AND id=${id} AND deleted=false
        AND EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})`),
    ...ownerLotIds.map((id) => txn`UPDATE um_rows SET data=${JSON.stringify(updatedOwnerLots.get(id))}::jsonb,updated_at=now()
      WHERE tbl='inventory_lots' AND id=${id} AND deleted=false
        AND EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})`),
    ...plan.movements.map((row) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      SELECT 'stock_movements',${row.id},${JSON.stringify(row)}::jsonb,false,now()
      WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})
      ON CONFLICT (tbl,id) DO NOTHING`),
    ...plan.genealogy.map((row) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      SELECT 'lot_tracking',${row.id},${JSON.stringify(row)}::jsonb,false,now()
      WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})
      ON CONFLICT (tbl,id) DO NOTHING`),
    ...plan.consignment_movements.map((row) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      SELECT 'consignment_movements',${row.id},${JSON.stringify(row)}::jsonb,false,now()
      WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})
      ON CONFLICT (tbl,id) DO NOTHING`),
    ...plan.settlement_candidates.map((row) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      SELECT 'settlement_candidates',${row.movement_id},${JSON.stringify({ id: row.movement_id, ...row })}::jsonb,false,now()
      WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})
      ON CONFLICT (tbl,id) DO NOTHING`),
    ...settlement.purchase_orders.map((row) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      SELECT 'purchase_orders',${row.id},${JSON.stringify(row)}::jsonb,false,now()
      WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})
      ON CONFLICT (tbl,id) DO NOTHING`),
    ...settlement.purchase_orders.map((row) => {
      const link = {
        id: stableId('csl', `${orderId}:${row.id}`), owner_org_id: row.owner_org_id,
        settlement_po_id: row.id, internal_order_id: orderId,
        movement_ids: row.eligible_movement_ids, created_at: row.created_at,
      };
      return txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'consignment_settlement_links',${link.id},${JSON.stringify(link)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})
        ON CONFLICT (tbl,id) DO NOTHING`;
    }),
    ...(plan.notification?.legacy_outbox ? [txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      SELECT 'gmail_outbox',${plan.notification.legacy_outbox.id},${JSON.stringify(plan.notification.legacy_outbox)}::jsonb,false,now()
      WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})
      ON CONFLICT (tbl,id) DO NOTHING`] : []),
    ...(plan.notification?.deliveries || []).map((delivery) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      SELECT 'customerio_outbox',${delivery.outbox.id},${JSON.stringify(delivery.outbox)}::jsonb,false,now()
      WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})
      ON CONFLICT (tbl,id) DO NOTHING`),
    ...(plan.notification?.task ? [txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      SELECT 'tasks',${plan.notification.task.id},${JSON.stringify(plan.notification.task)}::jsonb,false,now()
      WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})
      ON CONFLICT (tbl,id) DO NOTHING`] : []),
    txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
      WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${orderId} AND o.data->>'handoff_nonce'=${nonce})
      ON CONFLICT (tbl,id) DO NOTHING`,
  ]);
  if (!results[locks.length]?.length) {
    const current = (await rowsFor(sql, 'shipments', { order_id: orderId }))[0];
    if (current?.status === 'shipped' && current.handoff_reference === handoffReference) return { ...plan, ok: true, idempotent: true };
    return { ok: false, reason: 'handoff_conflict' };
  }
  return plan;
}

export function orderPaymentFromStripeEvent(event = {}) {
  if (!['invoice.paid', 'payment_intent.succeeded'].includes(event.type)) return { ok: false, reason: 'event_not_paid' };
  const object = event.data?.object || {};
  const orderId = object.metadata?.order_id || object.subscription_details?.metadata?.order_id || null;
  if (!event.id || !orderId || !object.id) return { ok: false, reason: 'payment_reference_missing' };
  const amountMinor = event.type === 'invoice.paid' ? object.amount_paid : object.amount_received;
  const paymentIntentId = object.payment_intent
    || object.payments?.data?.[0]?.payment?.payment_intent
    || (event.type === 'payment_intent.succeeded' ? object.id : null);
  const canonicalPaymentId = paymentIntentId
    ? `stripe:payment_intent:${paymentIntentId}`
    : `stripe:${event.type}:${object.id}`;
  return {
    ok: true,
    event_id: event.id,
    order_id: orderId,
    provider_object_id: object.id,
    payment_intent_id: paymentIntentId,
    canonical_payment_id: canonicalPaymentId,
    amount: number(amountMinor) / 100,
    currency: object.currency || 'usd',
    kind: event.type,
  };
}

export function planOrderPaymentApplication({ order, payment, now = new Date() } = {}) {
  if (!order) return { ok: false, reason: 'order_not_found' };
  if (!payment?.ok || payment.order_id !== order.id) return { ok: false, reason: 'payment_order_mismatch' };
  if (!(number(payment.amount) > 0)) return { ok: false, reason: 'invalid_payment_amount' };
  if (!payment.canonical_payment_id) return { ok: false, reason: 'canonical_payment_reference_required' };
  const occurredAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const outstanding = Math.max(0, +(number(order.total) - number(order.paid_amount)).toFixed(2));
  if (number(payment.amount) > outstanding + 0.001) return { ok: false, reason: 'payment_exceeds_balance', outstanding };
  const paidAmount = +(number(order.paid_amount) + number(payment.amount)).toFixed(2);
  const fullyPaid = paidAmount + 0.001 >= number(order.total);
  return {
    ok: true,
    order: {
      ...order,
      paid_amount: paidAmount,
      payment_status: fullyPaid ? 'paid' : 'partial',
      status: fullyPaid ? 'payment_released' : 'payment_pending',
      paid_at: fullyPaid ? occurredAt : order.paid_at || null,
      last_payment_event_id: payment.event_id,
      last_payment_reference: payment.canonical_payment_id,
      fulfillment_revision: number(order.fulfillment_revision),
      updated_at: occurredAt,
    },
    payment: {
      id: stableId('payment', payment.canonical_payment_id),
      order_id: order.id,
      customer_id: order.customer_id,
      amount: number(payment.amount),
      currency: payment.currency,
      method: 'stripe',
      provider: 'stripe',
      provider_event_id: payment.event_id,
      provider_object_id: payment.provider_object_id,
      payment_intent_id: payment.payment_intent_id,
      canonical_payment_id: payment.canonical_payment_id,
      received_at: occurredAt,
    },
  };
}
