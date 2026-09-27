import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {batch,pilotPlan} from '../_lib/cleanPilot.js';
const ORIGIN='https://staging.unitemedical.net';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(process.env.UNITE_ENVIRONMENT!=='staging'||process.env.PUBLIC_APP_ORIGIN!==ORIGIN)return sendJson(res,404,{error:'not_found'});
 if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
 if(req.method==='POST'&&req.headers.origin!==ORIGIN)return sendJson(res,403,{error:'invalid_origin'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 try{
  const sql=neon(process.env.DATABASE_URL),live=await authorizeLiveRequest(req,sql,{roles:['admin']});
  if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
  const rows=await sql`SELECT tbl,id,data,deleted FROM um_rows WHERE tbl IN ('products','product_variants','inventory','stock_movements','staging_imports','warehouses')`;
  const plan=pilotPlan(rows);
  if(req.method==='GET')return sendJson(res,200,{ok:true,...plan});
  let body;try{const raw=await readRawBody(req);if(raw.length>4096)return sendJson(res,413,{error:'request_too_large'});body=JSON.parse(raw.toString('utf8'));}catch{return sendJson(res,400,{error:'invalid_request'});}
  if(body.action!=='load'||body.version!==plan.version)return sendJson(res,409,{error:'Refresh the preview before loading this batch.'});
  if(plan.loaded)return sendJson(res,200,{ok:true,replay:true,...plan});
  if(!plan.can_import)return sendJson(res,409,{error:plan.blocked_reason});
  const at=new Date().toISOString(),payload=JSON.stringify(batch.rows),incomingSkus=batch.rows.filter(r=>r.table==='product_variants').map(r=>r.data.sku);
  const audit={id:batch.id,status:'staging_test_batch',summary:batch.summary,source_date:batch.source_date,source_sha256:batch.source_sha256,imported_at:at,actor_id:live.session.user_id,version:plan.version};
  await sql.transaction(tx=>[
   tx`LOCK TABLE um_rows IN SHARE ROW EXCLUSIVE MODE`,
   tx`SELECT 1/CASE WHEN NOT EXISTS(SELECT 1 FROM um_rows u JOIN jsonb_to_recordset(${payload}::jsonb) x("table" text,id text) ON u.tbl=x."table" AND u.id=x.id) AND NOT EXISTS(SELECT 1 FROM um_rows WHERE tbl IN ('products','product_variants') AND deleted=false AND (data->>'sku'=ANY(${incomingSkus}) OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'variants')='array' THEN data->'variants' ELSE '[]'::jsonb END) v WHERE v->>'sku'=ANY(${incomingSkus})))) AND EXISTS(SELECT 1 FROM um_rows WHERE tbl='warehouses' AND id='wh_unite' AND deleted=false AND COALESCE(data->>'active','true')!='false') THEN 1 ELSE 0 END AS unchanged`,
   tx`INSERT INTO um_rows(tbl,id,data) SELECT x."table",x.id,x.data FROM jsonb_to_recordset(${payload}::jsonb) x("table" text,id text,data jsonb)`,
   tx`INSERT INTO um_rows(tbl,id,data) VALUES('staging_imports',${batch.id},${JSON.stringify(audit)}::jsonb)`,
  ]);
  return sendJson(res,200,{ok:true,loaded:true,summary:batch.summary,loaded_at:at});
 }catch(error){return sendJson(res,['22012','23505'].includes(error.code)?409:500,{error:['22012','23505'].includes(error.code)?'The workspace changed. Refresh before importing.':'The test batch could not be loaded. No partial batch was saved.'});}
}
