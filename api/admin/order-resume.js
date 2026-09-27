import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {orderApprovalGate} from '../_lib/orderApproval.js';
import {ensureOrderPayment} from '../orders/place.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 try{
  const sql=neon(process.env.DATABASE_URL),live=await authorizeLiveRequest(req,sql,{roles:['admin']});
  if(!live.ok)return sendJson(res,403,{error:live.reason});
  const b=JSON.parse((await readRawBody(req)).toString('utf8'));
  const rows=await sql`SELECT data FROM um_rows WHERE tbl='orders' AND id=${String(b.order_id||'')} AND deleted=false`;
  const order=rows[0]?.data,gate=orderApprovalGate(order);
  if(!gate.ok)return sendJson(res,409,{error:gate.reason});
  if(['cancelled','refunded','shipped','delivered'].includes(order.status))return sendJson(res,409,{error:'order_already_closed'});
  if(order.payment_url||['paid','terms_approved'].includes(order.payment_status))return sendJson(res,200,{ok:true,message:'Payment is already set up. Continue in fulfillment.'});
  if(order.totals_verified!==true)return sendJson(res,409,{error:'review_delivered_price_before_payment'});
  const items=await sql`SELECT data FROM um_rows WHERE tbl='order_items' AND deleted=false AND data->>'order_id'=${order.id}`;
  const result=await ensureOrderPayment(sql,order,items.map(r=>r.data));
  if(!result.payment?.ok)return sendJson(res,409,{error:result.payment?.reason||'payment_setup_failed'});
  return sendJson(res,200,{ok:true,message:result.release&&!result.release.ok?'Terms approved; fulfillment needs review.':'Payment setup completed.',order_id:order.id});
 }catch{return sendJson(res,500,{error:'order_resume_failed'});}
}
