import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {deliverInquiryNotification} from '../_lib/inquiryDelivery.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 try{
  const sql=neon(process.env.DATABASE_URL),live=await authorizeLiveRequest(req,sql,{roles:['admin','sales','sales_manager']});
  if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
  if(live.session.role!=='admin'&&String(live.session.email||'').toLowerCase()!==(process.env.UNITE_JACOBE_EMAIL||'jacobe@unitemedical.net').toLowerCase())return sendJson(res,403,{error:'inquiry_owner_required'});
  const body=JSON.parse((await readRawBody(req)).toString('utf8'));
  const id=String(body.inquiry_id||'');
  const inquiries=await sql`SELECT data FROM um_rows WHERE tbl='public_inquiries' AND id=${id} AND deleted=false`;
  if(!inquiries.length)return sendJson(res,404,{error:'inquiry_not_found'});
  if(live.session.role!=='admin'&&String(inquiries[0].data.owner_email||'').toLowerCase()!==String(live.session.email||'').toLowerCase())return sendJson(res,403,{error:'inquiry_owner_required'});
  // Only definite provider rejection can be requeued. Unknown/accepted sends
  // require provider reconciliation, never an automatic second notification.
  const rows=await sql`UPDATE um_rows SET data=data || ${JSON.stringify({status:'queued',retry_requested_by:live.session.user_id,retry_requested_at:new Date().toISOString()})}::jsonb,updated_at=now() WHERE tbl='inquiry_notifications' AND data->>'ref_id'=${id} AND data->>'status'='delivery_failed' AND deleted=false RETURNING id`;
  if(!rows.length)return sendJson(res,409,{error:'notification_not_retryable'});
  const result=await deliverInquiryNotification(sql,id);
  return sendJson(res,200,{ok:true,notification_status:result.status});
 }catch{return sendJson(res,500,{error:'notification_retry_failed'});}
}
