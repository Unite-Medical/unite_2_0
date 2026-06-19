/**
 * Blind / white-label shipping — PRD-27 §6.
 *
 * When a distributor's order ships, the recipient must believe it came from
 * the distributor: the label uses the distributor's ship-from identity (brand
 * name + return address, no "Unite Medical"), the packing slip is the
 * distributor's uploaded template (never the Unite-branded one for a blind
 * order — falls back to a neutral slip), and any required inserts (COA, IFU,
 * marketing) are attached to the pack-out checklist.
 */

import { db } from './db.js';

const UNITE_WAREHOUSE = {
  name: 'Unite Medical', company: 'Unite Medical',
  street1: '1487 Trae Lane', city: 'Lithia Springs', state: 'GA', postalCode: '30122', country: 'US',
};

/** The org a blind order ships on behalf of (distributor), if any. */
function ownerOrgId(order) {
  return order.on_behalf_of_org_id || (order.blind_ship ? order.customer_id : null);
}

/** Resolve the ship-from identity for an order (explicit, default, or null). */
export function shipIdentityFor(order) {
  if (!order?.blind_ship) return null;
  if (order.ship_identity_id) {
    const byId = db.get('distributor_ship_identities', order.ship_identity_id);
    if (byId) return byId;
  }
  const orgId = ownerOrgId(order);
  if (!orgId) return null;
  const ids = db.list('distributor_ship_identities', { where: { owner_org_id: orgId } });
  return ids.find((i) => i.is_default) || ids[0] || null;
}

/**
 * ShipStation ship-from + third-party billing options for an order.
 * Non-blind Unite orders return {} (ShipStation uses the Unite default).
 */
export function shipOptionsFor(order) {
  const out = {};
  const identity = shipIdentityFor(order);
  if (identity) {
    const addr = identity.return_address || UNITE_WAREHOUSE;
    out.shipFrom = {
      name: identity.brand_name,
      company: identity.brand_name,
      street1: addr.street1 || UNITE_WAREHOUSE.street1,
      street2: addr.street2 || undefined,
      city: addr.city || UNITE_WAREHOUSE.city,
      state: addr.state || UNITE_WAREHOUSE.state,
      postalCode: addr.postalCode || addr.zip || UNITE_WAREHOUSE.postalCode,
      country: addr.country || 'US',
    };
    out.blind = true;
  }
  if (order.shipping_bill_to === 'third_party' && order.carrier_account_id) {
    const acct = db.get('distributor_carrier_accounts', order.carrier_account_id);
    if (acct) out.billToThirdParty = { carrier: acct.carrier, account_number: acct.account_number, billing_zip: acct.billing_zip };
  }
  return out;
}

/** Packing-slip template + always-include inserts for an order's pack-out. */
export function packingDocsFor(order) {
  const orgId = ownerOrgId(order);
  if (!order?.blind_ship || !orgId) {
    return { blind: false, template: 'unite_default', inserts: [] };
  }
  const docs = db.list('distributor_documents', { where: { owner_org_id: orgId } });
  const template = docs.find((d) => d.doc_type === 'packing_slip_template');
  const inserts = docs.filter((d) => d.doc_type !== 'packing_slip_template' && d.include_on_every_order);
  return {
    blind: true,
    // Never the Unite-branded slip for a blind order — distributor template or neutral.
    template: template ? template.name : 'neutral_unbranded',
    template_url: template?.file_url || null,
    inserts,
  };
}

export const blindShip = { shipIdentityFor, shipOptionsFor, packingDocsFor };
