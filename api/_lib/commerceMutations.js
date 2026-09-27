import {canSetNewPrice} from './launchPolicy.js';
import {readCommerce,saveCommerce,validateCommercePatch,resolveSchedulePrice} from './commerceWorkspace.js';

// The UI and assistant share the same permissions and price validation.
export async function prepareCommerceChange(sql,{kind,id,patch,actor}) {
  if(kind==='customers'&&(patch?.credit_limit!==undefined||patch?.terms!==undefined||patch?.overdue_policy==='allow')&&actor.email?.toLowerCase()!=='damon@unitemedical.net')throw new Error('Damon must approve credit, terms and overdue overrides.');
  if(kind==='pricing'&&patch?.rows){const existing=await readCommerce(sql,{kind,id});const old=new Map((existing?.rows||[]).map(r=>[r.id,r]));for(const r of patch.rows){const before=old.get(r.id);if(before&&JSON.stringify(before)===JSON.stringify(r))continue;if(r.status==='active'){const product=(await sql`SELECT data FROM um_rows WHERE tbl='commerce_products' AND data->>'variant_id'=${String(r.variant_id||'')} AND deleted=false`)[0]?.data;if(!product||product.status!=='active')throw new Error('Choose an active catalog product.');if(Number(r.unit_price)!==Number(before?.unit_price)){const authority=canSetNewPrice(actor,Number(r.unit_price),Number(product.cost));if(!authority.ok)throw new Error(authority.reason==='damon_approval_required'?'This price needs Damon’s approval because its margin is below 35%.':authority.reason==='pricing_authority_required'?'Damon or Jacobe must approve a new price.':'Enter verified product cost in Product reconciliation before setting a new price.');}}}}
  if(kind==='customers'&&patch?.price_lists){if(!Array.isArray(patch.price_lists))throw new Error('Choose pricing schedules.');for(const pid of patch.price_lists){const schedule=await readCommerce(sql,{kind:'pricing',id:pid});if(!schedule||schedule.status!=='active')throw new Error('Only active schedules can be assigned.');if(schedule.customer_id&&schedule.customer_id!==id)throw new Error('Another customer’s agreed price cannot be assigned here.');}}
  if(kind==='orders'&&patch?.customer_id){const customer=await readCommerce(sql,{kind:'customers',id:patch.customer_id});if(!customer)throw new Error('Customer ID was not found.');}
  if(kind==='orders'&&patch?.lines){const current=await readCommerce(sql,{kind,id});if(!current)throw new Error('Order not found.');const c=await readCommerce(sql,{kind:'customers',id:patch.customer_id||current.customer_id});const schedules=c?await Promise.all((c.price_lists||[]).map(id=>readCommerce(sql,{kind:'pricing',id}))):[];const normalized=[];for(const line of patch.lines){let l={...line};const matches=await sql`SELECT data FROM um_rows WHERE tbl='commerce_products' AND data->>'sku'=${String(l.sku||'')} AND deleted=false`;const product=matches.length===1?matches[0].data:matches.find(r=>r.data.variant_id===l.variant_id)?.data;if(product){l.variant_id=product.variant_id;l.product_id=product.id;l.mapping_status='matched';}else{l.mapping_status='needs_review';}if(!current.historical&&!l.removed&&Number(l.quantity)>0){if(!product||product.status!=='active')throw new Error('Match each draft item to an active product.');if(l.manual_price){const approved=canSetNewPrice(actor,Number(l.unit_price),Number(product.cost));if(!approved.ok)throw new Error('A manual price needs verified cost and pricing approval.');}else{const priced=resolveSchedulePrice(product,Number(l.quantity),schedules);l.unit_price=priced.unit_price;l.pricing_source=priced.source;}}normalized.push(l);}patch={...patch,lines:normalized};}

 const current=await readCommerce(sql,{kind,id});
 if(kind==='orders'&&current?.operational_order_id&&Object.keys(patch).some(key=>['lines','customer_id','shipping_address','billing_address','workflow_state'].includes(key)))throw new Error('This order is already in operations. Use the order workflow to review changes.');
 if(!current)throw new Error('Record not found.');
 validateCommercePatch(kind,current,patch);
 return {current,patch};
}
export async function saveAuthorizedCommerce(sql,request){
 const prepared=await prepareCommerceChange(sql,request);
 const saved=await saveCommerce(sql,{...request,patch:prepared.patch});
 if(request.kind==='orders'&&saved.operational_order_id){const mirror=Object.fromEntries(['notes','tags'].filter(k=>k in prepared.patch).map(k=>[k,prepared.patch[k]]));if(Object.keys(mirror).length)await sql`UPDATE um_rows SET data=data||${JSON.stringify(mirror)}::jsonb,updated_at=now() WHERE tbl='orders' AND id=${saved.operational_order_id} AND deleted=false`;}
 return saved;
}
