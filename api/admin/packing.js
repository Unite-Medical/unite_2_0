import crypto from 'node:crypto';
import {shippingOrigin} from '../_lib/shippingOrigin.js';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
export function reviewedPackingOption(body,draft,env=process.env){
 const origin=shippingOrigin(env);if(!origin)return {ok:false,reason:'shipping_origin_not_configured'};
 if(body.freight==null||String(body.freight).trim()===''||body.tax==null||String(body.tax).trim()==='')return {ok:false,reason:'freight_and_tax_required'};
 const freight=Number(body.freight),tax=Number(body.tax);const dimensions=Object.fromEntries(['length','width','height'].map(k=>[k,Number(body[k])]));const weight=Number(body.weight);
 if(!Number.isFinite(freight)||freight<0||!Number.isFinite(tax)||tax<0||![weight,...Object.values(dimensions)].every(v=>Number.isFinite(v)&&v>0))return {ok:false,reason:'valid_costs_and_package_required'};
 if(!['fedex','ups','stamps_com'].includes(body.carrier)||!String(body.service||'').trim()||!String(body.shipping_evidence||'').trim()||!String(body.tax_evidence||'').trim())return {ok:false,reason:'carrier_service_and_evidence_required'};
 if(draft.order.tax_exempt_basis&&tax!==0)return {ok:false,reason:'preserved_exemption_requires_review'};
 return {ok:true,option:{id:crypto.randomUUID(),label:body.label||body.service,service:body.service,carrier:body.carrier,freight:Math.round(freight*100)/100,tax:Math.round(tax*100)/100,total:Math.round((draft.order.subtotal+freight+tax)*100)/100,ship_from:origin,shipping_package:{weight:{value:weight,units:'pounds'},dimensions:{...dimensions,units:'inches'}},tax_basis:draft.order.tax_exempt_basis?'preserved_account_exemption':'finance_reviewed',shipping_evidence:String(body.shipping_evidence).slice(0,2000),tax_evidence:String(body.tax_evidence).slice(0,2000)}};
}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store, private');if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});const sql=neon(process.env.DATABASE_URL);try{const live=await authorizeLiveRequest(req,sql,{roles:['admin']});if(!live.ok)return sendJson(res,403,{error:live.reason});
 if(req.method==='GET'){const rows=await sql`SELECT data FROM um_rows WHERE tbl='checkout_reviews' AND deleted=false AND data->>'status'='pending' ORDER BY updated_at LIMIT 100`;return sendJson(res,200,{ok:true,reviews:rows.map(r=>r.data)});}
 const body=JSON.parse((await readRawBody(req)).toString('utf8'));const rows=await sql`SELECT data FROM um_rows WHERE tbl='checkout_reviews' AND id=${String(body.review_id||'')} AND deleted=false`;const before=rows[0]?.data;if(!before||before.status!=='pending')return sendJson(res,409,{error:'review_changed_refresh'});
 const plan=reviewedPackingOption(body,before.draft);if(!plan.ok)return sendJson(res,400,{error:plan.reason});
 const now=new Date(),estimate={id:crypto.randomUUID(),customer_id:before.customer_id,binding:before.binding,options:[plan.option],expires_at:new Date(now.getTime()+24*3600000).toISOString(),created_at:now.toISOString(),reviewed_by:live.session.user_id};const next={...before,status:'approved',estimate_id:estimate.id,reviewed_by:live.session.user_id,reviewed_at:now.toISOString()};const audit={id:crypto.randomUUID(),kind:'checkout.reviewed',ref_id:before.id,actor_id:live.session.user_id,payload:plan.option,created_at:now.toISOString()};
 const results=await sql`WITH changed AS (UPDATE um_rows SET data=${JSON.stringify(next)}::jsonb,updated_at=now() WHERE tbl='checkout_reviews' AND id=${before.id} AND data=${JSON.stringify(before)}::jsonb RETURNING id), saved AS (INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'checkout_estimates',${estimate.id},${JSON.stringify(estimate)}::jsonb,false,now() FROM changed RETURNING id) INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() FROM saved RETURNING id`;
 if(!results.length)return sendJson(res,409,{error:'review_changed_refresh'});return sendJson(res,200,{ok:true,estimate_id:estimate.id});
 }catch{return sendJson(res,500,{error:'packing_review_failed'});}}
