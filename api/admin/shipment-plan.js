import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {planSplitAction,publicShipmentPlan} from '../_lib/splitFulfillment.js';
import {buildCustomerIoOutbox} from '../_lib/customerioOutbox.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed'});if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 try{const sql=neon(process.env.DATABASE_URL);const live=await authorizeLiveRequest(req,sql,{roles:['admin','sales','sales_manager','finance']});if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
 const input=JSON.parse((await readRawBody(req)).toString('utf8'));const rows=await sql`SELECT data FROM um_rows WHERE tbl='orders' AND id=${String(input.order_id||'')} AND deleted=false`;const order=rows[0]?.data;
 if(!order)return sendJson(res,404,{error:'order_not_found'});
 if(Number(input.expected_revision)!==Number(order.shipping_plan_revision||0))return sendJson(res,409,{error:'shipment_plan_changed'});
 if(input.action==='record_freight_payment')return sendJson(res,409,{error:'use_freight_invoice_payment'});
 if(input.action==='save_plan'){const reserved=await sql`SELECT id FROM um_rows WHERE tbl='reservations' AND data->>'order_id'=${order.id} AND deleted=false AND data->>'status' IN ('held','committed')`;if(reserved.length)return sendJson(res,409,{error:'existing_allocation_needs_reconciliation'});}
 const itemRows=await sql`SELECT data FROM um_rows WHERE tbl='order_items' AND data->>'order_id'=${order.id} AND deleted=false`;
 const plan=planSplitAction({order,items:itemRows.map(r=>r.data),actor:live.session,input});if(!plan.ok)return sendJson(res,409,{error:plan.reason});
 const nonce=crypto.randomUUID();plan.order.shipping_plan_nonce=nonce;
 const audit={id:nonce,kind:`shipping.${input.action}`,ref_id:order.id,payload:plan.event,created_at:plan.event.at};
 const task={id:`freight_${nonce}`,kind:'pending_freight_changed',owner_name:'Ashley',owner_email:process.env.UNITE_ASHLEY_EMAIL||null,subject:`Freight update · ${order.id}`,order_id:order.id,customer_id:order.customer_id,shipment_id:input.shipment_id||null,reason:input.reason,shipments:publicShipmentPlan(plan.order.shipment_plan),status:'open',created_at:plan.event.at};
 const persisted=[['audit_log',audit],['tasks',task]];
 const publicPlan=publicShipmentPlan(plan.order.shipment_plan);
 for(const [recipient,kind] of [[process.env.UNITE_ASHLEY_EMAIL,'accounting'],[order.contact_email,'customer']])if(recipient){const n=buildCustomerIoOutbox({idempotency_key:`${nonce}:${kind}`,to:recipient,transactional_message_id:'shipment_plan_updated',subject:`Shipment plan updated · ${order.id}`,body:`Order ${order.id} will ship in parts.\n${publicPlan.map(s=>`${s.id}: ${s.items.map(i=>`${i.sku} × ${i.qty}`).join(', ')}; ${s.phase}; ${s.timing}; freight ${s.freight==null?'pending':`$${s.freight.toFixed(2)}`}; ${s.freight_status}; payment ${s.payment_status}`).join('\n')}`,ref_type:'order',ref_id:order.id});persisted.push(['customerio_outbox',n]);}
 const results=await sql.transaction(tx=>[
 tx`UPDATE um_rows SET data=${JSON.stringify(plan.order)}::jsonb,updated_at=now() WHERE tbl='orders' AND id=${order.id} AND data=${JSON.stringify(order)}::jsonb RETURNING id`,
 ...persisted.map(([table,row])=>tx`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT ${table},${row.id},${JSON.stringify(row)}::jsonb,false,now() WHERE EXISTS(SELECT 1 FROM um_rows WHERE tbl='orders' AND id=${order.id} AND data->>'shipping_plan_nonce'=${nonce}) ON CONFLICT(tbl,id) DO NOTHING`),
 ]);
 if(!results[0].length)return sendJson(res,409,{error:'order_changed_retry'});return sendJson(res,200,{ok:true,order:plan.order});
 }catch{return sendJson(res,500,{error:'shipment_plan_update_failed'});}
}
