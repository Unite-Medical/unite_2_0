import crypto from 'node:crypto';
export const COMMERCE_TABLES={customers:'commerce_customers',orders:'commerce_orders',pricing:'commerce_price_lists',products:'commerce_products'};
export const WORKFLOW_STATES=['needs_review','waiting_stock','waiting_payment','waiting_response','ready','complete','archived'];
const fields={customers:['first_name','last_name','name','email','phone','company','notes','tags','tax_exempt','tax_exemptions','certificate_status','language','email_subscription','sms_subscription','price_lists','status','terms','credit_limit','store_credit','overdue_policy','account_rep','addresses'],orders:['customer_id','notes','tags','workflow_state','review_note','shipping_address','billing_address','lines'],pricing:['name','notes','status','rows'],products:['sku','name','variant','barcode','status','review_note','cost']};
export function validateCommercePatch(kind,current,patch){
 if(!current||!fields[kind]||!patch||Array.isArray(patch)||!Object.keys(patch).length)throw new Error('Nothing to save.');
 if(Object.keys(patch).some(k=>!fields[kind].includes(k)))throw new Error('That field cannot be changed here.');
 if(JSON.stringify(patch).length>1800000)throw new Error('This edit is too large.');
 if(patch.email!==undefined&&patch.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email))throw new Error('Enter a valid email address.');
 for(const k of ['credit_limit','store_credit','cost'])if(patch[k]!==undefined&&patch[k]!==null&&(!Number.isFinite(patch[k])||patch[k]<0))throw new Error('Amounts must be zero or greater.');
 if(patch.overdue_policy&&!['hold','allow'].includes(patch.overdue_policy))throw new Error('Choose hold or allow.');
 if(patch.workflow_state&&!WORKFLOW_STATES.includes(patch.workflow_state))throw new Error('Choose an order state.');
 if(patch.tax_exempt!==undefined&&typeof patch.tax_exempt!=='boolean')throw new Error('Tax exemption must be yes or no.');
 if(patch.tags&&(!Array.isArray(patch.tags)||patch.tags.some(x=>typeof x!=='string'||x.length>100)))throw new Error('Tags must be short text labels.');
 if(patch.addresses){if(!Array.isArray(patch.addresses)||patch.addresses.length>2000)throw new Error('Invalid address book.');if(patch.addresses.filter(a=>a.is_default).length>1)throw new Error('Choose one default address.');for(const a of patch.addresses){const previous=(current.addresses||[]).find(x=>x.id===a.id);if(previous&&['recipient','company','address1','address2','city','province','zip','country','phone'].every(k=>previous[k]===a[k]))continue;if(!a.id||!a.address1||!a.city||!a.country)throw new Error('Each address needs a street, city and country.');}}
 if(patch.rows){if(!Array.isArray(patch.rows)||patch.rows.length>6000)throw new Error('Invalid price rows.');for(const r of patch.rows){if(!r.id||!Number.isFinite(Number(r.unit_price))||(r.status==='active'&&Number(r.unit_price)<=0)||Number(r.unit_price)<0||!Number.isInteger(Number(r.minimum_quantity))||Number(r.minimum_quantity)<1)throw new Error('Every price must be above zero and quantity must be a positive whole number.');if(r.status==='active'&&!r.variant_id)throw new Error('Match a product before activating a price.');}}
 if(patch.lines){if(!Array.isArray(patch.lines)||patch.lines.length>500)throw new Error('Invalid order lines.');for(const l of patch.lines){if(!l.id||!Number.isFinite(Number(l.quantity))||Number(l.quantity)<0||!Number.isFinite(Number(l.unit_price))||Number(l.unit_price)<0)throw new Error('Enter valid quantities and prices.');}}
 if(patch.workflow_state==='ready'){const address=patch.shipping_address||current.shipping_address;if(!address?.recipient||!address?.company||!address?.address1||!address?.city||!address?.zip||!address?.country)throw new Error('Before shipping, enter recipient, company, street, city, postal code and country.');if((patch.lines||current.lines||[]).some(l=>!l.removed&&l.quantity>0&&!l.sku))throw new Error('Add missing SKUs before shipping.');}
 const next={...current,...patch,revision:Number(current.revision||0)+1};if(kind==='orders'&&!next.historical&&patch.lines)next.total=Math.round(((next.lines||[]).filter(l=>!l.removed).reduce((sum,l)=>sum+Number(l.quantity)*Number(l.unit_price),0)+Number(next.shipping||0)+Number(next.tax||0))*100)/100;return next;
}
export async function readCommerce(sql,{kind='customers',id,q='',page=0,filter='',customer_id='',limit=50,selected_ids=[]}={}){
 const table=COMMERCE_TABLES[kind];if(!table)throw new Error('Unknown collection.');
 if(id){const r=await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${id} AND deleted=false`;return r[0]?.data||null;}
 const search='%'+String(q).trim().toLowerCase().replace(/[\\%_]/g,'\\$&')+'%';const offset=Math.max(0,Number(page)||0)*Math.min(100,Number(limit)||50);const size=Math.min(100,Math.max(1,Number(limit)||50));
 if(!Array.isArray(selected_ids)||selected_ids.length>5000)throw new Error('Invalid record selection.');const selected=selected_ids.map(String);
 const whereFilter=String(filter);const customer=String(customer_id);
 const result=await sql`SELECT data,COUNT(*) OVER() AS total FROM um_rows WHERE tbl=${table} AND deleted=false AND (${selected.length}=0 OR id=ANY(${selected}::text[])) AND (${search}='%%' OR lower(concat_ws(' ',data->>'name',data->>'number',data->>'email',data->>'company',data->>'sku',data->>'variant',data->>'notes',data->>'tags')) LIKE ${search}) AND (${customer}='' OR data->>'customer_id'=${customer}) AND (${whereFilter}='' OR data->>'workflow_state'=${whereFilter} OR data->>'status'=${whereFilter} OR (${whereFilter}='tax_missing' AND data->>'certificate_action_required'='true' AND data->>'certificate_status'!='verified') OR (${whereFilter}='custom' AND data->>'kind'='Customer agreement') OR (${whereFilter}='sparklayer' AND data->>'kind'='SparkLayer')) ORDER BY COALESCE(NULLIF(data->>'last_order_date',''),data->>'created_at','') DESC, id ASC LIMIT ${size} OFFSET ${offset}`;
 return {rows:result.map(({data})=>summarize(kind,data)),total:Number(result[0]?.total||0),page:Number(page)||0};
}
export function summarize(kind,r){const omit=kind==='customers'?['addresses','events','source']:kind==='orders'?['lines','source','events','transactions','remaining_review','fulfillments','review']:kind==='pricing'?['rows']:[];const result=Object.fromEntries(Object.entries(r).filter(([key])=>!omit.includes(key)));if(kind==='customers')return {...result,default_address:r.addresses?.find(a=>a.is_default),address_count:r.addresses?.length||0};if(kind==='orders')return {...result,item_count:r.lines?.reduce((n,l)=>n+Number(l.quantity||0),0),line_count:r.lines?.length||0};if(kind==='pricing')return {...result,row_count:r.rows.length,active_count:r.rows.filter(p=>p.status==='active').length,held_count:r.rows.filter(p=>p.status==='held').length};return result;}

export async function saveCommerce(sql,{kind,id,revision,patch,actor}){
 const current=await readCommerce(sql,{kind,id});if(!current)throw new Error('Record not found.');
 if(Number(revision)!==Number(current.revision||0))throw new Error('This record changed. Refresh before saving.');
 const next=validateCommercePatch(kind,current,patch);const at=new Date().toISOString();const event={id:crypto.randomUUID(),at,actor:actor.name||actor.email||actor.user_id,text:'Updated '+Object.keys(patch).map(k=>k.replaceAll('_',' ')).join(', ')};
 next.events=[...(current.events||[]),event];next.updated_at=at;next.updated_by=actor.user_id;
 const table=COMMERCE_TABLES[kind];const result=await sql`UPDATE um_rows SET data=${JSON.stringify(next)}::jsonb,updated_at=now() WHERE tbl=${table} AND id=${id} AND deleted=false AND COALESCE((data->>'revision')::integer,0)=${Number(revision)} RETURNING id`;
 if(!result.length)throw new Error('This record changed. Refresh before saving.');return next;
}
export async function searchCommerce(sql,q,category='all'){const kinds=category==='all'?Object.keys(COMMERCE_TABLES):[category];const results=await Promise.all(kinds.filter(k=>COMMERCE_TABLES[k]).map(async kind=>({kind,...await readCommerce(sql,{kind,q,limit:8})})));return results;}

export function resolveSchedulePrice(product,quantity,schedules){
 const qty=Number(quantity);if(!Number.isInteger(qty)||qty<1)throw new Error('Quantity must be a positive whole number.');
 for(const schedule of schedules){if(!schedule||schedule.status!=='active')continue;const eligible=schedule.rows.filter(r=>r.status==='active'&&r.variant_id===product.variant_id&&Number(r.minimum_quantity)<=qty&&Number(r.unit_price)>0).sort((a,b)=>Number(b.minimum_quantity)-Number(a.minimum_quantity));if(eligible.length)return {unit_price:Number(eligible[0].unit_price),source:schedule.name,schedule_id:schedule.id,row_id:eligible[0].id,minimum_quantity:Number(eligible[0].minimum_quantity)};}
 return {unit_price:Number(product.retail),source:'Retail',minimum_quantity:1};
}
