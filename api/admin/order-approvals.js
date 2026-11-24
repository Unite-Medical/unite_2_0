import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody,sendJson } from '../_lib/http.js';
import { isOrderApprover,planOrderApproval } from '../_lib/orderApproval.js';
import { syncOrderAccounting } from '../_lib/orderAccounting.js';
const STAFF=['admin','sales','sales_manager','customer_service','warehouse_operator','warehouse_manager','finance','sourcing','sourcing_manager'];
export function summarizeApprovalOrder(o,items=[]){
 return {id:o.id,number:o.source_order_number||o.id,customer_name:o.customer_name||'',total:Number(o.total)||0,status:o.status,po_number:o.po_number||'',approval:o.approval||null,created_at:o.created_at,
  lines:items.filter(i=>i.order_id===o.id).map(i=>({sku:i.sku||i.inventory_sku||'',name:i.name||i.title||i.sku||'',quantity:Number(i.qty??i.quantity)||0}))};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 const sql=neon(process.env.DATABASE_URL);
 try{
  if(req.method==='GET'){
   const live=await authorizeLiveRequest(req,sql,{roles:STAFF});if(!live.ok)return sendJson(res,403,{error:live.reason});
   const rows=await sql`SELECT data FROM um_rows WHERE tbl='orders' AND deleted=false AND data->'approval'->>'requested_at' IS NOT NULL AND (data->'approval'->>'status'='pending' OR updated_at>now()-interval '14 days') ORDER BY data->'approval'->>'requested_at' DESC LIMIT 200`;
   const orders=rows.map(r=>r.data),ids=orders.map(o=>o.id);
   const items=ids.length?(await sql`SELECT data FROM um_rows WHERE tbl='order_items' AND deleted=false AND data->>'order_id'=ANY(${ids})`).map(r=>r.data):[];
   return sendJson(res,200,{ok:true,can_approve:isOrderApprover(live.session),orders:orders.map(o=>summarizeApprovalOrder(o,items))});
  }
  const live=await authorizeLiveRequest(req,sql,{roles:['admin','finance']});if(!live.ok)return sendJson(res,403,{error:live.reason});
  const body=JSON.parse((await readRawBody(req)).toString('utf8'));
  const rows=await sql`SELECT data FROM um_rows WHERE tbl='orders' AND id=${String(body.order_id||'')} AND deleted=false`;
  const before=rows[0]?.data;const plan=planOrderApproval({order:before,actor:live.session,action:body.action,reason:body.reason});
  if(!plan.ok)return sendJson(res,400,{error:plan.reason});
  const audit={id:crypto.randomUUID(),kind:'order.approval',ref_id:before.id,actor_id:live.session.user_id,payload:plan.approval,created_at:new Date().toISOString()};
  const approved=plan.approval.status==='approved',accountingStatus=approved?'queued':'cancelled',at=new Date().toISOString(),who=live.session.name||live.session.email;
  const event={id:crypto.randomUUID(),at,actor:live.session.email,text:approved?`Approved by ${who}. Sent to accounting, payment review and fulfillment.`:`Rejected by ${who}: ${plan.approval.reason}`};
  const result=await sql.transaction(tx=>[
   tx`WITH changed AS (
    UPDATE um_rows SET data=${JSON.stringify(plan.order)}::jsonb,updated_at=now() WHERE tbl='orders' AND id=${before.id} AND deleted=false AND data=${JSON.stringify(before)}::jsonb RETURNING id
   ) INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() FROM changed RETURNING id`,
   ...(plan.wasPending?[
    tx`UPDATE um_rows SET data=data||${JSON.stringify({status:accountingStatus,updated_at:at})}::jsonb,updated_at=now() WHERE tbl='accounting_jobs' AND id=${'qbo-invoice-'+before.id} AND deleted=false AND data->>'status'='awaiting_approval' AND EXISTS (SELECT 1 FROM um_rows WHERE tbl='audit_log' AND id=${audit.id})`,
    tx`UPDATE um_rows SET data=data||${JSON.stringify({status:approved?'open':'void',accounting_status:accountingStatus})}::jsonb,updated_at=now() WHERE tbl='invoices' AND id=${'INV-'+before.id} AND deleted=false AND data->>'status'='awaiting_approval' AND EXISTS (SELECT 1 FROM um_rows WHERE tbl='audit_log' AND id=${audit.id})`,
    tx`UPDATE um_rows SET data=data||jsonb_build_object('workflow_state',${approved?'waiting_payment':'cancelled'}::text,'accounting_status',${accountingStatus}::text,'events',COALESCE(data->'events','[]'::jsonb)||${JSON.stringify([event])}::jsonb),updated_at=now() WHERE tbl='commerce_orders' AND id=${String(before.commerce_order_id||'')} AND deleted=false AND EXISTS (SELECT 1 FROM um_rows WHERE tbl='audit_log' AND id=${audit.id})`,
   ]:[]),
  ]);
  if(!result[0]?.length)return sendJson(res,409,{error:'order_changed_review_again'});
  let accounting=null;
  if(plan.wasPending&&approved){try{accounting=await syncOrderAccounting(sql,before.id);}catch{accounting={status:'retry_required'};}}
  return sendJson(res,200,{ok:true,approval:plan.approval,accounting});
 }catch{return sendJson(res,500,{error:'approval_failed'});}
}
