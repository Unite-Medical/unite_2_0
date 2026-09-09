import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {duplicateOrganizations,planOrganizationMerge,MERGE_TABLES} from '../_lib/organizationMerge.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});const sql=neon(process.env.DATABASE_URL);
 try{const live=await authorizeLiveRequest(req,sql,{roles:['admin']});if(!live.ok)return sendJson(res,403,{error:live.reason});const orgRows=await sql`SELECT data FROM um_rows WHERE tbl='organizations' AND deleted=false`;const orgs=orgRows.map(r=>r.data);
 if(req.method==='GET')return sendJson(res,200,{ok:true,candidates:duplicateOrganizations(orgs),organizations:orgs.filter(o=>o.status!=='merged').map(o=>({id:o.id,name:o.name}))});
 const b=JSON.parse((await readRawBody(req)).toString('utf8'));const rows=await sql`SELECT tbl,data FROM um_rows WHERE deleted=false AND (data->>'org_id' IN (${String(b.source_id)},${String(b.target_id)}) OR data->>'customer_id' IN (${String(b.source_id)},${String(b.target_id)})) AND tbl=ANY(${MERGE_TABLES}) ORDER BY tbl,id LIMIT 2001`;
 const plan=planOrganizationMerge({source:orgs.find(o=>o.id===b.source_id),target:orgs.find(o=>o.id===b.target_id),rows,reason:b.reason,actorId:live.session.user_id});if(!plan.ok)return sendJson(res,409,{error:plan.reason});
 if(b.action==='preview')return sendJson(res,200,{ok:true,preview:{fingerprint:plan.fingerprint,counts:plan.counts,source:plan.source.name,target:plan.target.name}});
 if(b.action!=='merge'||b.fingerprint!==plan.fingerprint||b.confirm_target!==plan.target.id)return sendJson(res,409,{error:'preview_and_confirm_target_required'});
 const mergeId=crypto.randomUUID();const source={...plan.source,status:'merged',merged_into:plan.target.id,merged_at:new Date().toISOString()};
 const unchanged=rows.filter(r=>!plan.changes.some(c=>c.table===r.tbl&&c.id===r.data.id)).map(r=>({table:r.tbl,id:r.data.id,before:r.data,after:r.data}));
 const changes=[...unchanged,{table:'organizations',id:plan.target.id,before:plan.target,after:plan.target},...plan.changes,{table:'organizations',id:source.id,before:plan.source,after:source}];
 // Serialize writes during the short merge transaction, then validate every
 // source and target snapshot and the complete reference set before applying.
 const results=await sql.transaction(txn=>[
 txn`LOCK TABLE um_rows IN SHARE ROW EXCLUSIVE MODE`,
 txn`WITH expected AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(changes)}::jsonb) AS x("table" text,id text,before jsonb,after jsonb)), locked AS MATERIALIZED (SELECT r.tbl,r.id,r.data FROM um_rows r JOIN expected e ON r.tbl=e."table" AND r.id=e.id WHERE r.deleted=false FOR UPDATE OF r), valid AS (SELECT 1 WHERE (SELECT count(*) FROM um_rows WHERE deleted=false AND tbl=ANY(${MERGE_TABLES}) AND (data->>'org_id' IN (${plan.source.id},${plan.target.id}) OR data->>'customer_id' IN (${plan.source.id},${plan.target.id})))=${rows.length} AND (SELECT count(*) FROM locked)=(SELECT count(*) FROM expected) AND NOT EXISTS(SELECT 1 FROM expected e JOIN locked l ON l.tbl=e."table" AND l.id=e.id WHERE l.data<>e.before)), changed AS (UPDATE um_rows r SET data=e.after,updated_at=now() FROM expected e WHERE r.tbl=e."table" AND r.id=e.id AND EXISTS(SELECT 1 FROM valid) RETURNING r.id) INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'organization_merge_audits',${mergeId},${JSON.stringify({id:mergeId,source_id:source.id,target_id:plan.target.id,actor_id:live.session.user_id,reason:b.reason,fingerprint:plan.fingerprint,changes,created_at:source.merged_at})}::jsonb,false,now() WHERE EXISTS(SELECT 1 FROM changed) RETURNING id`]);
 if(!results[1]?.length)return sendJson(res,409,{error:'records_changed_preview_again'});return sendJson(res,200,{ok:true,merge_id:mergeId});
 }catch{return sendJson(res,500,{error:'merge_failed'});}
}
