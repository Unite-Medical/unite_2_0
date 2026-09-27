import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {planWorkspaceReset} from '../_lib/workspaceReset.js';
const ORIGIN='https://staging.unitemedical.net';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(process.env.UNITE_ENVIRONMENT!=='staging'||process.env.PUBLIC_APP_ORIGIN!==ORIGIN)return sendJson(res,404,{error:'not_found'});
 if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
 if(req.method==='POST'&&req.headers.origin!==ORIGIN)return sendJson(res,403,{error:'invalid_origin'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 const sql=neon(process.env.DATABASE_URL);
 try{
  const live=await authorizeLiveRequest(req,sql,{roles:['admin']});
  if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
  const rows=await sql`SELECT tbl,id,data,deleted,updated_at::text AS updated_at FROM um_rows WHERE deleted=false`;
  const plan=planWorkspaceReset(rows);
  const history=rows.filter(r=>r.tbl==='workspace_resets').map(r=>({id:r.id,...r.data})).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  if(req.method==='GET')return sendJson(res,200,{ok:true,...plan,targets:undefined,history,preserved_counts:Object.fromEntries([...new Set(rows.map(r=>r.tbl))].map(tbl=>[tbl,rows.filter(r=>r.tbl===tbl).length-(plan.counts[tbl]||0)]).filter(([,n])=>n>0)),environment:'staging'});
  const body=JSON.parse((await readRawBody(req)).toString('utf8'));
  if(body.action==='restore'){
   const run=history.find(r=>r.id===body.run_id&&r.status==='archived');
   if(!run)return sendJson(res,409,{error:'reset_not_restorable'});
   if(plan.total)return sendJson(res,409,{error:'clear_new_data_before_restore'});
   // Restore only untouched archived rows. Never overwrite a newly imported record.
   const results=await sql.transaction(tx=>[
    tx`LOCK TABLE um_rows IN SHARE ROW EXCLUSIVE MODE`,
    tx`SELECT 1/CASE WHEN (SELECT count(*) FROM um_rows WHERE deleted=true AND data->>'workspace_reset_id'=${run.id})=${run.total} THEN 1 ELSE 0 END AS intact`,
    tx`UPDATE um_rows SET deleted=false,data=data-'workspace_reset_id',updated_at=now() WHERE deleted=true AND data->>'workspace_reset_id'=${run.id} RETURNING tbl`,
    tx`UPDATE um_rows SET data=data-'workspace_internal'-'workspace_internal_reset_id',updated_at=now() WHERE tbl='organizations' AND data->>'workspace_internal_reset_id'=${run.id}`,
    tx`UPDATE um_rows SET data=data||${JSON.stringify({status:'restored',restored_at:new Date().toISOString(),restored_by:live.session.user_id})}::jsonb,updated_at=now() WHERE tbl='workspace_resets' AND id=${run.id}`,
   ]);
   return sendJson(res,200,{ok:true,restored:results[2].length});
  }
  if(body.action!=='archive'||body.confirmation!=='CLEAR STAGING WORKSPACE')return sendJson(res,400,{error:'confirmation_required'});
  if(body.version!==plan.version)return sendJson(res,409,{error:'workspace_changed_refresh'});
  if(plan.blocked)return sendJson(res,409,{error:'legal_hold_active'});
  if(!plan.total)return sendJson(res,400,{error:'workspace_already_empty'});
  const id=crypto.randomUUID(),created_at=new Date().toISOString();
  const run={id,created_at,actor_id:live.session.user_id,status:'archived',counts:plan.counts,total:plan.total,internal_org_ids:plan.internal_org_ids};
  const expected=JSON.stringify(rows.map(r=>({tbl:r.tbl,id:r.id,at:r.updated_at}))),targets=JSON.stringify(plan.targets);
  const results=await sql.transaction(tx=>[
   tx`LOCK TABLE um_rows IN SHARE ROW EXCLUSIVE MODE`,
   // Reject both changed rows and new arrivals between preview and commit.
   tx`SELECT 1/CASE WHEN (SELECT count(*) FROM um_rows WHERE deleted=false)=${rows.length} AND (SELECT count(*) FROM um_rows u JOIN jsonb_to_recordset(${expected}::jsonb) x(tbl text,id text,at text) ON u.tbl=x.tbl AND u.id=x.id WHERE u.deleted=false AND u.updated_at=x.at::timestamptz)=${rows.length} THEN 1 ELSE 0 END AS unchanged`,
   tx`UPDATE um_rows u SET deleted=true,data=u.data||jsonb_build_object('workspace_reset_id',${id}::text),updated_at=now() FROM jsonb_to_recordset(${targets}::jsonb) x(tbl text,id text) WHERE u.tbl=x.tbl AND u.id=x.id AND u.deleted=false RETURNING u.tbl`,
   tx`UPDATE um_rows SET data=data||jsonb_build_object('workspace_internal',true,'workspace_internal_reset_id',${id}::text),updated_at=now() WHERE tbl='organizations' AND id=ANY(${plan.internal_org_ids})`,
   tx`INSERT INTO um_rows(tbl,id,data) VALUES('workspace_resets',${id},${JSON.stringify(run)}::jsonb)`,
  ]);
  return sendJson(res,200,{ok:true,archived:results[2].length,run_id:id,counts:plan.counts});
 }catch(error){return sendJson(res,error.code==='22012'?409:500,{error:error.code==='22012'?'workspace_changed_refresh':'workspace_reset_unavailable'});}
}
