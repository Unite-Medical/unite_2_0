import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {sendJson} from '../_lib/http.js';
import {SERVICES} from '../_lib/services.js';
import {shopifyCatchupHash} from '../_lib/shopifyCatchup.js';
import {planQboHistoricalMatches,reconciledQboPayment} from '../_lib/qboHistoricalMatch.js';
import {CATCHUP_IDS,CATCHUP_TARGET,catchupTargetFingerprint} from './shopify-catchup.js';
const FINGERPRINT='6cf2357148ca8c7c686bf3bfde0db65e61a2a44ef823fcc0e2e5dd6e2f051aaa';
const IDENTITY=`SELECT current_database() AS database_name,current_schema() AS schema_name,c.relkind,c.relrowsecurity,c.relispartition,
 EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid) AS inherited,
 (SELECT COUNT(*)::int FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) AS triggers,
 (SELECT COUNT(*)::int FROM pg_rewrite WHERE ev_class=c.oid) AS rules
 FROM pg_class c WHERE c.oid=to_regclass('public.um_rows')`;
const SNAPSHOT="SELECT id,data,deleted FROM public.um_rows WHERE tbl='commerce_orders' AND id=ANY($1::text[]) ORDER BY id";
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function html(res,content,status=200){res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Match staging accounting</title><style>body{font:16px system-ui;max-width:1100px;margin:30px auto;padding:16px}table{border-collapse:collapse;width:100%}th,td{padding:8px;border-bottom:1px solid #ccc;text-align:left}textarea,input{max-width:95%;font:inherit}button{padding:12px;font:inherit}</style><main>'+content+'</main></html>');}
async function bodyOf(req){
 if(Number(req.headers['content-length']||0)>12000)fail('request_too_large',413);
 const chunks=[];let bytes=0;
 if(req.body!=null){const raw=typeof req.body==='string'||Buffer.isBuffer(req.body)?req.body:JSON.stringify(req.body);chunks.push(Buffer.from(raw));bytes=Buffer.byteLength(raw);}
 else for await(const chunk of req){bytes+=chunk.length;if(bytes>12000)fail('request_too_large',413);chunks.push(Buffer.from(chunk));}
 if(bytes>12000)fail('request_too_large',413);
 const raw=Buffer.concat(chunks).toString('utf8'),type=String(req.headers['content-type']||'').split(';')[0];let body;
 if(type==='application/x-www-form-urlencoded'){
  const params=new URLSearchParams(raw);if([...params.keys()].some(k=>params.getAll(k).length!==1))fail('duplicate_field',400);body=Object.fromEntries(params);
 }else if(type==='application/json'){try{body=JSON.parse(raw);}catch{fail('invalid_json',400);}}
 else fail('unsupported_content_type',415);
 if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['action','invoice_ids','capture_sha256','baseline_sha256','view','confirm'].includes(k))||Object.values(body).some(v=>typeof v!=='string'))fail('invalid_fields',400);
 if(!['preview','apply'].includes(body.action)||!/^[a-f0-9]{64}$/.test(body.capture_sha256||''))fail('capture_provenance_required',400);
 if(typeof body.invoice_ids!=='string')fail('candidate_invoice_ids_required',400);
 const ids=body.invoice_ids.split(',').map(s=>s.trim());
 if(!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>!/^\d+$/.test(id)))fail('invalid_candidate_invoice_ids',400);
 if(body.action==='apply'&&(body.confirm!=='APPLY_CONFIRMED_QBO_BALANCES'||!/^[a-f0-9]{64}$/.test(body.baseline_sha256||'')))fail('explicit_plan_required',400);
 return {...body,ids:ids.sort()};
}
async function qboRead(service,context,fetchImpl,entity,ids){
 const query=`SELECT * FROM ${entity} WHERE Id IN (${ids.map(id=>"'"+id+"'").join(',')}) MAXRESULTS 1000`;
 const url=new URL(service.buildUrl('/query',{q:query},context));
 if(url.protocol!=='https:'||!['quickbooks.api.intuit.com','sandbox-quickbooks.api.intuit.com'].includes(url.hostname)||!url.pathname.endsWith('/query'))fail('invalid_qbo_read_target',503);
 const response=await fetchImpl(url,{method:'GET',headers:await service.headers(context),redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok)fail('qbo_read_failed',502);
 const text=await response.text();if(Buffer.byteLength(text)>8*1024*1024)fail('qbo_response_too_large',502);
 let data;try{data=JSON.parse(text);}catch{fail('invalid_qbo_response',502);}
 const rows=data.QueryResponse?.[entity]||[];
 if(rows.length!==ids.length||new Set(rows.map(r=>String(r.Id))).size!==ids.length||rows.some(r=>!ids.includes(String(r.Id))))fail('qbo_candidate_scope_changed',409);
 return rows;
}
export function createQboHistoricalMatchHandler({env=process.env,sqlFactory=neon,authorize=authorizeLiveRequest,service=SERVICES.qbo,fetchImpl=fetch,now=()=>new Date(),expectedFingerprint=FINGERPRINT}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  let asHtml=req.query?.view==='html';
  try{
   if(!['GET','POST'].includes(req.method))fail('method_not_allowed',405);
   if(env.VERCEL_PROJECT_ID!==CATCHUP_TARGET.project||env.PUBLIC_APP_ORIGIN!==CATCHUP_TARGET.origin||req.headers.host!=='staging.unitemedical.net')fail('staging_target_required',403);
   const sql=sqlFactory(env.DATABASE_URL);const live=await authorize(req,sql,{roles:['admin']});
   if(!live.ok||live.session.role!=='admin'||live.session.mfa_verified!==true||live.session.org_id!==CATCHUP_TARGET.org)fail('staging_admin_mfa_required',403);
   if(req.method==='POST'&&req.headers.origin!==CATCHUP_TARGET.origin)fail('same_origin_required',403);
   const identity=(await sql.query(IDENTITY))[0];
   if(!identity||identity.schema_name!=='public'||identity.relkind!=='r'||identity.relrowsecurity||identity.relispartition||identity.inherited||identity.triggers||identity.rules||catchupTargetFingerprint(env.DATABASE_URL,identity)!==expectedFingerprint)fail('staging_database_changed');
   if(req.method==='GET')return html(res,'<h1>Match accounting for the approved 48 orders</h1><p>Reads QuickBooks only. Updates confirmed staging balances only; no invoices, payments, stock or shipments are created. Ambiguous and unmatched orders stay in payment review.</p><form method="post"><input type="hidden" name="view" value="html"><input type="hidden" name="action" value="preview"><p><label>Invoice IDs from complete captured match plan<br><textarea name="invoice_ids" rows="5" cols="75" required></textarea></label></p><p><label>Captured match-plan SHA256<br><input name="capture_sha256" size="70" pattern="[a-f0-9]{64}" required></label></p><button>Refresh and preview matches</button></form>');
   const body=await bodyOf(req);asHtml=body.view==='html';
   const snapshot=await sql.query(SNAPSHOT,[CATCHUP_IDS]);
   if(snapshot.length!==48||snapshot.some(r=>r.deleted||r.data.historical!==true||r.data.catchup_import?.kind!=='shopify_historical_catchup_v1'))fail('approved_import_scope_changed');
   if(!service.configured())fail('qbo_connection_unavailable',503);
   const context=await service.context();
   const companyUrl=new URL(service.buildUrl('/companyinfo/'+encodeURIComponent(context.realmId),{},context));
   if(companyUrl.protocol!=='https:'||!['quickbooks.api.intuit.com','sandbox-quickbooks.api.intuit.com'].includes(companyUrl.hostname)||!companyUrl.pathname.includes('/companyinfo/'))fail('invalid_qbo_identity_target',503);
   const companyResponse=await fetchImpl(companyUrl,{method:'GET',headers:await service.headers(context),redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!companyResponse.ok)fail('qbo_company_read_failed',502);
   const companyPayload=await companyResponse.json();
   if(companyPayload.CompanyInfo?.CompanyName!=='Unite Medical, LLC')fail('qbo_company_identity_changed');
   // Candidate IDs come from the complete captured invoice index; every record is refreshed through GET.
   const invoices=await qboRead(service,context,fetchImpl,'Invoice',body.ids);
   const customerIds=[...new Set(invoices.map(i=>String(i.CustomerRef?.value||'')))].sort();
   if(customerIds.some(id=>!/^\d+$/.test(id)))fail('qbo_customer_identity_missing');
   const customers=await qboRead(service,context,fetchImpl,'Customer',customerIds);
   const realmFingerprint=shopifyCatchupHash({realm:context.realmId,environment:context.environment});
   const plan=planQboHistoricalMatches({orders:snapshot.map(r=>r.data),invoices,customers,allowedIds:CATCHUP_IDS});
   const baseline=shopifyCatchupHash({snapshot,invoices,customers,realmFingerprint,capture:body.capture_sha256});
   const patches=plan.rows.filter(r=>r.status==='confirmed').map(match=>{const before=snapshot.find(r=>r.id===match.order_id).data;return {id:match.order_id,before,after:reconciledQboPayment(before,match,{realmFingerprint,retrievedAt:now().toISOString(),scopeEvidenceHash:body.capture_sha256})};}).filter(p=>p.after);
   if(body.action==='preview'){
    const result={ok:true,...plan,baseline_sha256:baseline,updates:patches.length,source:'QuickBooks GET only',retrieved_at:now().toISOString()};
    if(!asHtml)return sendJson(res,200,result);
    const hidden={...body,action:'apply',baseline_sha256:baseline};delete hidden.ids;
    return html(res,'<h1>Accounting match preview</h1><p>'+escape(plan.counts.confirmed)+' confirmed; '+escape(plan.counts.ambiguous)+' ambiguous; '+escape(plan.counts.unmatched)+' unmatched. '+patches.length+' staging updates.</p><table><tr><th>Order</th><th>Match</th><th>Invoice</th><th>Balance</th></tr>'+plan.rows.map(r=>'<tr><td>'+escape(r.order_number)+'</td><td>'+escape(r.status)+'</td><td>'+(r.status==='confirmed'?escape(r.candidates[0].invoice_number):'Needs review')+'</td><td>'+(r.status==='confirmed'?escape(r.candidates[0].balance):'Unverified')+'</td></tr>').join('')+'</table><form method="post">'+Object.entries(hidden).map(([k,v])=>'<input type="hidden" name="'+escape(k)+'" value="'+escape(v)+'">').join('')+'<p><label><input type="checkbox" name="confirm" value="APPLY_CONFIRMED_QBO_BALANCES" required> Apply only confirmed balances to this staging workspace.</label></p><button>Save confirmed staging accounting</button></form>');
   }
   if(!patches.length)return asHtml?html(res,'<h1>Already current</h1><p>No accounting updates or duplicate audit entries were made.</p>'):sendJson(res,200,{ok:true,status:'unchanged',updated:0,...plan.counts});
   if(baseline!==body.baseline_sha256)fail('match_plan_changed_refresh_preview');
   const audit={id:'qbo48-'+crypto.randomUUID(),kind:'qbo_historical_balance_reconciliation',actor_id:live.session.user_id,org_id:live.session.org_id,at:now().toISOString(),target_fingerprint:expectedFingerprint,capture_sha256:body.capture_sha256,baseline_sha256:baseline,realm_fingerprint:realmFingerprint,order_ids:patches.map(p=>p.id),invoice_ids:patches.map(p=>p.after.accounting_reconciliation.invoice_id),counts:plan.counts};
   await sql.transaction(tx=>[
    tx.query("SET LOCAL lock_timeout='5s'"),tx.query("SET LOCAL statement_timeout='15s'"),tx.query('LOCK TABLE public.um_rows IN SHARE ROW EXCLUSIVE MODE'),
    tx.query(`SELECT 1/CASE WHEN (SELECT to_jsonb(i) FROM (${IDENTITY}) i)=$1::jsonb THEN 1 ELSE 0 END`,[JSON.stringify(identity)]),
    tx.query(`SELECT 1/CASE WHEN (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM (${SNAPSHOT}) s)=$2::jsonb THEN 1 ELSE 0 END`,[CATCHUP_IDS,JSON.stringify(snapshot)]),
    tx.query("SELECT 1/CASE WHEN EXISTS(SELECT 1 FROM public.um_rows WHERE tbl='profiles' AND id=$1 AND deleted=false AND data=$2::jsonb) THEN 1 ELSE 0 END",[live.session.user_id,JSON.stringify(live.profile)]),
    tx.query("UPDATE public.um_rows u SET data=p.after,updated_at=now() FROM jsonb_to_recordset($1::jsonb) AS p(id text,before jsonb,after jsonb) WHERE u.tbl='commerce_orders' AND u.id=p.id AND u.deleted=false AND u.data=p.before RETURNING u.id",[JSON.stringify(patches)]),
    tx.query("SELECT 1/CASE WHEN (SELECT COUNT(*) FROM public.um_rows u JOIN jsonb_to_recordset($1::jsonb) AS p(id text,after jsonb) ON u.tbl='commerce_orders' AND u.id=p.id AND u.data=p.after AND u.deleted=false)=$2 THEN 1 ELSE 0 END",[JSON.stringify(patches),patches.length]),
    tx.query("INSERT INTO public.um_rows(tbl,id,data) VALUES('audit_log',$1,$2::jsonb)",[audit.id,JSON.stringify(audit)]),
   ],{isolationLevel:'ReadCommitted',readOnly:false});
   const result={ok:true,status:'matched',updated:patches.length,...plan.counts,audit_id:audit.id};
   return asHtml?html(res,'<h1>Confirmed accounting saved</h1><p>'+patches.length+' staging orders updated. Ambiguous and unmatched records remain in review.</p><a href="/admin/orders">Open staging orders</a>'):sendJson(res,200,result);
  }catch(error){const status=error.status||409,message=error.status?error.message:'accounting_not_applied_refresh_and_review';return asHtml?html(res,'<h1>Accounting paused</h1><p>'+escape(message)+'</p>',status):sendJson(res,status,{ok:false,error:message});}
 };
}
export default createQboHistoricalMatchHandler();
