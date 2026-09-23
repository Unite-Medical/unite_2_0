import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody,sendJson } from '../_lib/http.js';
import { planOrderApproval } from '../_lib/orderApproval.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 const sql=neon(process.env.DATABASE_URL);
 try{
  const live=await authorizeLiveRequest(req,sql,{roles:['admin']});if(!live.ok)return sendJson(res,403,{error:live.reason});
  const body=JSON.parse((await readRawBody(req)).toString('utf8'));
  const rows=await sql`SELECT data FROM um_rows WHERE tbl='orders' AND id=${String(body.order_id||'')} AND deleted=false`;
  const before=rows[0]?.data;const plan=planOrderApproval({order:before,actor:live.session,action:body.action,reason:body.reason});
  if(!plan.ok)return sendJson(res,400,{error:plan.reason});
  const audit={id:crypto.randomUUID(),kind:'order.approval',ref_id:before.id,actor_id:live.session.user_id,payload:plan.approval,created_at:new Date().toISOString()};
  const changed=await sql`WITH changed AS (
   UPDATE um_rows SET data=${JSON.stringify(plan.order)}::jsonb,updated_at=now() WHERE tbl='orders' AND id=${before.id} AND deleted=false AND data=${JSON.stringify(before)}::jsonb RETURNING id
  ) INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() FROM changed RETURNING id`;
  if(!changed.length)return sendJson(res,409,{error:'order_changed_review_again'});
  return sendJson(res,200,{ok:true,approval:plan.approval});
 }catch{return sendJson(res,500,{error:'approval_failed'});}
}
