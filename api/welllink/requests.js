import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest,sessionFromRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {planWellRequest,publicWellRequest,reviewWellRequest,canReviewWellRequests} from '../_lib/welllinkIntake.js';

export function createWellRequestHandler({getSql=()=>process.env.DATABASE_URL?neon(process.env.DATABASE_URL):null,authorize=authorizeLiveRequest,hasSession=req=>Boolean(sessionFromRequest(req))}={}) {
  return async function handler(req,res) {
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
    if(req.method==='POST') {
      if(!String(req.headers?.['content-type']||'').startsWith('application/json'))return sendJson(res,415,{error:'json_required'});
      try {if(req.headers?.origin&&new URL(req.headers.origin).host!==req.headers.host)return sendJson(res,403,{error:'origin_not_allowed'});}catch{return sendJson(res,403,{error:'origin_not_allowed'});}
    }
    const sql=getSql();if(!sql)return sendJson(res,503,{error:'welllink_unavailable'});
    try {
      let actor=null;
      if(req.method==='GET'||hasSession(req)) {
        const live=await authorize(req,sql);
        if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:'authentication_required'});
        actor=live.session;
      }
      if(req.method==='GET') {
        const staff=req.query?.view==='staff';
        if(staff&&!canReviewWellRequests(actor))return sendJson(res,403,{error:'welllink_review_forbidden'});
        const rows=staff?await sql`SELECT data FROM um_rows WHERE tbl='welllink_requests' AND deleted=false ORDER BY updated_at DESC LIMIT 200`
          :await sql`SELECT data FROM um_rows WHERE tbl='welllink_requests' AND deleted=false AND lower(data->>'email')=${actor.email.toLowerCase()} ORDER BY updated_at DESC LIMIT 50`;
        return sendJson(res,200,{ok:true,requests:rows.map(r=>staff?r.data:publicWellRequest(r.data))});
      }
      let input;
      try {const raw=await readRawBody(req);if(raw.length>16000)return sendJson(res,413,{error:'request_too_large'});input=JSON.parse(raw.toString());if(!input||typeof input!=='object'||Array.isArray(input))throw new Error();}catch{return sendJson(res,400,{error:'invalid_request'});}
      if(input.action==='review') {
        if(!canReviewWellRequests(actor))return sendJson(res,403,{error:'welllink_review_forbidden'});
        const rows=await sql`SELECT data FROM um_rows WHERE tbl='welllink_requests' AND id=${String(input.id||'')} AND deleted=false LIMIT 1`;
        const plan=reviewWellRequest(rows[0]?.data,input,actor);
        if(!plan.ok)return sendJson(res,plan.error==='request_changed'?409:400,{error:plan.error});
        const audit={id:crypto.randomUUID(),kind:'welllink.request_reviewed',ref_id:plan.row.id,actor_id:actor.user_id,created_at:plan.row.updated_at,payload:{status:plan.row.status,note:plan.row.staff_note}};
        const changed=await sql`WITH changed AS (UPDATE um_rows SET data=${JSON.stringify(plan.row)}::jsonb,updated_at=now() WHERE tbl='welllink_requests' AND id=${plan.row.id} AND deleted=false AND (data->>'version')::integer=${input.version} RETURNING id)
          INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() FROM changed RETURNING id`;
        if(!changed.length)return sendJson(res,409,{error:'request_changed'});
        return sendJson(res,200,{ok:true,request:plan.row});
      }
      if(input.action&&input.action!=='submit')return sendJson(res,400,{error:'invalid_action'});
      const plan=planWellRequest(input,actor);
      if(!plan.ok)return sendJson(res,400,{error:plan.error,field:plan.field});
      const existing=(await sql`SELECT data FROM um_rows WHERE tbl='welllink_requests' AND id=${plan.request.id} AND deleted=false LIMIT 1`)[0]?.data;
      if(existing)return sendJson(res,existing.request_hash===plan.request.request_hash?200:409,existing.request_hash===plan.request.request_hash?{ok:true,request:{id:existing.id,status:'requested'},duplicate:true}:{error:'request_conflict'});
      const ip=String(req.headers?.['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
      const ipHash=crypto.createHash('sha256').update(ip).digest('hex');
      const recent=await sql`SELECT COUNT(*)::int AS count FROM um_rows WHERE tbl='welllink_requests' AND deleted=false AND data->>'source_ip_hash'=${ipHash} AND (data->>'created_at')::timestamptz>now()-interval '1 hour'`;
      if(Number(recent[0]?.count||0)>=10)return sendJson(res,429,{error:'too_many_requests'});
      plan.request.source_ip_hash=ipHash;
      const entries=[['welllink_requests',plan.request],['crm_leads',plan.lead],['tasks',plan.task],['audit_log',plan.audit]];
      const results=await sql.transaction(tx=>entries.map(([table,row])=>tx`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) VALUES (${table},${row.id},${JSON.stringify(row)}::jsonb,false,now()) ON CONFLICT(tbl,id) DO NOTHING RETURNING id`));
      if(!results[0]?.length) {
        const raced=(await sql`SELECT data FROM um_rows WHERE tbl='welllink_requests' AND id=${plan.request.id} AND deleted=false LIMIT 1`)[0]?.data;
        if(raced?.request_hash!==plan.request.request_hash)return sendJson(res,409,{error:'request_conflict'});
      }
      return sendJson(res,results[0]?.length?201:200,{ok:true,request:{id:plan.request.id,status:'requested'}});
    }catch{return sendJson(res,500,{error:'welllink_unavailable'});}
  };
}
export default createWellRequestHandler();
