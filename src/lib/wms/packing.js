/**
 * UniteWMS — packing (PRD-25 Phase 3, §7).
 *
 * Generates a packing slip PDF (reusing the existing pdf.js/documents engine)
 * and a naive cartonization plan. Kept thin: the heavy PDF work already lives
 * in src/lib/documents.js.
 */

import { db } from '../db.js';
import { generateDocument } from '../documents.js';

const DEFAULT_CARTON_MAX_UNITS = 48;

/** Generate (or reuse) the packing slip document for an order. */
export function packSlip(orderId) {
  const { record } = generateDocument({ type: 'packing_slip', ref_id: orderId, ref_type: 'order' });
  return { ok: true, document_id: record.id, document: record };
}

/**
 * Cartonize an order's lines into a simple box plan: fill cartons up to
 * DEFAULT_CARTON_MAX_UNITS units. Good enough to drive ShipStation weight +
 * a packing checklist; replace with dim-weight logic later.
 *
 * @returns {{cartons:Array<{carton:number, lines:Array, units:number}>}}
 */
export function cartonize(orderId, { maxUnits = DEFAULT_CARTON_MAX_UNITS } = {}) {
  const items = db.list('order_items', { where: { order_id: orderId } });
  const cartons = [];
  let current = { carton: 1, lines: [], units: 0 };
  for (const it of items) {
    let remaining = Number(it.qty) || 0;
    while (remaining > 0) {
      const space = maxUnits - current.units;
      const put = Math.min(space, remaining);
      current.lines.push({ sku: it.sku, name: it.name, qty: put });
      current.units += put;
      remaining -= put;
      if (current.units >= maxUnits && remaining > 0) {
        cartons.push(current);
        current = { carton: cartons.length + 1, lines: [], units: 0 };
      }
    }
  }
  if (current.units > 0 || cartons.length === 0) cartons.push(current);
  return { cartons };
}

export const packing = { packSlip, cartonize };
