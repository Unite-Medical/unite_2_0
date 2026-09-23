function number(value) { return Number(value) || 0; }

const WAREHOUSE_TIME_ZONE = 'America/New_York';
function warehouseParts(value) {
  const raw = String(value || '').trim();
  const local = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (local) {
    return {
      date: `${local[1]}-${local[2]}-${local[3]}`,
      minutes: Number(local[4]) * 60 + Number(local[5]),
      raw_local: raw,
    };
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: WAREHOUSE_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    instant: date.toISOString(),
  };
}

export function validateWarehousePickupWindow(startInput, endInput) {
  const start = new Date(startInput);
  const end = new Date(endInput);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() >= end.getTime()) {
    return { ok: false, reason: 'invalid_pickup_window' };
  }
  const startParts = warehouseParts(startInput);
  const endParts = warehouseParts(endInput);
  if (!startParts || !endParts || startParts.date !== endParts.date
      || startParts.minutes < 9 * 60 || endParts.minutes > 16 * 60) {
    return { ok: false, reason: 'pickup_outside_warehouse_hours' };
  }
  return {
    ok: true,
    start: startParts.instant || startParts.raw_local,
    end: endParts.instant || endParts.raw_local,
    warehouse_time_zone: WAREHOUSE_TIME_ZONE,
  };
}

export function validateDistributorPickupRequest({ session, order, input = {} }) {
  if (session?.role !== 'distributor' || !session.org_id) return { ok: false, reason: 'distributor_access_required' };
  if (!order) return { ok: false, reason: 'order_not_found' };
  if ((order.on_behalf_of_org_id || order.customer_id) !== session.org_id) return { ok: false, reason: 'order_not_owned' };
  if (!order.blind_ship) return { ok: false, reason: 'blind_ship_required' };
  if (order.status !== 'ready_for_pickup') return { ok: false, reason: 'order_not_ready' };
  if (!String(input.carrier_name || '').trim()) return { ok: false, reason: 'carrier_required' };
  if (!String(input.booking_reference || '').trim()) return { ok: false, reason: 'booking_reference_required' };
  if (!String(input.dispatch_contact?.name || '').trim() || !String(input.dispatch_contact?.phone || '').trim()) {
    return { ok: false, reason: 'dispatch_contact_required' };
  }
  return validateWarehousePickupWindow(input.requested_start, input.requested_end);
}

export function buildDistributorOverview({ session, tables = {}, as_of = new Date(), window_days = 30 }) {
  if (session?.role !== 'distributor' || !session.org_id) return null;
  const ownerId = session.org_id;
  const organization = (tables.organizations || []).find((row) => row.id === ownerId);
  if (!organization) return null;

  const products = (tables.distributor_products || []).filter((row) => row.owner_org_id === ownerId);
  const productById = new Map(products.map((row) => [row.id, row]));
  const lots = (tables.inventory_lots || []).filter((row) => row.owner_org_id === ownerId);
  const lotById = new Map(lots.map((row) => [row.id, row]));
  const movements = (tables.consignment_movements || []).filter((row) => row.owner_org_id === ownerId);
  const fromMs = as_of.getTime() - window_days * 86400000;
  const productForLot = (lot) => productById.get(lot.distributor_product_id)
    || products.find((row) => row.distributor_sku === lot.distributor_sku)
    || products.find((row) => row.mapped_unite_sku === (lot.product_sku || lot.mapped_unite_sku));

  const inventory = lots.map((lot) => {
    const product = productForLot(lot);
    const onHand = number(lot.qty_on_hand);
    const reserved = number(lot.qty_reserved);
    return {
      product_id: product?.id || null,
      distributor_sku: product?.distributor_sku || lot.distributor_sku || lot.mapped_unite_sku,
      unite_sku: product?.mapped_unite_sku || lot.product_sku || lot.mapped_unite_sku || null,
      lot_number: lot.lot_number || null,
      expiration_date: lot.expiration_date || null,
      warehouse_id: lot.warehouse_id || null,
      on_hand: onHand,
      reserved,
      available: Math.max(0, onHand - reserved),
      status: lot.status || 'available',
    };
  });

  const metrics = products.map((product) => {
    const productLots = lots.filter((lot) => productForLot(lot)?.id === product.id);
    const lotIds = new Set(productLots.map((lot) => lot.id));
    const recentUnits = movements
      .filter((movement) => lotIds.has(movement.inventory_lot_id)
        && movement.movement === 'sold_by_unite'
        && new Date(movement.created_at).getTime() >= fromMs
        && new Date(movement.created_at).getTime() <= as_of.getTime())
      .reduce((sum, movement) => sum + number(movement.qty), 0);
    const available = inventory.filter((row) => row.product_id === product.id).reduce((sum, row) => sum + row.available, 0);
    const runRate = recentUnits / Math.max(1, window_days);
    const threshold = number(product.low_stock_threshold);
    return {
      product_id: product.id,
      distributor_sku: product.distributor_sku,
      unite_sku: product.mapped_unite_sku,
      run_rate_units_per_day: runRate,
      run_rate_window_days: window_days,
      units_sold_in_window: recentUnits,
      available,
      days_of_cover: runRate > 0 ? available / runRate : null,
      low_stock_threshold: threshold,
      low_stock: available <= threshold,
    };
  });

  const serviceHistory = movements
    .map((movement) => {
      const lot = lotById.get(movement.inventory_lot_id);
      const product = lot ? productForLot(lot) : null;
      return {
        kind: movement.movement === 'sold_by_unite' ? 'stock_depletion' : movement.movement,
        distributor_sku: product?.distributor_sku || lot?.distributor_sku || null,
        unite_sku: product?.mapped_unite_sku || lot?.product_sku || lot?.mapped_unite_sku || null,
        lot_number: lot?.lot_number || null,
        expiration_date: lot?.expiration_date || null,
        quantity: number(movement.qty),
        settlement_reference: movement.settlement_po_id || null,
        occurred_at: movement.created_at || null,
      };
    })
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));

  const settlementPurchaseOrders = (tables.purchase_orders || [])
    .filter((row) => row.owner_org_id === ownerId && row.po_type === 'consignment_settlement')
    .map((row) => ({
      id: row.id,
      status: row.status,
      currency: row.currency || row.settlement_currency || 'USD',
      total_cost: number(row.total_cost),
      line_items: (row.line_items || []).map((line) => ({
        sku: line.sku, name: line.name || line.sku, qty: number(line.qty), cost: number(line.cost),
      })),
      created_at: row.created_at || null,
      sent_at: row.sent_at || null,
      vendor_response: row.vendor_response || 'pending',
      paid_at: row.paid_at || null,
    }));

  const notifications = (tables.distributor_notifications || [])
    .filter((row) => row.owner_org_id === ownerId)
    .map((row) => ({
      id: row.id, kind: row.kind, title: row.title, message: row.message,
      distributor_sku: row.payload?.distributor_sku || null,
      unite_sku: row.payload?.unite_sku || null,
      remaining_inventory: row.payload?.remaining_inventory ?? row.payload?.available ?? null,
      days_cover: row.payload?.days_cover ?? null,
      low_stock_threshold: row.payload?.low_stock_threshold ?? null,
      status: row.status || 'unread', created_at: row.created_at || null,
    }));

  const pickups = (tables.distributor_pickups || [])
    .filter((row) => row.owner_org_id === ownerId)
    .map((row) => ({
      id: row.id, status: row.status, public_order_reference: row.public_order_reference || row.booking_reference || null,
      carrier_name: row.carrier_name || null, booking_reference: row.booking_reference || null,
      requested_start: row.requested_start || null, requested_end: row.requested_end || null,
      confirmed_start: row.confirmed_start || null, confirmed_end: row.confirmed_end || null,
      created_at: row.created_at || null,
    }));

  const eligiblePickups = (tables.orders || [])
    .filter((row) => (row.on_behalf_of_org_id || row.customer_id) === ownerId && row.blind_ship && row.status === 'ready_for_pickup')
    .map((row) => ({ reference: row.id, status: row.status }));

  const documents = (tables.distributor_documents || [])
    .filter((row) => row.owner_org_id === ownerId)
    .map((row) => ({ id: row.id, name: row.name, doc_type: row.doc_type, include_on_every_order: Boolean(row.include_on_every_order) }));

  const shipIdentities = (tables.distributor_ship_identities || [])
    .filter((row) => row.owner_org_id === ownerId)
    .map((row) => ({
      id: row.id, brand_name: row.brand_name, is_default: Boolean(row.is_default),
      return_address: row.return_address ? { city: row.return_address.city, state: row.return_address.state } : null,
    }));
  const paymentMethods = (tables.payment_methods || [])
    .filter((row) => row.org_id === ownerId && row.status === 'active')
    .map((row) => ({ method: row.method, label: row.label || row.method }));

  return {
    organization: { id: organization.id, name: organization.name, contact_email: organization.contact_email || null },
    products: products.map((row) => ({
      id: row.id, distributor_sku: row.distributor_sku, unite_sku: row.mapped_unite_sku,
      product_name: row.product_name || row.name || null, settlement_unit_cost: number(row.settlement_unit_cost),
      settlement_currency: row.settlement_currency || 'USD', settlement_effective_from: row.settlement_effective_from || null,
      settlement_effective_until: row.settlement_effective_until || null, low_stock_threshold: number(row.low_stock_threshold),
    })),
    inventory,
    metrics,
    service_history: serviceHistory,
    settlement_purchase_orders: settlementPurchaseOrders,
    notifications,
    pickups,
    eligible_pickups: eligiblePickups,
    documents,
    ship_identities: shipIdentities,
    payment_methods: paymentMethods,
  };
}
