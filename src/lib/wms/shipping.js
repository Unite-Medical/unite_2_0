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

  for (const r of held) {
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
          lot_number: a.lot_number, product_sku: r.sku, order_id: orderId,
          customer_id: customerId, qty: a.qty, expiration_date: a.expiration_date, shipped_by: actor_id,
        });
        genealogy.push(g);
      }
      shippedViaLot += a.qty;
    }

    // Non-lot-tracked remainder (older stock with no lot rows) ships too.
    const remainder = num(r.qty) - shippedViaLot;
    if (remainder > 0) {
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

  return { ok: true, order_id: orderId, movements, genealogy, shortfall };
}

/** Recall lookup passthrough (PRD §7 RECALL SLA). */
export function recall(lotNumber) {
  return lots.genealogy(lotNumber);
}

export const shipping = { confirmShip, recall };
