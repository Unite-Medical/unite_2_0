import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {atomicTransition} from '../_lib/atomicTransition.js';
import {planShipmentExecution,shipmentPermissions,shipmentInvoiceId,shipmentRecordId,shipmentBillFingerprint} from '../_lib/shipmentExecution.js';
import {buildSettlementDrafts} from '../_lib/distributorSettlement.js';
import {isJacobe} from '../_lib/launchPolicy.js';

const TABLES=['orders','order_items','invoices','shipments','reservations','inventory','lots','inventory_lots','distributor_products','organizations'];
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
  if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
  try{
    const sql=neon(process.env.DATABASE_URL),live=await authorizeLiveRequest(req,sql,{roles:['admin','finance','sales','sales_manager','warehouse_operator','warehouse_manager']});
    if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
    if(['sales','sales_manager'].includes(live.session.role)&&!isJacobe(live.session))return sendJson(res,403,{error:'shipping_authority_required'});
    const rows=await sql`SELECT tbl,data FROM um_rows WHERE tbl=ANY(${TABLES}) AND deleted=false`;
    const table=name=>rows.filter(r=>r.tbl===name).map(r=>r.data),permissions=shipmentPermissions(live.session),warehouse=live.session.role.startsWith('warehouse');
    if(req.method==='GET')return sendJson(res,200,{ok:true,permissions,orders:table('orders').filter(o=>o.shipment_plan?.length>1).map(o=>({id:o.id,status:o.status,revision:o.shipping_plan_revision||0,payment_status:o.payment_status,shipments:o.shipment_plan.map(s=>{
      const invoice=table('invoices').find(i=>i.id===shipmentInvoiceId(o.id,s.id));
      return {id:s.id,phase:s.phase,items:s.items,status:s.status||'planned',expected_date:s.expected_date||null,tracking_number:s.tracking_number||null,carrier:s.carrier||null,waived:!!s.charge?.waived,recovery_count:s.recovery_history?.length||0,invoice_id:invoice?.id||null,customer_approved:!!invoice?.customer_approval&&invoice.customer_approval.fingerprint===shipmentBillFingerprint(invoice)&&invoice.customer_approval.actor_email==='jacobe@unitemedical.net',payment_status:invoice?.status||s.charge?.payment_status||'pending',...(!warehouse?{correction_markup_pct:Number(o.shipping_arrangement?.markup_pct??o.shipping_materials_markup_pct??20),correction_handling:Number(o.shipping_arrangement?.handling_flat??0),freight:s.charge?.final_amount??null,tax:invoice?.tax??null,amount:invoice?.amount??null,balance:invoice?.balance??null}:{})};
    })}))});
    const input=JSON.parse((await readRawBody(req)).toString('utf8')),order=table('orders').find(o=>o.id===input.order_id);
    const invoice=table('invoices').find(i=>i.id===shipmentInvoiceId(input.order_id,input.shipment_id))||null,record=table('shipments').find(s=>s.id===shipmentRecordId(input.order_id,input.shipment_id))||null;
    const items=table('order_items').filter(i=>i.order_id===input.order_id);
    const plan=planShipmentExecution({order,items,invoice,record,reservations:table('reservations').filter(r=>r.order_id===input.order_id),inventory:table('inventory'),lots:table('lots'),ownerLots:table('inventory_lots'),actor:live.session,input});
    if(!plan.ok)return sendJson(res,409,{error:plan.reason});
    const checks=[{table:'orders',id:order.id,before:order},...items.map(i=>({table:'order_items',id:i.id,before:i}))],writes=[{table:'orders',before:order,data:plan.order}];
    if(invoice)checks.push({table:'invoices',id:invoice.id,before:invoice});
    if(record)checks.push({table:'shipments',id:record.id,before:record});
    if(plan.invoice)writes.push({table:'invoices',before:invoice,data:plan.invoice});
    if(plan.record)writes.push({table:'shipments',before:record,data:plan.record});
    for(const [key,tbl]of [['inventory','inventory'],['owner_lots','inventory_lots'],['lots','lots'],['reservations','reservations']])for(const next of plan[key]||[]){
      const before=table(tbl).find(r=>r.id===next.id)||null;if(JSON.stringify(before)===JSON.stringify(next))continue;
      if(before)checks.push({table:tbl,id:before.id,before});writes.push({table:tbl,before,data:next});
    }
    // Quality states used in allocation are checked too, even when no quantity
    // changes yet. A concurrent recall cannot race a release into usable stock.
    if(input.action==='release')for(const lot of [...table('lots'),...table('inventory_lots')].filter(l=>items.some(i=>(i.inventory_sku||i.sku)===l.product_sku))){
      const tbl=table('lots').includes(lot)?'lots':'inventory_lots';if(!checks.some(c=>c.table===tbl&&c.id===lot.id))checks.push({table:tbl,id:lot.id,before:lot});
    }
    for(const [key,tbl]of [['movements','stock_movements'],['genealogy','lot_tracking']])for(const r of plan[key]||[])writes.push({table:tbl,data:{...r,shipment_plan_id:input.shipment_id}});
    if(plan.settlement_candidates?.length){
      const settlement=buildSettlementDrafts({candidates:plan.settlement_candidates,agreements:table('distributor_products'),organizations:table('organizations')});if(!settlement.ok)return sendJson(res,409,{error:settlement.reason});
      for(const agreement of table('distributor_products'))checks.push({table:'distributor_products',id:agreement.id,before:agreement});
      for(const movement of plan.consignment_movements)writes.push({table:'consignment_movements',data:{...movement,...settlement.movements.find(m=>m.id===movement.id)}});
      for(const candidate of settlement.candidates)writes.push({table:'settlement_candidates',data:{...candidate,id:candidate.movement_id}});
      for(const po of settlement.purchase_orders){writes.push({table:'purchase_orders',data:po});writes.push({table:'consignment_settlement_links',data:{id:crypto.randomUUID(),owner_org_id:po.owner_org_id,settlement_po_id:po.id,internal_order_id:order.id,shipment_plan_id:input.shipment_id,created_at:new Date().toISOString()}});}
    }else for(const movement of plan.consignment_movements||[])writes.push({table:'consignment_movements',data:movement});
    const at=new Date().toISOString();writes.push({table:'audit_log',data:{id:crypto.randomUUID(),kind:`shipment.${input.action}`,order_id:order.id,ref_id:order.id,actor_id:live.session.user_id,payload:{shipment_id:input.shipment_id,reason:input.reason,reference:input.reference},created_at:at}});
    if(input.action==='handoff')writes.push({table:'tasks',data:{id:crypto.randomUUID(),kind:'shipment_customer_update',owner_email:'jacobe@unitemedical.net',order_id:order.id,subject:`Tracking update ready · ${order.id} / ${input.shipment_id}`,next_action:order.blind_ship?'Send tracking to the distributor contact only.':'Send the customer this shipment’s tracking update.',status:'open',created_at:at}});
    if(plan.recovery){
      const reviewers=input.action==='cancel_shipment'?[['accounting','finance_shipment_cancelled',process.env.UNITE_ASHLEY_EMAIL,'Review cancellation against goods, freight invoices, payments and refunds. Nothing was refunded or credited automatically.'],['sales','customer_shipment_cancelled','jacobe@unitemedical.net','Review the cancelled allocation and coordinate the customer update.']]:input.action==='correct_invoice'?[['sales','customer_freight_corrected','jacobe@unitemedical.net','Obtain fresh customer approval of the corrected freight and tax total.']]:[['finance','finance_shipment_returned',process.env.UNITE_ASHLEY_EMAIL,'Review why picking stopped before reserving this shipment again.']];
      for(const [team,kind,owner_email,next_action]of reviewers)writes.push({table:'tasks',data:{id:crypto.randomUUID(),kind,owner_email,team,ref_type:'order',ref_id:order.id,order_id:order.id,shipment_plan_id:input.shipment_id,subject:`Shipment needs review · ${order.id} / ${input.shipment_id}`,next_action,status:'open',created_at:at}});
    }
    const saved=await atomicTransition(sql,{checks,writes});if(!saved.ok)return sendJson(res,409,{error:saved.reason});
    return sendJson(res,200,{ok:true,status:plan.order.status});
  }catch{return sendJson(res,500,{error:'shipment_action_failed'});}
}
