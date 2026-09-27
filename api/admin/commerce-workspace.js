import {neon} from '@neondatabase/serverless';
import crypto from 'node:crypto';
import {saveAuthorizedCommerce} from '../_lib/commerceMutations.js';
import {readFileSync} from 'node:fs';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {COMMERCE_TABLES,readCommerce,searchCommerce,validateCommercePatch,resolveSchedulePrice} from '../_lib/commerceWorkspace.js';
let snapshot;
const loadSnapshot=()=>{if(snapshot)return snapshot;try{return snapshot=JSON.parse(readFileSync(new URL('../_data/commerce-snapshot.json',import.meta.url),'utf8'));}catch{return snapshot={...JSON.parse(readFileSync(new URL('../_data/commerce-manifest.json',import.meta.url),'utf8')),rows:null};}};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'Method not allowed.'});if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'Database is not configured.'});
 try{const sql=neon(process.env.DATABASE_URL);const live=await authorizeLiveRequest(req,sql,{roles:['admin']});if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
 if(req.method==='GET'){
  if(req.query.action==='resolve_price'){const c=await readCommerce(sql,{kind:'customers',id:String(req.query.customer_id||'')});const product=await readCommerce(sql,{kind:'products',id:String(req.query.product_id||'')});if(!c||!product||product.status!=='active')throw new Error('Choose an active product and customer.');const schedules=await Promise.all((c.price_lists||[]).map(id=>readCommerce(sql,{kind:'pricing',id})));return sendJson(res,200,{ok:true,...resolveSchedulePrice(product,req.query.quantity||1,schedules)});}
  if(req.query.action==='search')return sendJson(res,200,{ok:true,groups:await searchCommerce(sql,String(req.query.q||''),req.query.category)});
  if(req.query.action==='manifest'){const s=loadSnapshot();const counts=await sql`SELECT tbl,COUNT(*)::int AS count FROM um_rows WHERE tbl IN ('commerce_customers','commerce_orders','commerce_price_lists','commerce_products') AND deleted=false GROUP BY tbl`;return sendJson(res,200,{ok:true,version:s.version,source_dates:s.source_dates,counts:s.counts,total:s.rows?.length||s.total,source_available:Boolean(s.rows),imported:counts});}
  const data=await readCommerce(sql,req.query);if(!data)return sendJson(res,404,{error:'Record not found.'});return sendJson(res,200,{ok:true,data});
 }
 const origin=req.headers.origin;const host=req.headers['x-forwarded-host']||req.headers.host;if(!origin||new URL(origin).host!==host)return sendJson(res,403,{error:'Use the workspace to make changes.'});
 const body=JSON.parse((await readRawBody(req)).toString('utf8'));const actor=live.session;
 if(body.action==='list_selected')return sendJson(res,200,{ok:true,data:await readCommerce(sql,{kind:body.query?.kind,page:body.query?.page,selected_ids:body.query?.selected_ids})});
 if(body.action==='import'){
  if(process.env.UNITE_ENVIRONMENT!=='staging'&&!String(process.env.PUBLIC_APP_ORIGIN||'').includes('staging.unitemedical.net')&&!String(host).startsWith('staging.unitemedical.net'))return sendJson(res,403,{error:'This import is limited to the staging workspace.'});
  const s=loadSnapshot();if(!s.rows)throw new Error('The source import package is not bundled. Existing imported records remain available.');const start=Math.max(0,Math.floor(Number(body.cursor)||0));const batch=s.rows.slice(start,start+50);if(body.version!==s.version)throw new Error('The import changed. Reload the page.');
  const result=batch.length?await sql`INSERT INTO um_rows(tbl,id,data) SELECT x."table",x.id,x.data FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x("table" text,id text,data jsonb) ON CONFLICT(tbl,id) DO NOTHING RETURNING id`:[];
  return sendJson(res,200,{ok:true,inserted:result.length,next:start+batch.length,total:s.rows.length,done:start+batch.length>=s.rows.length});
 }
 const kind=body.kind,id=String(body.id||'');if(!COMMERCE_TABLES[kind])throw new Error('Unknown collection.');
 if(body.action==='create'){
  if(!['customers','orders','pricing'].includes(kind))throw new Error('Use the product catalog to add a product.');const newId=crypto.randomUUID();const now=new Date().toISOString();
  let data=kind==='customers'?{id:newId,name:'New customer',first_name:'',last_name:'',email:'',phone:'',company:'',notes:'',tags:[],addresses:[],price_lists:[],status:'active',approval_status:'review_required',tax_exempt:false,certificate_status:'missing',language:'en',email_subscription:'unsubscribed',terms:'needs_confirmation',overdue_policy:'hold',amount_spent:0,source_order_count:0,imported_order_count:0}:kind==='orders'?{id:newId,number:'D-'+newId.slice(0,8).toUpperCase(),customer_id:body.customer_id||'',financial_status:'unpaid',fulfillment_status:'unfulfilled',workflow_state:'needs_review',draft:true,historical:false,lines:[],notes:'',tags:[],shipping_address:{},billing_address:{},total:0,shipping:0,tax:0,currency:'USD'}:{id:newId,name:'New pricing schedule',kind:'Customer agreement',rows:[],status:'active',currency:'USD',notes:''};
  data={...data,revision:0,created_at:now,events:[{id:crypto.randomUUID(),at:now,actor:actor.email,text:'Created in Unite Medical'}]};if(body.patch)data=validateCommercePatch(kind,data,body.patch);if(kind==='orders'&&data.customer_id){const c=await readCommerce(sql,{kind:'customers',id:data.customer_id});if(!c)throw new Error('Choose an existing customer.');data.shipping_address=c.addresses?.find(a=>a.is_default)||{};data.email=c.email;}
  await sql`INSERT INTO um_rows(tbl,id,data) VALUES(${COMMERCE_TABLES[kind]},${newId},${JSON.stringify(data)}::jsonb)`;return sendJson(res,201,{ok:true,data});
 }
 if(body.action==='comment'){
  const text=String(body.text||'').trim();if(!text||text.length>5000)throw new Error('Enter a comment under 5,000 characters.');const c=await readCommerce(sql,{kind,id});if(!c)throw new Error('Record not found.');const event={id:crypto.randomUUID(),at:new Date().toISOString(),actor:actor.name||actor.email,text};
  const result=await sql`UPDATE um_rows SET data=jsonb_set(jsonb_set(data,'{events}',COALESCE(data->'events','[]'::jsonb)||${JSON.stringify([event])}::jsonb),'{revision}',to_jsonb(COALESCE((data->>'revision')::integer,0)+1)),updated_at=now() WHERE tbl=${COMMERCE_TABLES[kind]} AND id=${id} AND deleted=false RETURNING data`;return sendJson(res,200,{ok:true,data:result[0].data});
 }
 if(body.action==='save'){
  const data=await saveAuthorizedCommerce(sql,{kind,id,revision:body.revision,patch:body.patch,actor});return sendJson(res,200,{ok:true,data});
 }
 throw new Error('Unknown action.');
 }catch(e){return sendJson(res,400,{error:e.message?.includes('password')?'Unable to save.':e.message||'Workspace unavailable.'});}
}
