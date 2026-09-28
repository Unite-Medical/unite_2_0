import { readEvidencePage } from './inventoryEvidence.js';
import { SERVICES } from './services.js';

export const BI_SOURCES = {
  qbo_pos: 'QuickBooks purchase orders', qbo_items: 'QuickBooks items',
  qbo_bills: 'QuickBooks bills', qbo_purchases: 'QuickBooks expenses', qbo_vendor_credits: 'QuickBooks vendor credits',
  qbo_invoices: 'QuickBooks invoices', qbo_payments: 'QuickBooks payments',
  qbo_customers: 'QuickBooks customers', qbo_vendors: 'QuickBooks vendors',
  shopify_inventory: 'Shopify inventory by location', shopify_all_orders: 'Shopify order history',
  shipstation_orders: 'ShipStation recent orders', shipstation_shipments: 'ShipStation recent labels',
  shipstation_awaiting_payment: 'ShipStation awaiting payment', shipstation_awaiting_shipment: 'ShipStation awaiting shipment', shipstation_on_hold: 'ShipStation on hold',
  stripe_invoices: 'Stripe invoices', stripe_charges: 'Stripe charges', stripe_payouts: 'Stripe payouts', stripe_balance_transactions: 'Stripe balance activity',
  unite_inventory: 'Unite warehouse records',
};
const stripeFields = ['id','created','currency','amount','amount_paid','amount_due','amount_remaining','amount_refunded','fee','net','type','reporting_category','status','paid','refunded','captured','customer','invoice','payment_intent','balance_transaction','source','arrival_date','available_on','livemode','number','total','subtotal','due_date'];
export function biRecordId(source, row) {
  const id = source === 'unite_inventory' ? `${row.tbl}:${row.id}` : source.startsWith('qbo_') ? row.Id : source === 'shipstation_shipments' ? row.shipmentId : source.startsWith('shipstation_') ? row.orderId : row.id;
  if (id == null || String(id).length > 250) throw new Error('source_record_id_missing');
  return String(id);
}
export async function readBiSourcePage(sql, state, { fetchImpl = fetch, evidence = readEvidencePage, services = SERVICES, env = process.env } = {}) {
  const { source, page, cursor, since } = state;
  if (!Object.hasOwn(BI_SOURCES, source)) throw new Error('invalid_bi_source');
  if (source.startsWith('stripe_')) {
    if (!env.STRIPE_AGENT_API_KEY) throw new Error('stripe_read_key_not_configured');
    const resource = source.slice(7), url = new URL(`https://api.stripe.com/v1/${resource}`);
    url.searchParams.set('limit', '100');
    url.searchParams.set('created[lte]', String(Math.floor(Date.parse(state.started_at) / 1000)));
    if (cursor) url.searchParams.set('starting_after', cursor);
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${env.STRIPE_AGENT_API_KEY}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(response.status === 429 ? 'source_rate_limited' : response.status === 403 ? 'stripe_read_permission_missing' : 'stripe_read_failed');
    const payload = await response.json();
    if (!Array.isArray(payload.data) || typeof payload.has_more !== 'boolean') throw new Error('stripe_invalid_page');
    return { source, page, retrieved_at: new Date().toISOString(), has_more: payload.has_more, next_cursor: payload.data.at(-1)?.id || null,
      records: payload.data.map(r => Object.fromEntries(stripeFields.filter(k => r[k] !== undefined && (r[k] === null || typeof r[k] !== 'object')).map(k => [k, r[k]]))),
      identity: 'stripe-key:' + (await import('node:crypto')).createHash('sha256').update(env.STRIPE_AGENT_API_KEY).digest('hex').slice(0, 16),
      warnings: payload.data.some(r => r.livemode === false) ? ['Stripe contains test-mode records. Do not report these as live activity.'] : [],
      coverage: 'All accessible records created through refresh start. Amounts are integer currency minor units. Balance activity, charges, invoices and payouts overlap; never sum them as revenue.' };
  }
  let scopedServices = services;
  if (source.startsWith('shipstation_')) {
    if (!env.SHIPSTATION_STORE_ID) throw new Error('shipstation_unite_store_not_configured');
    scopedServices = { ...services, shipstation: { ...services.shipstation, buildUrl: (path, query) => services.shipstation.buildUrl(path, { ...query, storeId: env.SHIPSTATION_STORE_ID }) } };
  }
  const result = await evidence(sql, { source, page, cursor, since, until: state.started_at }, { services: scopedServices, fetchImpl });
  if (source.startsWith('shipstation_')) {
    // Never silently include an explicitly different store in Unite reporting.
    if (result.records.some(r => r.advancedOptions?.storeId != null && String(r.advancedOptions.storeId) !== String(env.SHIPSTATION_STORE_ID))) throw new Error('shipstation_store_scope_mismatch');
    result.identity = `shipstation:${env.SHIPSTATION_STORE_ID}`;
    result.coverage += ` API filter: store ${env.SHIPSTATION_STORE_ID}. Store ownership is not proof of warehouse ownership.`;
  } else if (source.startsWith('qbo_')) result.identity = `qbo:${result.environment}:${result.company_id}`;
  else if (source.startsWith('shopify_')) result.identity = `shopify:${env.SHOPIFY_STORE_DOMAIN}`;
  else result.identity = 'unite-workspace';
  if (result.environment === 'sandbox') result.warnings.push('QuickBooks sandbox company: test accounting data.');
  return result;
}
