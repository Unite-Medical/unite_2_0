import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {sendJson} from '../_lib/http.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');if(req.method!=='GET')return sendJson(res,405,{error:'method_not_allowed'});if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});const sql=neon(process.env.DATABASE_URL);
 try{const live=await authorizeLiveRequest(req,sql,{roles:['admin']});if(!live.ok)return sendJson(res,403,{error:live.reason});const id=String(req.query.order_id||'');
  const orders=await sql`SELECT data FROM um_rows WHERE tbl='orders' AND id=${id} AND deleted=false`;if(!orders.length)return sendJson(res,404,{error:'order_not_found'});
  const rows=await sql`SELECT tbl,data FROM um_rows WHERE deleted=false AND tbl IN ('order_items','invoices','payments','payment_requests','purchase_orders','po_receipts','reservations','shipments','returns','backorders','tasks','audit_log','customerio_outbox') AND (data->>'order_id'=${id} OR data->>'ref_id'=${id} OR data->>'parent_order_id'=${id}) ORDER BY updated_at DESC LIMIT 501`;
  if(rows.length>500)return sendJson(res,422,{error:'order_history_requires_export'});
  return sendJson(res,200,{ok:true,order:orders[0].data,events:rows.map(r=>({id:r.data.id,type:r.tbl,status:r.data.status||r.data.kind||'',at:r.data.updated_at||r.data.created_at||r.data.placed_at||null,description:r.data.subject||r.data.name||r.data.reason||'',actor:r.data.actor_id||r.data.owner_email||null}))});
 }catch{return sendJson(res,500,{error:'order_detail_unavailable'});}
}
