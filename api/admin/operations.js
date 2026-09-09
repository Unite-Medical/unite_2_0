import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {buildOperationsDesk,DESK_TABLES} from '../_lib/operationsDesk.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});const sql=neon(process.env.DATABASE_URL);
 try{const live=await authorizeLiveRequest(req,sql,{roles:['admin']});if(!live.ok)return sendJson(res,403,{error:live.reason});
  const results=await Promise.all(DESK_TABLES.map(async t=>[t,(await sql`SELECT data FROM um_rows WHERE tbl=${t} AND deleted=false`).map(r=>r.data)]));const tables=Object.fromEntries(results);const queue=buildOperationsDesk(tables);
  if(req.method==='GET')return sendJson(res,200,{ok:true,exceptions:queue,generated_at:new Date().toISOString()});
  const b=JSON.parse((await readRawBody(req)).toString('utf8'));const source=queue.find(r=>r.id===b.id);if(!source||source.source_version!==b.source_version)return sendJson(res,409,{error:'exception_changed_refresh'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.owner_email||'')||!Number.isFinite(Date.parse(b.due_at))||!String(b.next_action||'').trim())return sendJson(res,400,{error:'owner_deadline_and_next_action_required'});
  const row={id:source.id,source_version:source.source_version,owner_email:String(b.owner_email).trim().toLowerCase(),due_at:new Date(b.due_at).toISOString(),next_action:String(b.next_action).trim().slice(0,1000),notes:String(b.notes||'').slice(0,4000),version:Number(source.version||0)+1,updated_at:new Date().toISOString(),updated_by:live.session.user_id};
  const audit={id:crypto.randomUUID(),kind:'exception.assigned',ref_id:row.id,actor_id:live.session.user_id,payload:row,created_at:row.updated_at};
  const changed=await sql`WITH updated AS (INSERT INTO um_rows(tbl,id,data,deleted,updated_at) VALUES('operational_exceptions',${row.id},${JSON.stringify(row)}::jsonb,false,now()) ON CONFLICT(tbl,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now() WHERE COALESCE((um_rows.data->>'version')::integer,0)=${Number(b.version||0)} RETURNING id) INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() FROM updated RETURNING id`;
  if(!changed.length)return sendJson(res,409,{error:'exception_changed_refresh'});return sendJson(res,200,{ok:true});
 }catch{return sendJson(res,500,{error:'operations_unavailable'});}
}
