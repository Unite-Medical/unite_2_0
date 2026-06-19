/**
 * UniteWMS — kits / bundles (PRD-25 Phase 5, §7).
 *
 * A bundle is a virtual SKU composed of component SKUs. It carries no on_hand
 * of its own: its available-to-promise is the MIN over components of
 * floor(component_available / qty_per_kit). Reserving/shipping a bundle
 * explodes it into its components, so kit demand draws down real component
 * stock through the same ledger + reservation path (no separate kit ledger).
 *
 * Bundles live in the `bundles` table: { bundle_sku, name, components:[{sku,qty}] }.
 */

import { db } from '../db.js';
import { uid } from '../format.js';
import { availability } from './availability.js';

function num(v) { return Number(v) || 0; }

export function list() { return db.list('bundles'); }
export function get(bundleSku) { return db.list('bundles', { where: { bundle_sku: bundleSku } })[0] || null; }
export function isBundle(sku) { return Boolean(get(sku)); }
export function components(bundleSku) { return get(bundleSku)?.components || []; }

/** Available-to-promise for a kit = min over components of floor(avail / qty). */
export function availableToPromise(bundleSku, warehouse_id = null) {
  const comps = components(bundleSku);
  if (!comps.length) return 0;
  let min = Infinity;
  for (const c of comps) {
    const per = Math.floor(availability.availableToPromise(c.sku, warehouse_id) / Math.max(1, num(c.qty)));
    min = Math.min(min, per);
  }
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

/** Explode a kit into component demand: [{ sku, qty }]. */
export function explode(bundleSku, qty = 1) {
  return components(bundleSku).map((c) => ({ sku: c.sku, qty: num(c.qty) * num(qty) }));
}

/**
 * Seed a couple of demo kits from real, stocked catalog SKUs (idempotent).
 * Lets the storefront + verifier exercise kit availability without hand-built
 * fixtures.
 */
export function seedDemoBundles() {
  if (list().length) return list();
  const stocked = db.list('products').filter((p) => db.list('inventory', { where: { sku: p.sku } }).length);
  if (stocked.length < 4) return [];
  const defs = [
    { name: 'ASC Procedure Starter Kit', parts: stocked.slice(0, 3) },
    { name: 'EMS Field Resupply Kit', parts: stocked.slice(3, 6) },
  ];
  const created = [];
  for (const d of defs) {
    if (d.parts.length < 2) continue;
    const bundle_sku = `KIT-${d.name.split(' ').map((w) => w[0]).join('').toUpperCase()}-${uid('x').slice(-4)}`;
    created.push(db.insert('bundles', {
      id: uid('bndl'), bundle_sku, name: d.name,
      components: d.parts.map((p, i) => ({ sku: p.sku, qty: i + 1 })),
    }));
  }
  return created;
}

export const bundles = { list, get, isBundle, components, availableToPromise, explode, seedDemoBundles };
