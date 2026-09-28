import { qboAccessContext } from './qboTokens.js';
import { qboPoRequest } from './qboPurchaseOrders.js';
import { SERVICES } from './services.js';

const qboEntities = { qbo_pos: 'PurchaseOrder', qbo_items: 'Item', qbo_bills: 'Bill', qbo_purchases: 'Purchase', qbo_vendor_credits: 'VendorCredit' };
const internalTables = ['warehouses', 'product_variants', 'inventory', 'inventory_lots', 'purchase_orders', 'po_receipts', 'stock_movements', 'lots', 'reservations', 'count_sessions', 'count_lines', 'transfers', 'transfer_lines', 'consignment_movements'];
const pageInfo = 'pageInfo{hasNextPage endCursor}';
const inventoryQuery = `query InventoryEvidence($after:String){inventoryItems(first:25,after:$after){nodes{id sku tracked updatedAt variant{id title product{id title status}} inventoryLevels(first:20,includeInactive:true){nodes{id updatedAt location{id name isActive} quantities(names:["available","on_hand","committed","incoming","reserved","damaged","quality_control","safety_stock"]){name quantity}} ${pageInfo}}} ${pageInfo}}}`;
const ordersQuery = `query OrderEvidence($after:String,$query:String!){orders(first:10,after:$after,query:$query,sortKey:UPDATED_AT){nodes{id name createdAt updatedAt closedAt cancelledAt test displayFinancialStatus displayFulfillmentStatus lineItems(first:50){nodes{id sku name quantity currentQuantity unfulfilledQuantity refundableQuantity variant{id inventoryItem{id}}} ${pageInfo}}} ${pageInfo}} currentAppInstallation{accessScopes{handle}}}`;
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
export function evidenceParameters(params) {
  const source = params.get('source'), page = Number(params.get('page') || 1), cursor = params.get('cursor') || null;
  const since = params.get('since') || new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  if (!Number.isInteger(page) || page < 1 || page > 10000 || (cursor && cursor.length > 2000)) throw new Error('invalid_pagination');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !Number.isFinite(Date.parse(since)) || new Date(since).toISOString().slice(0, 10) !== since) throw new Error('invalid_since_date');
  if (![...Object.keys(qboEntities), 'shopify_inventory', 'shopify_open_orders', 'shopify_recent_orders', 'shipstation_orders', 'shipstation_shipments', 'shipstation_awaiting_payment', 'shipstation_awaiting_shipment', 'shipstation_on_hold', 'unite_inventory'].includes(source)) throw new Error('invalid_source');
  return { source, page, cursor, since };
}
export async function readEvidencePage(sql, input, { getQboContext = qboAccessContext, qboRequest = qboPoRequest, services = SERVICES, fetchImpl = fetch } = {}) {
  const { source, page, cursor, since } = input, retrieved_at = new Date().toISOString();
  const base = { source, page, retrieved_at, warnings: [] };
  if (qboEntities[source]) {
    const context = await getQboContext(sql), entity = qboEntities[source];
    const query = `select * from ${entity}${entity === 'Item' ? ' where Active IN (true,false)' : ''} startposition ${(page - 1) * 100 + 1} maxresults 100`;
    const payload = await qboRequest(context, 'query', { query });
    if (!payload.QueryResponse || (payload.QueryResponse[entity] && !Array.isArray(payload.QueryResponse[entity]))) throw new Error('quickbooks_invalid_page');
    const records = payload.QueryResponse[entity] || [];
    return { ...base, records, has_more: records.length === 100, query, environment: context.environment, company_id: context.realmId, coverage: 'All available records; deleted records are not included. PO closure and bills do not prove physical receipt.' };
  }
  if (source === 'unite_inventory') {
    const records = await sql`SELECT tbl,id,data,updated_at FROM um_rows WHERE tbl = ANY(${internalTables}) AND deleted=false ORDER BY tbl,id LIMIT 500 OFFSET ${(page - 1) * 500}`;
    return { ...base, records, has_more: records.length === 500, coverage: 'Current internal records, including provisional/seeded balances. Not independent proof of stock.' };
  }
  if (source.startsWith('shopify_')) {
    const service = services.shopify;
    if (!service.configured()) throw new Error('shopify_not_configured');
    const inventory = source === 'shopify_inventory';
    const filter = source === 'shopify_open_orders' ? 'status:open' : `updated_at:>=${since}`;
    const response = await fetchImpl(service.buildUrl(`/admin/api/${process.env.SHOPIFY_API_VERSION || '2026-04'}/graphql.json`, {}), {
      method: 'POST', headers: await service.headers(), signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ query: inventory ? inventoryQuery : ordersQuery, variables: { after: cursor, ...(!inventory ? { query: filter } : {}) } }),
    });
    const payload = await response.json();
    if (!response.ok || payload.errors?.length || !payload.data) {
      const e = new Error(payload.errors?.some(e => e.extensions?.code === 'THROTTLED') || response.status === 429 ? 'source_rate_limited' : 'shopify_evidence_failed');
      // GraphQL validation messages contain schema information, never bearer tokens.
      e.details = payload.errors?.map(e => String(e.message).slice(0, 300)).slice(0, 3); throw e;
    }
    const connection = inventory ? payload.data.inventoryItems : payload.data.orders;
    if (!Array.isArray(connection?.nodes) || !connection.pageInfo) throw new Error('shopify_invalid_page');
    const records = connection.nodes;
    const warnings = records.filter(r => (inventory ? r.inventoryLevels : r.lineItems)?.pageInfo?.hasNextPage).map(r => `Nested records truncated for ${r.id}; fetch remaining lines/locations before reconciliation.`);
    const scopes = payload.data.currentAppInstallation?.accessScopes?.map(s => s.handle);
    if (!inventory && !scopes?.includes('read_all_orders')) warnings.push('Order access may be restricted to 60 days; older open orders may be absent.');
    return { ...base, records, has_more: connection.pageInfo.hasNextPage, next_cursor: connection.pageInfo.endCursor, warnings, scopes, coverage: inventory ? 'Current inventory at retrieval, including inactive levels.' : filter };
  }
  const service = services.shipstation;
  if (!service.configured()) throw new Error('shipstation_not_configured');
  const shipment = source === 'shipstation_shipments', key = shipment ? 'shipments' : 'orders';
  const openStatus = { shipstation_awaiting_payment: 'awaiting_payment', shipstation_awaiting_shipment: 'awaiting_shipment', shipstation_on_hold: 'on_hold' }[source];
  const query = { page, pageSize: 100, sortBy: shipment ? 'ShipDate' : 'ModifyDate', sortDir: 'ASC', ...(shipment ? { createDateStart: since, includeShipmentItems: true } : openStatus ? { orderStatus: openStatus } : { modifyDateStart: since }) };
  const response = await fetchImpl(service.buildUrl('/' + key, query), { headers: await service.headers(), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(response.status === 429 ? 'source_rate_limited' : 'shipstation_evidence_failed');
  const payload = await response.json();
  if (!Array.isArray(payload[key]) || !Number.isInteger(payload.pages)) throw new Error('shipstation_invalid_page');
  const records = payload[key].map(r => {
    const result = pick(r, shipment ? ['shipmentId','orderId','orderKey','orderNumber','createDate','shipDate','voided','voidDate','isReturnLabel','trackingNumber','carrierCode','serviceCode','shipmentItems'] : ['orderId','orderKey','orderNumber','orderDate','createDate','modifyDate','shipDate','orderStatus','items','externallyFulfilled','externallyFulfilledBy']);
    if (r.advancedOptions) result.advancedOptions = pick(r.advancedOptions, ['warehouseId','storeId','source','mergedOrSplit','mergedIds','parentId']);
    return result;
  });
  return { ...base, records, has_more: page < payload.pages, total: payload.total, pages: payload.pages, coverage: openStatus ? `All available orders with status ${openStatus}` : `${shipment ? 'Shipment labels created' : 'Orders modified'} since ${since}. Labels do not prove carrier acceptance. Older untouched open orders are not included.` };
}
