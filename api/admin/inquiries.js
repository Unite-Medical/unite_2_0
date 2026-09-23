import crypto from 'node:crypto';
import {planInquiryReview} from '../_lib/inquiryReview.js';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {sendJson,readRawBody} from '../_lib/http.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 try{const sql=neon(process.env.DATABASE_URL);const live=await authorizeLiveRequest(req,sql,{roles:['admin','sales','sales_manager']});
 if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
 const email=String(live.session.email||'').toLowerCase();
 if(live.session.role!=='admin'&&email!==(process.env.UNITE_JACOBE_EMAIL||'jacobe@unitemedical.net').toLowerCase())return sendJson(res,403,{error:'inquiry_owner_required'});
 if(req.method==='POST'){
  let b;try{b=JSON.parse((await readRawBody(req)).toString('utf8'));}catch{return sendJson(res,400,{error:'invalid_request'});}
  const existing=await sql`SELECT data FROM um_rows WHERE tbl='public_inquiries' AND id=${String(b.id)} AND deleted=false`;
  if(existing[0]?.data&&live.session.role!=='admin'&&String(existing[0].data.owner_email||'').toLowerCase()!==email)return sendJson(res,403,{error:'inquiry_owner_required'});
  const plan=planInquiryReview(existing[0]?.data,b,live.session);
  if(!plan.ok)return sendJson(res,plan.error==='inquiry_changed_refresh'?409:400,{error:plan.error});
  const audit={id:crypto.randomUUID(),kind:'inquiry.reviewed',ref_id:b.id,actor_id:live.session.user_id,created_at:plan.row.reviewed_at,payload:{status:plan.row.status,note:plan.row.review_note}};
  const saved=await sql`WITH changed AS (
    UPDATE um_rows SET data=${JSON.stringify(plan.row)}::jsonb,updated_at=now()
    WHERE tbl='public_inquiries' AND id=${String(b.id)} AND deleted=false AND COALESCE((data->>'review_version')::int,0)=${Number(b.version)} RETURNING id
   ),task_update AS (
    UPDATE um_rows SET data=jsonb_set(data,'{status}',to_jsonb(${plan.row.status==='closed'?'completed':'open'}::text)),updated_at=now()
    WHERE tbl='tasks' AND data->>'ref_id'=${String(b.id)} AND EXISTS(SELECT 1 FROM changed) RETURNING id
   ) INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() FROM changed RETURNING id`;
  if(!saved.length)return sendJson(res,409,{error:'inquiry_changed_refresh'});
  return sendJson(res,200,{ok:true});
 }
 const rows=await sql`SELECT data FROM um_rows WHERE tbl='public_inquiries' AND deleted=false AND (${live.session.role==='admin'} OR lower(data->>'owner_email')=${email}) ORDER BY updated_at DESC LIMIT 200`;
 const notifications=await sql`SELECT data->>'ref_id' ref_id,data->>'status' status,data->>'last_error' error FROM um_rows WHERE tbl='inquiry_notifications' AND deleted=false AND data->>'ref_type'='public_inquiry'`;
 return sendJson(res,200,{ok:true,inquiries:rows.filter(r=>live.session.role==='admin'||String(r.data.owner_email||'').toLowerCase()===email).map(r=>({...r.data,source_ip_hash:undefined,request_hash:undefined,notification:notifications.find(n=>n.ref_id===r.data.id)||{status:r.data.notification_status}}))});
 }catch{return sendJson(res,500,{error:'inquiry_queue_unavailable'});}
}
