import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {RETAINED_TABLES} from '../_lib/retention.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});const sql=neon(process.env.DATABASE_URL);
 try{const live=await authorizeLiveRequest(req,sql,{roles:['admin']});if(!live.ok)return sendJson(res,403,{error:live.reason});
 if(req.method==='GET'){const rows=await sql`SELECT data FROM um_rows WHERE tbl='legal_holds' AND deleted=false`;return sendJson(res,200,{ok:true,retention_years:3,tables:[...RETAINED_TABLES],holds:rows.map(r=>r.data)});}
 const b=JSON.parse((await readRawBody(req)).toString('utf8'));if(!['hold','release'].includes(b.action)||!String(b.reason||'').trim())return sendJson(res,400,{error:'action_and_reason_required'});
 let before=null;if(b.action==='release'){const rows=await sql`SELECT data FROM um_rows WHERE tbl='legal_holds' AND id=${String(b.id||'')} AND deleted=false`;before=rows[0]?.data;if(!before)return sendJson(res,404,{error:'hold_not_found'});}
 if(b.action==='hold'&&!RETAINED_TABLES.has(b.table)&&b.table!=='*')return sendJson(res,400,{error:'invalid_record_class'});
 const row={...(before||{}),id:before?.id||crypto.randomUUID(),table:before?.table||b.table,record_id:before?.record_id||b.record_id||null,status:b.action==='hold'?'active':'released',reason:String(b.reason).trim(),actor_id:live.session.user_id,updated_at:new Date().toISOString()};const audit={...row,id:crypto.randomUUID(),kind:'retention.'+b.action,ref_id:row.id};
 await sql.transaction(txn=>[txn`SELECT pg_advisory_xact_lock(hashtext('unite-retention-policy'))`,txn`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) VALUES('legal_holds',${row.id},${JSON.stringify(row)}::jsonb,false,now()) ON CONFLICT(tbl,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()`,txn`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) VALUES('audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now())`]);return sendJson(res,200,{ok:true,hold:row});
 }catch{return sendJson(res,500,{error:'retention_update_failed'});}
}
