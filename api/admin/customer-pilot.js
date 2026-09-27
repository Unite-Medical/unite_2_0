import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {prepareCustomerPilot,customerPilotPlan,CUSTOMER_PILOT_TABLES} from '../_lib/customerPilot.js';

const ORIGIN='https://staging.unitemedical.net';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(process.env.UNITE_ENVIRONMENT!=='staging'||process.env.PUBLIC_APP_ORIGIN!==ORIGIN)return sendJson(res,404,{error:'not_found'});
 if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed'});
 if(req.headers.origin!==ORIGIN)return sendJson(res,403,{error:'invalid_origin'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 try{
  const sql=neon(process.env.DATABASE_URL),live=await authorizeLiveRequest(req,sql,{roles:['admin']});
  if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
  let body,prepared;
  try{
   const raw=await readRawBody(req);
   if(raw.length>32768)return sendJson(res,413,{error:'Choose a single customer record.'});
   body=JSON.parse(raw.toString('utf8'));
   if(!['preview','load'].includes(body.action))return sendJson(res,400,{error:'invalid_action'});
   prepared=prepareCustomerPilot(body.source);
  }catch(error){return sendJson(res,400,{error:error instanceof SyntaxError?'The customer file could not be read.':error.message});}
  const existing=await sql`SELECT tbl,id,data,deleted FROM um_rows WHERE tbl=ANY(${CUSTOMER_PILOT_TABLES})`;
  const plan=customerPilotPlan(existing,prepared);
  if(body.action==='preview')return sendJson(res,200,{ok:true,...plan});
  if(body.version!==plan.version)return sendJson(res,409,{error:'Review this customer again before loading.'});
  if(plan.loaded)return sendJson(res,200,{ok:true,replay:true,...plan});
  if(!plan.can_import)return sendJson(res,409,{error:plan.blocked_reason});
  const payload=JSON.stringify(prepared.rows),at=new Date().toISOString();
  const audit={id:prepared.id,version:prepared.version,status:'staging_customer_review',organization_id:prepared.summary.organization_id,actor_id:live.session.user_id,imported_at:at,source_row_sha256:prepared.version};
  await sql.transaction(tx=>[
   tx`LOCK TABLE um_rows IN SHARE ROW EXCLUSIVE MODE`,
   tx`SELECT 1/CASE WHEN
    NOT EXISTS(SELECT 1 FROM um_rows u JOIN jsonb_to_recordset(${payload}::jsonb) x("table" text,id text) ON u.tbl=x."table" AND u.id=x.id)
    AND NOT EXISTS(SELECT 1 FROM um_rows WHERE tbl='staging_imports' AND id=${prepared.id})
    AND NOT EXISTS(SELECT 1 FROM um_rows WHERE deleted=false AND (
     (tbl IN ('organizations','profiles','customer_external_identities') AND ltrim(trim(COALESCE(data->>'shopify_customer_id',data->>'source_customer_id','')),'''')=${prepared.customer_id})
     OR (tbl='profiles' AND lower(trim(data->>'email'))=${prepared.summary.email})
     OR (tbl='organizations' AND regexp_replace(lower(data->>'name'),'[^a-z0-9]','','g')=${prepared.company_key})
    )) THEN 1 ELSE 0 END AS unchanged`,
   tx`INSERT INTO um_rows(tbl,id,data) SELECT x."table",x.id,x.data FROM jsonb_to_recordset(${payload}::jsonb) x("table" text,id text,data jsonb)`,
   tx`INSERT INTO um_rows(tbl,id,data) VALUES('staging_imports',${prepared.id},${JSON.stringify(audit)}::jsonb)`,
  ]);
  return sendJson(res,200,{ok:true,...plan,loaded:true,can_import:false});
 }catch(error){return sendJson(res,['22012','23505'].includes(error.code)?409:500,{error:['22012','23505'].includes(error.code)?'The customer list changed. Review this customer again.':'The customer could not be loaded. No partial record was saved.'});}
}
