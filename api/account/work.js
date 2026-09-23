import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {buildStaffWorkspace,planStaffFollowup,WORK_TABLES} from '../_lib/staffWorkspace.js';
import {STAFF_ROLES} from '../../src/lib/staffWorkspace.js';

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 try{
  const sql=neon(process.env.DATABASE_URL);
  const live=await authorizeLiveRequest(req,sql,{roles:STAFF_ROLES});
  if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
  const records=await sql`SELECT tbl,data FROM um_rows WHERE tbl=ANY(${WORK_TABLES}) AND deleted=false`;
  const tables=Object.fromEntries(WORK_TABLES.map(t=>[t,[]]));
  for(const r of records)tables[r.tbl].push(r.data);
  const board=buildStaffWorkspace(tables,live.session,{jacobeEmail:process.env.UNITE_JACOBE_EMAIL||'jacobe@unitemedical.net',ashleyEmail:process.env.UNITE_ASHLEY_EMAIL});
  if(req.method==='GET')return sendJson(res,200,board);
  let input;try{input=JSON.parse((await readRawBody(req)).toString('utf8'));}catch{return sendJson(res,400,{error:'invalid_request'});}
  const item=board.items.find(r=>r.id===input.id);
  const plan=planStaffFollowup(item,input,live.session);
  if(!plan.ok)return sendJson(res,plan.error==='work_changed_refresh'?409:400,{error:plan.error});
  const source=tables[item.source_table].find(r=>r.id===item.source_id);
  const row=plan.row;
  const audit={id:crypto.randomUUID(),kind:'staff.followup_updated',ref_id:item.source_id,actor_id:live.session.user_id,created_at:row.updated_at,payload:{work_id:item.id,state:row.state,next_action:row.next_action,due_at:row.due_at,version:row.version}};
  const changed=await sql`WITH updated AS (
    INSERT INTO um_rows(tbl,id,data,deleted,updated_at)
    SELECT 'staff_followups',${row.id},${JSON.stringify(row)}::jsonb,false,now()
    WHERE EXISTS(SELECT 1 FROM um_rows WHERE tbl=${item.source_table} AND id=${item.source_id} AND deleted=false AND data=${JSON.stringify(source)}::jsonb)
    ON CONFLICT(tbl,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()
    WHERE um_rows.deleted=false AND COALESCE((um_rows.data->>'version')::integer,0)=${item.version}
    RETURNING id
   ) INSERT INTO um_rows(tbl,id,data,deleted,updated_at)
   SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() FROM updated RETURNING id`;
  if(!changed.length)return sendJson(res,409,{error:'work_changed_refresh'});
  return sendJson(res,200,{ok:true,saved_at:row.updated_at});
 }catch{return sendJson(res,500,{error:'work_unavailable'});}
}
