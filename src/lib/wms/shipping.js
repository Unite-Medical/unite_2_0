/**
 * UniteWMS — shipping / ship-confirm (PRD-25 Phase 3, §7 outbound).
 *
 * On ship, for each held reservation:
 *   1. FEFO-pick lots (lots.pickFEFO decrements qty_remaining),
 *   2. post a `ship` ledger movement per lot allocation (on_hand drops, lot_id
 *      attached), plus a no-lot remainder movement for non-lot-tracked stock,
 *   3. write lot_tracking genealogy (lot → order_id + customer_id) so the
 *      recall query returns every affected customer in < 1s,
 *   4. free the reservation's reserved units and mark it committed.
 *
 * Idempotent per (order, reservation, lot): replaying a ship is a no-op.
 * The actual ShipStation label + customer notify stay in fulfillment.js; this
 * module owns the inventory/lot truth of the ship.
 */

import { db } from '../db.js';
import { ledger } from './ledger.js';
import { lots } from './lots.js';
import { reservations } from './reservations.js';
import { trackingPolicyForSku } from '../productTracking.js';
import { consignment } from '../consignment.js';

function num(v) { return Number(v) || 0; }

/**
 * Confirm an order has shipped — decrement FEFO lots + post ship movements +
 * record recall genealogy. Returns the lot allocations and posted movements.
 *
 * @returns {{ok:boolean, order_id:string, movements:Array, genealogy:Array, shortfall:number}}
 */
export function confirmShip(orderId, { actor_id = 'shipping' } = {}) {
  const order = db.get('orders', orderId);
  const customerId = order?.customer_id || null;
  const held = reservations.heldReservations(orderId);
  const movements = [];
  const genealogy = [];
  let shortfall = 0;

  // Hard preflight before any mutation. Required-tracking products must have
  // enough eligible lot quantity for the whole held reservation.
  for (const r of held) {
    if (r.inventory_owner_type === 'distributor') {
      const ownerLot = db.get('inventory_lots', r.inventory_lot_id);
      if (!ownerLot || ownerLot.owner_org_id !== r.inventory_owner_org_id
          || !lots.isLotSellable(ownerLot)
          || num(ownerLot.qty_on_hand) < num(r.qty) || num(ownerLot.qty_reserved) < num(r.qty)) {
        return {
          ok: false, reason: 'reserved_consignment_inventory_missing', order_id: orderId,
          sku: r.sku, movements: [], genealogy: [], shortfall: num(r.qty),
        };
      }
      continue;
    }
    const policy = trackingPolicyForSku(r.sku);
    if (policy.lot !== 'required' && policy.expiration !== 'required') continue;
    const eligible = db.list('lots', { where: { product_sku: r.sku, warehouse_id: r.warehouse_id } })
      .filter((lot) => num(lot.qty_remaining) > 0)
      .filter((lot) => lots.isLotSellable(lot))
      .filter((lot) => policy.lot !== 'required' || Boolean(String(lot.lot_number || '').trim()))
      .filter((lot) => policy.expiration !== 'required' || Boolean(String(lot.expiration_date || '').trim()))
      .reduce((sum, lot) => sum + num(lot.qty_remaining), 0);
    if (eligible < num(r.qty)) {
      return {
        ok: false,
        reason: 'required_tracking_missing',
        order_id: orderId,
        sku: r.sku,
        required_qty: num(r.qty),
        eligible_qty: eligible,
        movements: [],
        genealogy: [],
        shortfall: num(r.qty) - eligible,
      };
    }
  }

  const consignmentOwnerOrgIds = new Set();
  const ownerGroups = new Map();
  for (const reservation of held.filter((row) => row.inventory_owner_type === 'distributor')) {
    const key = `${reservation.inventory_owner_org_id}:${reservation.sku}`;
    if (!ownerGroups.has(key)) ownerGroups.set(key, []);
    ownerGroups.get(key).push(reservation);
  }
  for (const group of ownerGroups.values()) {
    const first = group[0];
    const flow = first.distributor_flow || order?.distributor_flow;
    if (flow === 'blind_ship') {
      for (const reservation of group) {
        const ownerLot = db.get('inventory_lots', reservation.inventory_lot_id);
        const movementId = `cm_owner_${orderId}_${reservation.id}`;
        let ownerMovement = db.get('consignment_movements', movementId);
        if (!ownerMovement) {
          db.update('inventory_lots', ownerLot.id, {
            qty_on_hand: num(ownerLot.qty_on_hand) - num(reservation.qty),
            qty_reserved: num(ownerLot.qty_reserved) - num(reservation.qty),
          });
          ownerMovement = db.insert('consignment_movements', {
            id: movementId,
            owner_org_id: reservation.inventory_owner_org_id,
            inventory_lot_id: ownerLot.id,
            product_sku: reservation.sku,
            distributor_sku: reservation.distributor_sku || ownerLot.distributor_sku || null,
            qty: num(reservation.qty),
            movement: 'fulfilled_for_owner',
            settlement_eligible: false,
            order_id: orderId,
            created_at: new Date().toISOString(),
          });
        }
        movements.push(ownerMovement);
        const trace = lots.recordShipGenealogy({
          lot_id: ownerLot.id, lot_number: ownerLot.lot_number || 'N/A', product_sku: reservation.sku,
          order_id: orderId, customer_id: customerId, recipient_org_id: order?.on_behalf_of_org_id || customerId,
          owner_type: 'distributor', owner_org_id: ownerLot.owner_org_id,
          qty: reservation.qty, expiration_date: ownerLot.expiration_date || null, shipped_by: actor_id,
        });
        genealogy.push(trace);
        reservations.commitReservation(reservation);
      }
      continue;
    }
    if (flow !== 'unite_sell_through') {
      return { ok: false, reason: 'distributor_flow_required', order_id: orderId, movements: [], genealogy: [], shortfall: num(first.qty) };
    }
    const result = consignment.recordSellThrough({
      owner_org_id: first.inventory_owner_org_id,
      order_id: orderId,
      sku: first.sku,
      distributor_sku: first.distributor_sku || null,
      qty: group.reduce((sum, reservation) => sum + num(reservation.qty), 0),
      reservation_ids: group.map((reservation) => reservation.id),
    });
    if (!result.ok) return { ...result, order_id: orderId, movements: [], genealogy: [], shortfall: num(first.qty) };
    movements.push(...result.movements);
    consignmentOwnerOrgIds.add(first.inventory_owner_org_id);
    for (const movement of result.movements) {
      const ownerLot = db.get('inventory_lots', movement.inventory_lot_id);
      const trace = lots.recordShipGenealogy({
        lot_id: ownerLot?.id || null, lot_number: ownerLot?.lot_number || 'N/A', product_sku: first.sku,
        order_id: orderId, customer_id: customerId, qty: movement.qty,
        owner_type: 'distributor', owner_org_id: ownerLot?.owner_org_id || first.inventory_owner_org_id,
        expiration_date: ownerLot?.expiration_date || null, shipped_by: actor_id,
      });
      genealogy.push(trace);
    }
  }

  for (const r of held) {
    if (r.inventory_owner_type === 'distributor') continue;
    const policy = trackingPolicyForSku(r.sku);
    const picks = lots.pickFEFO(r.sku, r.warehouse_id, num(r.qty));
    let shippedViaLot = 0;

    for (const a of picks.allocations) {
      const res = ledger.post({
        sku: r.sku, warehouse_id: r.warehouse_id, qty_delta: -a.qty, reason: ledger.REASONS.SHIP,
        ref_type: 'order', ref_id: orderId, lot_id: a.lot_id, actor_id,
        idempotency_key: `ship:${orderId}:${r.id}:${a.lot_id}`,
        note: `Ship lot ${a.lot_number}`,
      });
      if (res.movement) movements.push(res.movement);
      if (res.ok && !res.duplicate) {
        const g = lots.recordShipGenealogy({
          lot_id: a.lot_id, lot_number: a.lot_number, product_sku: r.sku, order_id: orderId,
          customer_id: customerId, qty: a.qty, expiration_date: a.expiration_date, shipped_by: actor_id,
        });
        genealogy.push(g);
      }
      shippedViaLot += a.qty;
    }

    // Non-lot-tracked remainder (older stock with no lot rows) ships too.
    const remainder = num(r.qty) - shippedViaLot;
    if (remainder > 0) {
      if (policy.lot === 'required' || policy.expiration === 'required') {
        return { ok: false, reason: 'required_tracking_missing', order_id: orderId, sku: r.sku, movements, genealogy, shortfall: remainder };
      }
      const res = ledger.post({
        sku: r.sku, warehouse_id: r.warehouse_id, qty_delta: -remainder, reason: ledger.REASONS.SHIP,
        ref_type: 'order', ref_id: orderId, actor_id,
        idempotency_key: `ship:${orderId}:${r.id}:nolot`,
        note: 'Ship (non-lot stock)',
      });
      if (res.movement) movements.push(res.movement);
    }

    reservations.commitReservation(r);
  }

  return {
    ok: true,
    order_id: orderId,
    movements,
    genealogy,
    shortfall,
    consignment_owner_org_ids: [...consignmentOwnerOrgIds],
  };
}

/** Recall lookup passthrough (PRD §7 RECALL SLA). */
export function recall(lotNumber) {
  return lots.genealogy(lotNumber);
}

export const shipping = { confirmShip, recall };
