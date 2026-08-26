function number(value) { return Number(value) || 0; }

export function planDistributorOwnerAllocation({
  order,
  item,
  ownerOrgId,
  distributorProducts = [],
  ownerLots = [],
  actorId,
  now = new Date(),
} = {}) {
  if (!order || !item || item.order_id !== order.id) return { ok: false, reason: 'order_line_not_found' };
  if (order.status !== 'payment_pending' || order.payment_status !== 'pending') {
    return { ok: false, reason: 'allocation_window_closed' };
  }
  const ownerId = String(ownerOrgId || '').trim();
  const actor = String(actorId || '').trim();
  if (!ownerId || !actor) return { ok: false, reason: 'owner_and_actor_required' };
  const at = now instanceof Date ? now : new Date(now);
  const product = distributorProducts.find((row) => row.owner_org_id === ownerId
    && row.mapped_unite_sku === item.sku && row.unite_sellable === true);
  if (!product) return { ok: false, reason: 'owner_product_not_sellable' };
  const starts = !product.settlement_effective_from || new Date(product.settlement_effective_from).getTime() <= at.getTime();
  const ends = !product.settlement_effective_until || new Date(product.settlement_effective_until).getTime() > at.getTime();
  if (number(product.settlement_unit_cost) <= 0 || !starts || !ends) {
    return { ok: false, reason: 'active_settlement_price_required' };
  }
  const available = ownerLots
    .filter((lot) => lot.owner_org_id === ownerId
      && (lot.product_sku === item.sku || lot.distributor_sku === product.distributor_sku))
    .reduce((sum, lot) => sum + Math.max(0, number(lot.qty_on_hand) - number(lot.qty_reserved)), 0);
  if (available < number(item.qty)) return { ok: false, reason: 'insufficient_owner_inventory', available };
  const allocatedAt = at.toISOString();
  return {
    ok: true,
    order: {
      ...order,
      fulfillment_revision: number(order.fulfillment_revision) + 1,
      owner_allocation_updated_at: allocatedAt,
      owner_allocation_updated_by: actor,
      updated_at: allocatedAt,
    },
    item: {
      ...item,
      inventory_owner_type: 'distributor',
      inventory_owner_org_id: ownerId,
      distributor_sku: product.distributor_sku,
      distributor_product_id: product.id,
      distributor_flow: 'unite_sell_through',
      settlement_eligible: true,
      owner_allocated_at: allocatedAt,
      owner_allocated_by: actor,
    },
    owner_lots: ownerLots.map((row) => ({ ...row })),
  };
}
