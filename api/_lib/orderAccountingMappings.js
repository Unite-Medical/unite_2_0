import crypto from 'node:crypto';
import {qboAccessContext} from './qboTokens.js';
export async function accountingChoices(sql){
 const context=await qboAccessContext(sql),root=context.environment==='production'?'https://quickbooks.api.intuit.com':'https://sandbox-quickbooks.api.intuit.com';
 const result={};
 for(const entity of ['Customer','Item','TaxCode']){
  const rows=[];
  for(let start=1;start<=10000;start+=1000){
   const query=`select * from ${entity} where Active = true startposition ${start} maxresults 1000`;
   const response=await fetch(root+'/v3/company/'+encodeURIComponent(context.realmId)+'/query?minorversion=75&query='+encodeURIComponent(query),{headers:{Authorization:'Bearer '+context.accessToken,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('Could not read QuickBooks records. Check the connection.');
   const data=await response.json(),page=data.QueryResponse?.[entity]||[];rows.push(...page);if(page.length<1000)break;
   if(start===9001)throw new Error('This QuickBooks catalog needs a larger import before matching.');
  }
  result[entity]=rows.filter(r=>entity!=='Item'||['Inventory','NonInventory','Service'].includes(r.Type)).map(r=>({id:String(r.Id),name:r.DisplayName||r.FullyQualifiedName||r.Name,sku:r.Sku||''}));
 }
 return {...result,realmId:context.realmId};
}
export async function saveAccountingMappings(sql,source,input,actor){
 if(!source.operational_order_id)throw new Error('Create the order before matching accounting records.');
 const choices=await accountingChoices(sql);
 const check=(entity,id,required=true)=>{if(!id&&!required)return '';if(!choices[entity].some(r=>r.id===String(id)))throw new Error('Choose an existing QuickBooks '+entity.toLowerCase()+'.');return String(id);};
 const customerId=check('Customer',input.customer_id),shipping=check('Item',input.shipping_item_id,source.shipping>0),tax=check('TaxCode',input.tax_code_id,source.tax>0);
 const items=source.lines.map(l=>({id:l.product_id,qbo_item_id:check('Item',input.items?.[l.product_id])}));
 const now=new Date().toISOString(),settings={id:'qbo',realm_id:choices.realmId,...(shipping?{shipping_item_id:shipping}:{}),...(tax?{tax_code_id:tax}:{}),updated_at:now};
 const audit={id:crypto.randomUUID(),kind:'order.accounting_mapping',actor_id:actor.user_id,ref_id:source.id,created_at:now,payload:{customer_id:customerId,items,shipping,tax,realm_id:choices.realmId}};
 await sql.transaction(tx=>[
  tx`UPDATE um_rows SET data=data||${JSON.stringify({qbo_customer_id:customerId,qbo_realm_id:choices.realmId})}::jsonb||jsonb_build_object('revision',COALESCE((data->>'revision')::integer,0)+1),updated_at=now() WHERE tbl='commerce_customers' AND id=${source.customer_id} AND deleted=false`,
  ...items.map(item=>tx`UPDATE um_rows SET data=data||${JSON.stringify({qbo_item_id:item.qbo_item_id,qbo_realm_id:choices.realmId})}::jsonb||jsonb_build_object('revision',COALESCE((data->>'revision')::integer,0)+1),updated_at=now() WHERE tbl='commerce_products' AND id=${item.id} AND deleted=false`),
  tx`INSERT INTO um_rows(tbl,id,data) VALUES('accounting_settings','qbo',${JSON.stringify(settings)}::jsonb) ON CONFLICT(tbl,id) DO UPDATE SET data=um_rows.data||excluded.data,updated_at=now()`,
  tx`INSERT INTO um_rows(tbl,id,data) VALUES('audit_log',${audit.id},${JSON.stringify(audit)}::jsonb)`,
 ]);
 return {ok:true};
}
