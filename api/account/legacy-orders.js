import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { sendJson } from '../_lib/http.js';

export function projectLegacyOrderLine(payload={}){
 return {order_number:payload.Name||'',created_at:payload['Created at']||'',financial_status:payload['Financial Status']||'',fulfillment_status:payload['Fulfillment Status']||'',sku:payload['Lineitem sku']||'',name:payload['Lineitem name']||'',quantity:Number(payload['Lineitem quantity']||0),unit_price:Number(payload['Lineitem price']||0),shipping_method:payload['Shipping Method']||''};
}
// Keep continuation lines within their authenticated import/order group, then
// choose the newest imported copy of each order rather than adding copies.
export function projectCustomerLegacyOrders(rows, email) {
 const wanted=String(email||'').trim().toLowerCase();if(!wanted)return [];
 const groups=new Map();
 for(const row of rows){const name=row.payload?.Name;if(!name||!row.run_id)continue;const key=JSON.stringify([row.run_id,name]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 const latest=new Map();
 for(const group of groups.values()){
  const emails=new Set(group.map(r=>String(r.payload.Email||'').trim().toLowerCase()).filter(Boolean));
  if(emails.size!==1||!emails.has(wanted))continue;
  const header=group.find(r=>String(r.payload.Email||'').trim().toLowerCase()===wanted);
  const base=projectLegacyOrderLine(header.payload);const imported=group.reduce((t,r)=>r.imported_at>t?r.imported_at:t,'');
  if(latest.has(base.order_number)&&latest.get(base.order_number).imported>=imported)continue;
  const order={order_number:base.order_number,created_at:base.created_at,financial_status:base.financial_status,fulfillment_status:base.fulfillment_status,shipping_method:base.shipping_method};
  const seen=new Set();order.lines=[];
  for(const row of group){if(row.id&&seen.has(row.id))continue;if(row.id)seen.add(row.id);const line=projectLegacyOrderLine(row.payload);if(!line.name&&!line.sku)continue;order.lines.push({sku:line.sku,name:line.name,quantity:line.quantity,unit_price:line.unit_price});}
  latest.set(base.order_number,{imported,order});
 }
 return [...latest.values()].map(x=>x.order).sort((a,b)=>b.created_at.localeCompare(a.created_at));
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(req.method!=='GET')return sendJson(res,405,{error:'method_not_allowed'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 const sql=neon(process.env.DATABASE_URL);
 try{
  const live=await authorizeLiveRequest(req,sql,{roles:['customer','distributor']});if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
  const email=String(live.session.email||'').trim().toLowerCase();
  if(!email)return sendJson(res,403,{error:'customer_email_required'});
  const rows=await sql`
   WITH customer_orders AS (
    SELECT DISTINCT data->>'run_id' AS run_id, data#>>'{payload,Name}' AS order_number
    FROM um_rows WHERE tbl='shopify_history_rows' AND deleted=false
    AND data->>'entity' IN ('order','order_line','orders')
    AND lower(trim(data#>>'{payload,Email}'))=${email}
   )
   SELECT r.id, r.data->>'run_id' AS run_id, r.data->>'imported_at' AS imported_at, r.data->'payload' AS payload
   FROM um_rows r JOIN customer_orders c ON r.data->>'run_id'=c.run_id AND r.data#>>'{payload,Name}'=c.order_number
   WHERE r.tbl='shopify_history_rows' AND r.deleted=false AND r.data->>'entity' IN ('order','order_line','orders')
   ORDER BY r.data->>'imported_at' DESC, r.id LIMIT 10001`;
  if(rows.length>10000)return sendJson(res,422,{error:'history_too_large_contact_support'});
  return sendJson(res,200,{ok:true,read_only:true,orders:projectCustomerLegacyOrders(rows,email)});
 }catch{return sendJson(res,500,{error:'legacy_orders_failed'});}
}
