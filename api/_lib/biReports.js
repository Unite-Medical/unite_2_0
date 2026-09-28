import { BI_SOURCES } from './biSources.js';
import { biRepository, pipelineStatus } from './biPipeline.js';
import { summarizeShopifyOrders } from './businessIntelligence.js';

export const BI_TOPICS = ['overview','purchasing','inventory','sales','receivables','payables','payments','shipping','data_quality'];
const dependencies = {
  purchasing: ['qbo_pos','qbo_items'], inventory: ['shopify_inventory','qbo_items','unite_inventory'], sales: ['shopify_all_orders'],
  receivables: ['qbo_invoices'], payables: ['qbo_bills'], payments: ['stripe_balance_transactions'],
  shipping: ['shipstation_orders','shipstation_awaiting_payment','shipstation_awaiting_shipment','shipstation_on_hold','shopify_all_orders'],
};
const num = x => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) ? Number(x) : null;
const money = n => Math.round((n + Number.EPSILON)*100)/100;
const dateIn = (date, start, end) => Boolean(date) && (!start || date.slice(0,10)>=start) && (!end || date.slice(0,10)<=end);
function currencyTotals(rows, field, group = () => '') {
  const buckets = new Map();
  for (const row of rows) {
    const key = `${group(row)}:${row.currency || 'UNKNOWN'}`;
    const b = buckets.get(key) || { group: group(row), currency: row.currency || 'UNKNOWN', records: 0, amount: 0, missing_amounts: 0 };
    b.records++; if (num(row[field]) === null) b.missing_amounts++; else b.amount += num(row[field]); buckets.set(key,b);
  }
  return [...buckets.values()].map(b=>({...b,amount:money(b.amount)}));
}
export function summarizeBiTopic(topic, data, filters = {}) {
  const { start='', end='', sku='', location='' } = filters;
  let rows = [], summary = {}, definitions = [];
  if (topic === 'purchasing') {
    const items = new Map((data.qbo_items || []).map(r=>[r.Id,r]));
    rows = (data.qbo_pos || []).filter(r=>dateIn(r.TxnDate,start,end)).flatMap(po=>(po.Line || []).map((l,i)=>{
      const detail = l.ItemBasedExpenseLineDetail || {}, item = items.get(detail.ItemRef?.value) || {};
      return { po_id: po.Id, po_number: po.DocNumber || '', date: po.TxnDate, vendor: po.VendorRef?.name || po.VendorRef?.value || '', status: po.POStatus,
        line_id: l.Id || String(i+1), item_id: detail.ItemRef?.value || '', sku: item.Sku || '', item: item.Name || detail.ItemRef?.name || l.Description || '',
        ordered_quantity: num(detail.Qty), unit_price: num(detail.UnitPrice), amount: num(l.Amount), currency: po.CurrencyRef?.value || 'UNKNOWN',
        unit_status: 'Unverified source unit', linked_bills: [...(po.LinkedTxn || []), ...(l.LinkedTxn || [])].filter(t=>t.TxnType==='Bill').map(t=>t.TxnId).join(', ') };
    })).filter(r=>!sku || r.sku===sku || r.item===sku);
    summary = { purchase_orders: new Set(rows.map(r=>r.po_id)).size, lines: rows.length, open_purchase_orders: new Set(rows.filter(r=>r.status==='Open').map(r=>r.po_id)).size,
      by_vendor: currencyTotals(rows,'amount',r=>r.vendor), by_status: currencyTotals(rows,'amount',r=>r.status), lines_without_sku: rows.filter(r=>!r.sku).length };
    definitions = ['Amounts are PO line amounts in source currency. Quantities retain purchasing units; units have not been reconciled to warehouse stock.', 'Open means a purchasing commitment. Closed POs and linked bills do not prove physical receipt. SKU filter also accepts an exact QBO item-name candidate; this is not a verified mapping.'];
  }
  if (topic === 'inventory') {
    const names = new Map(), codes = new Map();
    for (const i of data.qbo_items || []) { if(i.Name) names.set(i.Name,[...(names.get(i.Name)||[]),i.Id]); if(i.Sku) codes.set(i.Sku,[...(codes.get(i.Sku)||[]),i.Id]); }
    const skuCounts = new Map(); for (const i of data.shopify_inventory || []) if(i.sku)skuCounts.set(i.sku,(skuCounts.get(i.sku)||0)+1);
    rows = (data.shopify_inventory || []).flatMap(i=>(i.inventoryLevels?.nodes || []).map(level=>{
      const q = Object.fromEntries((level.quantities || []).map(q=>[q.name,q.quantity]));
      return { inventory_id:i.id, variant_id:i.variant?.id, sku:i.sku||'', item:i.variant?.product?.title || '', location:level.location?.name || '', active_location:level.location?.isActive,
        tracked:i.tracked, on_hand:num(q.on_hand), available:num(q.available), committed:num(q.committed), incoming:num(q.incoming),
        flags:[!i.sku&&'Missing SKU',skuCounts.get(i.sku)>1&&'Duplicate SKU',num(q.on_hand)!==null&&q.on_hand<0&&'Negative on hand',num(q.available)!==null&&q.available<0&&'Negative available',!i.tracked&&'Not tracked',!level.location?.isActive&&'Inactive location'].filter(Boolean).join('; '),
        qbo_candidate_ids:(codes.get(i.sku)||names.get(i.sku)||[]).join(', '), mapping_status:codes.has(i.sku)?'SKU candidate; verify unit/pack':names.has(i.sku)?'Name candidate; verify identity/unit':'Not mapped' };
    })).filter(r=>(!sku||r.sku===sku)&&(!location||r.location===location));
    const internal = data.unite_inventory || [];
    summary = { inventory_location_rows:rows.length, negative_on_hand_rows:rows.filter(r=>r.on_hand!==null&&r.on_hand<0).length, missing_sku_rows:rows.filter(r=>!r.sku).length,
      duplicate_sku_rows:rows.filter(r=>r.flags.includes('Duplicate SKU')).length, locations:[...new Set(rows.map(r=>r.location))].map(location=>({location,rows:rows.filter(r=>r.location===location).length,negative_on_hand_rows:rows.filter(r=>r.location===location&&r.on_hand!==null&&r.on_hand<0).length})),
      internal_receipt_records:internal.filter(r=>r.tbl==='po_receipts').length, internal_count_records:internal.filter(r=>['count_lines','warehouse_counts'].includes(r.tbl)).length,
      provisional_internal_inventory_rows:internal.filter(r=>r.tbl==='inventory'&&(r.data?.test_batch||r.data?.physical_count_required)).length };
    definitions = ['Snapshot inventory is provisional until physical counts and pack sizes are confirmed. Missing levels are unknown, not zero. Do not sum heterogeneous SKU units into a warehouse count.', 'Available already reflects commitments. Do not deduct open-order demand from it again. Date filters do not reconstruct historical inventory; this is the published snapshot.'];
    rows.sort((a,b)=>Number(b.on_hand!==null&&b.on_hand<0)-Number(a.on_hand!==null&&a.on_hand<0)||a.location.localeCompare(b.location)||a.sku.localeCompare(b.sku));
  }
  if (topic === 'sales') {
    const orders = (data.shopify_all_orders || []).filter(r=>dateIn(r.createdAt,start,end));
    summary = summarizeShopifyOrders(orders);
    rows = orders.filter(r=>!r.test&&!r.cancelledAt).map(r=>({ order_id:r.id, order:r.name, created_at:r.createdAt, customer:r.customer?.displayName || 'Guest', customer_id:r.customer?.id || null,
      currency:r.currentTotalPriceSet?.shopMoney?.currencyCode, current_order_value:num(r.currentTotalPriceSet?.shopMoney?.amount), payment_status:r.displayFinancialStatus, fulfillment_status:r.displayFulfillmentStatus }));
    definitions = ['Non-test, non-cancelled orders created in the selected UTC date cohort, using current values at collection. This is not accounting revenue or cash received.', 'Lifetime refunds may fall outside the period and are already reflected where applicable in current order values. Do not subtract them again or add this total to QuickBooks revenue.'];
  }
  if (topic === 'receivables' || topic === 'payables') {
    const source = topic==='receivables'?'qbo_invoices':'qbo_bills';
    rows=(data[source]||[]).filter(r=>dateIn(r.TxnDate,start,end)).map(r=>({id:r.Id,number:r.DocNumber||'',date:r.TxnDate,due_date:r.DueDate||null,party:(r.CustomerRef||r.VendorRef)?.name||(r.CustomerRef||r.VendorRef)?.value||'',currency:r.CurrencyRef?.value||'UNKNOWN',original_amount:num(r.TotalAmt),current_balance:num(r.Balance)}));
    summary={documents:rows.length,with_balance:rows.filter(r=>r.current_balance>0).length,current_balances_by_currency:currencyTotals(rows,'current_balance'),by_party:currencyTotals(rows,'current_balance',r=>r.party)};
    definitions=['Balances are current at collection for documents dated in the selected range, not historical balances at the report end date. Use the QuickBooks aging statement for historical/as-of aging. Unapplied credits and payments are not netted here.'];
  }
  if (topic === 'payments') {
    rows=(data.stripe_balance_transactions||[]).filter(r=>dateIn(new Date(r.created*1000).toISOString(),start,end)).map(r=>({id:r.id,created_at:new Date(r.created*1000).toISOString(),currency:r.currency,type:r.type,category:r.reporting_category,status:r.status,amount_minor:num(r.amount),fee_minor:num(r.fee),net_minor:num(r.net),source_id:r.source||null}));
    summary={balance_transactions:rows.length,by_type_and_currency:currencyTotals(rows,'net_minor',r=>r.type).map(({amount,...r})=>({...r,net_minor:amount})),fees_by_currency:currencyTotals(rows,'fee_minor').map(({amount,...r})=>({...r,fee_minor:amount}))};
    definitions=['Stripe balance movements in integer currency minor units, grouped by transaction creation UTC date. Payout movements are not sales. Net activity is not profit.', 'Charges, invoices, balance movements and payouts overlap. Never add them together or combine them with Shopify/QuickBooks revenue. Currency minor units are not universally hundredths.'];
  }
  if (topic === 'shipping') {
    const orders = new Map();
    for (const key of ['shipstation_orders','shipstation_awaiting_payment','shipstation_awaiting_shipment','shipstation_on_hold']) for (const r of data[key]||[]) {
      const old=orders.get(r.orderId); if(!old||String(r.modifyDate)>=String(old.modifyDate))orders.set(r.orderId,r);
    }
    const shop=new Map((data.shopify_all_orders||[]).filter(o=>!o.test&&!o.cancelledAt).map(o=>[o.id.split('/').at(-1),o]));
    rows=[...orders.values()].flatMap(r=>(r.items||[{}]).map(line=>{
      const order=shop.get(String(r.orderKey||'').split('-')[0]), match=order?.lineItems?.nodes?.find(l=>String(line.lineItemKey)===l.id.split('/').at(-1));
      return {order_id:String(r.orderId),order:r.orderNumber,status:r.orderStatus,store_id:String(r.advancedOptions?.storeId||''),sku:line.sku||'',item:line.name||'',quantity:num(line.quantity),shopify_order:order?.name||'',shopify_line_id:match?.id||'',shopify_unfulfilled:num(match?.unfulfilledQuantity),match:match?'Order ID and line ID':order?'Order ID only':'No matching Shopify ID'};
    })).filter(r=>!sku||r.sku===sku);
    // Sum split active ShipStation lines before comparing to one Shopify line.
    const active=['awaiting_payment','awaiting_shipment','on_hold']; const groups=new Map();
    for(const r of rows)if(active.includes(r.status)&&r.shopify_line_id){const g=groups.get(r.shopify_line_id)||{shopify_order:r.shopify_order,sku:r.sku,shopify_unfulfilled:r.shopify_unfulfilled,shipstation_active_quantity:0,order_ids:[]};if(r.quantity!==null)g.shipstation_active_quantity+=r.quantity;g.order_ids.push(r.order_id);groups.set(r.shopify_line_id,g);}
    summary={orders:new Set(rows.map(r=>r.order_id)).size,active_orders:new Set(rows.filter(r=>active.includes(r.status)).map(r=>r.order_id)).size,matched_quantity_differences:[...groups.values()].filter(g=>g.shopify_unfulfilled!==null&&g.shipstation_active_quantity!==g.shopify_unfulfilled),by_status:[...new Set(rows.map(r=>r.status))].map(status=>({status,orders:new Set(rows.filter(r=>r.status===status).map(r=>r.order_id)).size}))};
    definitions=['Recent modified orders plus all active-status orders, deduplicated by ShipStation order ID. Historical untouched closed orders are outside the recent window. Dates do not change this operational snapshot.', 'ID matching is deterministic; order-number resemblance alone is not a match. Split active lines are summed before comparison. Labels/shipped status do not prove carrier acceptance, physical stock, or restocking.'];
  }
  return {summary,rows,definitions};
}
export async function readBiReport(sql, input = {}) {
  const {topic='overview',start='',end='',sku='',location=''}=input;
  if(!BI_TOPICS.includes(topic))throw new Error('invalid_bi_topic');
  for(const date of [start,end].filter(Boolean))if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('invalid_report_dates');
  if(start&&end&&start>end)throw new Error('invalid_report_dates');
  const offset=Number(input.offset||0),limit=Number(input.limit||50);
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>200||String(sku).length>150||String(location).length>200)throw new Error('invalid_bi_report_filters');
  const sources=pipelineStatus(await biRepository(sql).states());
  if(topic==='overview'||topic==='data_quality')return {topic,generated_at:new Date().toISOString(),sources,definitions:['Completed source snapshots are published independently. Refreshes are daily and resumable; check timestamps. This is not a transactionally consistent cross-provider snapshot.','Sources without a published snapshot are unavailable, never zero. Missing unit/cost mappings and physical receipts prevent verified inventory valuation or SKU profit.','Financial statements are generated live with read_business_report. Shipment labels are not proof of stock movement.'],summary:{sources: sources.length,with_published_data:sources.filter(s=>s.published).length,stale:sources.filter(s=>s.published?.stale).length,needs_attention:sources.filter(s=>!s.published||s.error||s.published.status!=='ready').length},rows:sources,total_rows:sources.length,has_more:false};
  const selected=sources.filter(s=>dependencies[topic].includes(s.source)),data={};
  for(const s of selected){
    if(!s.published)continue;
    const generation=s.published.generation;
    const loaded=await sql`SELECT data->'record' AS record FROM um_rows WHERE tbl='bi_records' AND id>=${generation+':'} AND id<${generation+';'} AND deleted=false ORDER BY id LIMIT 100001`;
    if(loaded.length>100000)throw new Error('bi_report_record_limit');
    data[s.source]=loaded.map(r=>r.record);
  }
  const result=summarizeBiTopic(topic,data,{start,end,sku,location});
  const unavailable=selected.filter(s=>!s.published).map(s=>BI_SOURCES[s.source]);
  const status=unavailable.length===selected.length?'unavailable':selected.some(s=>!s.published||s.published.status!=='ready'||s.published.stale||s.error)?'partial':'ready';
  // Explicit null avoids a missing source becoming a zero-valued business result.
  return {topic,status,generated_at:new Date().toISOString(),filters:{start,end,sku,location},sources:selected,unavailable,
    definitions:result.definitions,summary:unavailable.length?null:Object.fromEntries(Object.entries(result.summary).map(([key,value])=>[key,Array.isArray(value)?{rows:value.slice(0,100),total_rows:value.length,truncated:value.length>100}:value])),
    rows:result.rows.slice(offset,offset+limit),total_rows:result.rows.length,offset,has_more:offset+limit<result.rows.length};
}
