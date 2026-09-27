import crypto from 'node:crypto';
import {readWellDocument} from '../_lib/welllinkStorage.js';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {canUseWellLink,WELL_DOCUMENTS,wellBoard,wellExtension,feePreview,taskPlan} from '../_lib/welllink.js';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
  if(req.method==='POST'){
    if(!String(req.headers?.['content-type']||'').toLowerCase().startsWith('application/json'))return sendJson(res,415,{error:'json_required'});
    const origin=req.headers?.origin;
    if(origin){try{if(new URL(origin).host!==req.headers.host)return sendJson(res,403,{error:'origin_not_allowed'});}catch{return sendJson(res,403,{error:'origin_not_allowed'});}}
  }
  if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
  try {
    const sql=neon(process.env.DATABASE_URL);
    const live=await authorizeLiveRequest(req,sql,{roles:['admin','sales','sales_manager','finance','warehouse_operator','warehouse_manager']});
    if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
    if(!canUseWellLink(live.session))return sendJson(res,403,{error:'welllink_access_required'});
    if(live.session.role.startsWith('warehouse_')&&req.query?.document)return sendJson(res,403,{error:'welllink_access_required'});
    if(req.method==='GET'&&req.query?.document) {
      const doc=WELL_DOCUMENTS.find(d=>d.id===req.query.document);
      if(!doc)return sendJson(res,404,{error:'document_not_found'});
      const bytes=await readWellDocument(doc.id);
      res.setHeader('Content-Type',doc.file.endsWith('.xlsx')?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="WellLink-${doc.file}"`);
      res.statusCode=200;return res.end(bytes);
    }
    if(req.method==='GET') {
      const rows=await sql`SELECT data FROM um_rows WHERE tbl='welllink_tasks' AND deleted=false`;
      return sendJson(res,200,{ok:true,...wellBoard(rows.map(r=>r.data),live.session)});
    }
    let input;
    try {const raw=await readRawBody(req);if(raw.length>12000)return sendJson(res,413,{error:'request_too_large'});input=JSON.parse(raw.toString('utf8'));if(!input||Array.isArray(input)||typeof input!=='object')throw new Error();}
    catch{return sendJson(res,400,{error:'invalid_request'});}
    if(input.action==='price_preview'||input.action==='fee_preview') {
      if(live.session.role.startsWith('warehouse_'))return sendJson(res,403,{error:'welllink_access_required'});
      try {return sendJson(res,200,{ok:true,...(input.action==='price_preview'?wellExtension(input.sku,input.cases):feePreview(input.month,input.gross))});}
      catch(error){return sendJson(res,400,{error:error.message});}
    }
    if(input.action!=='save_task')return sendJson(res,400,{error:'invalid_action'});
    const existing=await sql`SELECT data FROM um_rows WHERE tbl='welllink_tasks' AND id=${String(input.id||'')} AND deleted=false LIMIT 1`;
    const plan=taskPlan(existing[0]?.data,input,live.session);
    if(!plan.ok)return sendJson(res,plan.error==='welllink_changed_refresh'?409:400,{error:plan.error});
    const audit={id:crypto.randomUUID(),kind:'welllink.task_updated',ref_id:plan.row.id,actor_id:live.session.user_id,created_at:plan.row.updated_at,payload:plan.row};
    const result=await sql`WITH changed AS (
      INSERT INTO um_rows(tbl,id,data,deleted,updated_at)
      VALUES ('welllink_tasks',${plan.row.id},${JSON.stringify(plan.row)}::jsonb,false,now())
      ON CONFLICT(tbl,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()
      WHERE um_rows.deleted=false AND COALESCE((um_rows.data->>'version')::integer,0)=${input.version}
      RETURNING id
    ) INSERT INTO um_rows(tbl,id,data,deleted,updated_at)
      SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() FROM changed RETURNING id`;
    if(!result.length)return sendJson(res,409,{error:'welllink_changed_refresh'});
    return sendJson(res,200,{ok:true,row:plan.row});
  } catch {return sendJson(res,500,{error:'welllink_unavailable'});}
}
