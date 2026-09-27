import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {readCommerce} from '../_lib/commerceWorkspace.js';
import {normalizeAdminDraft,draftSubmissionIssues,planAdminOrderSubmission} from '../_lib/adminOrderDraft.js';
import {accountingChoices,saveAccountingMappings} from '../_lib/orderAccountingMappings.js';
import {syncOrderAccounting} from '../_lib/orderAccounting.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'Method not allowed.'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'Workspace unavailable.'});
 try{
  const sql=neon(process.env.DATABASE_URL),live=await authorizeLiveRequest(req,sql,{roles:['admin']});if(!live.ok)return sendJson(res,403,{error:'Sign in to the admin workspace.'});
  if(req.method==='GET'){
   const id=String(req.query.id||''),source=await readCommerce(sql,{kind:'orders',id});if(!source)return sendJson(res,404,{error:'Order not found.'});
   const orderId=source.operational_order_id;
   const operational=orderId?(await sql`SELECT data FROM um_rows WHERE tbl='orders' AND id=${orderId} AND deleted=false`)[0]?.data:null;
   const accounting=orderId?(await sql`SELECT data FROM um_rows WHERE tbl='accounting_jobs' AND id=${'qbo-invoice-'+orderId} AND deleted=false`)[0]?.data:null;
   return sendJson(res,200,{data:source,operational,accounting});
  }
  const origin=req.headers.origin;if(!origin||new URL(origin).host!==(req.headers['x-forwarded-host']||req.headers.host))return sendJson(res,403,{error:'Use the workspace to save orders.'});
  const raw=await readRawBody(req);if(raw.length>500000)throw new Error('This order is too large.');const body=JSON.parse(raw.toString('utf8'));
  const id=String(body.id||body.draft?.id||'');if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Reload the order form.');
  const existing=await readCommerce(sql,{kind:'orders',id});
  if(body.action==='accounting_choices')return sendJson(res,200,{ok:true,choices:await accountingChoices(sql)});
  if(body.action==='save_accounting_mappings'){if(!existing)throw new Error('Order not found.');return sendJson(res,200,await saveAccountingMappings(sql,existing,body.draft,live.session));}
  if(body.action==='sync_accounting'){
   if(!existing?.operational_order_id)throw new Error('Create the order before sending it to accounting.');
   return sendJson(res,200,{ok:true,accounting:await syncOrderAccounting(sql,existing.operational_order_id)});
  }
  if(!['preview','save','submit'].includes(body.action))throw new Error('Unknown order action.');
  if(body.action==='submit'&&existing?.operational_order_id)return sendJson(res,200,{ok:true,data:existing,duplicate:true});
  if(existing&&Number(body.revision)!==existing.revision)throw new Error('This draft changed. Refresh before saving.');
  const input={...body.draft,id},customer=input.customer_id?await readCommerce(sql,{kind:'customers',id:String(input.customer_id)}):null;
  const products=await Promise.all([...new Set((input.lines||[]).map(l=>l.product_id))].map(id=>readCommerce(sql,{kind:'products',id:String(id)})));
  const schedules=await Promise.all((customer?.price_lists||[]).map(id=>readCommerce(sql,{kind:'pricing',id})));
  const draft=normalizeAdminDraft({input,existing,customer,products:products.filter(Boolean),schedules,actor:live.session});
  const issues=draftSubmissionIssues(draft,customer);
  if(body.action==='preview')return sendJson(res,200,{ok:true,data:draft,issues});
  if(body.action==='save'){
   const saved=existing?await sql`UPDATE um_rows SET data=${JSON.stringify(draft)}::jsonb,updated_at=now() WHERE tbl='commerce_orders' AND id=${id} AND deleted=false AND COALESCE((data->>'revision')::integer,0)=${existing.revision} AND data->>'draft'='true' RETURNING id`:await sql`INSERT INTO um_rows(tbl,id,data) VALUES('commerce_orders',${id},${JSON.stringify(draft)}::jsonb) ON CONFLICT(tbl,id) DO NOTHING RETURNING id`;
   if(!saved.length)throw new Error('This draft changed. Refresh before saving.');return sendJson(res,200,{ok:true,data:draft,issues});
  }
  const plan=planAdminOrderSubmission(draft,customer,live.session),nonce=crypto.randomUUID();plan.source.submission_nonce=nonce;
  const audit={id:'created-'+plan.order.id,kind:'order.created_from_admin_draft',order_id:plan.order.id,ref_id:plan.order.id,actor_id:live.session.user_id,created_at:plan.order.created_at,payload:{commerce_order_id:id,total:plan.order.total}};
  const rows=[['orders',plan.order],...plan.items.map(i=>['order_items',i]),['addresses',plan.address],['invoices',plan.invoice],['accounting_jobs',plan.job],['audit_log',audit]];
  const result=await sql.transaction(tx=>[
   existing?tx`UPDATE um_rows SET data=${JSON.stringify(plan.source)}::jsonb,updated_at=now() WHERE tbl='commerce_orders' AND id=${id} AND deleted=false AND data->>'draft'='true' AND COALESCE((data->>'revision')::integer,0)=${existing.revision} RETURNING id`:tx`INSERT INTO um_rows(tbl,id,data) VALUES('commerce_orders',${id},${JSON.stringify(plan.source)}::jsonb) ON CONFLICT(tbl,id) DO NOTHING RETURNING id`,
   ...rows.map(([table,row])=>tx`INSERT INTO um_rows(tbl,id,data) SELECT ${table},${row.id},${JSON.stringify(row)}::jsonb WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='commerce_orders' AND id=${id} AND data->>'submission_nonce'=${nonce}) ON CONFLICT(tbl,id) DO NOTHING`),
  ]);
  if(!result[0]?.length)throw new Error('This draft changed. Refresh to see its current status.');
  const accounting=await syncOrderAccounting(sql,plan.order.id);
  return sendJson(res,201,{ok:true,data:plan.source,operational:plan.order,accounting});
 }catch(error){return sendJson(res,400,{error:error.message||'Unable to save the order.'});}
}
