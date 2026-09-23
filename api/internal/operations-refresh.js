import {neon} from '@neondatabase/serverless';
import {safeEqual,sendJson} from '../_lib/http.js';
import {buildOperationsDesk,DESK_TABLES} from '../_lib/operationsDesk.js';
import {buildCustomerIoOutbox} from '../_lib/customerioOutbox.js';
export default async function handler(req,res){
 if(process.env.UNITE_ENVIRONMENT==='staging')return sendJson(res,200,{ok:true,skipped:'staging_manual_testing'});
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return sendJson(res,405,{error:'method_not_allowed'});
 if(!process.env.CRON_SECRET||!safeEqual(String(req.headers.authorization||''),'Bearer '+process.env.CRON_SECRET))return sendJson(res,401,{error:'unauthorized'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});const sql=neon(process.env.DATABASE_URL);
 try{const loaded=await Promise.all(DESK_TABLES.map(async t=>[t,(await sql`SELECT data FROM um_rows WHERE tbl=${t} AND deleted=false`).map(r=>r.data)]));const queue=buildOperationsDesk(Object.fromEntries(loaded));const at=new Date().toISOString(),day=at.slice(0,10);const owners=new Map();
 for(const item of queue){const task={id:`ops_${item.id}`,kind:item.kind,subject:item.title,owner_email:item.owner_email||item.escalation_owner,due_at:item.due_at,status:'open',ref_id:item.source_id,ref_type:'operations_exception',payload:{exception_id:item.id,next_action:item.next_action,escalated:item.escalated},updated_at:at};await sql`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) VALUES('tasks',${task.id},${JSON.stringify(task)}::jsonb,false,now()) ON CONFLICT(tbl,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()`;for(const owner of new Set([task.owner_email,...(item.escalated?[item.escalation_owner]:[])])){const list=owners.get(owner)||[];list.push(item);owners.set(owner,list);}}
 const openIds=queue.map(q=>`ops_${q.id}`);await sql`UPDATE um_rows SET data=data||'{"status":"resolved"}'::jsonb,updated_at=now() WHERE tbl='tasks' AND data->>'ref_type'='operations_exception' AND NOT(id=ANY(${openIds})) AND deleted=false`;
 let notices=0;
 if(process.env.OPERATIONS_DIGEST_TEMPLATE_ID)for(const [owner,items] of owners){const row=buildCustomerIoOutbox({idempotency_key:`ops-digest:${day}:${owner}`,to:owner,transactional_message_id:process.env.OPERATIONS_DIGEST_TEMPLATE_ID,subject:`Unite: ${items.length} items need attention`,body:items.map(i=>`${i.title}: ${i.next_action}`).join('\n'),message_data:{items:items.map(i=>({title:i.title,next_action:i.next_action,due_at:i.due_at,path:i.path}))},ref_type:'operations_digest',ref_id:day});await sql`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) VALUES('customerio_outbox',${row.id},${JSON.stringify(row)}::jsonb,false,now()) ON CONFLICT(tbl,id) DO NOTHING`;notices++;}
 return sendJson(res,200,{ok:true,open_exceptions:queue.length,owner_digests: notices,notifications_configured:!!process.env.OPERATIONS_DIGEST_TEMPLATE_ID});
 }catch{return sendJson(res,500,{error:'operations_refresh_failed'});}
}
