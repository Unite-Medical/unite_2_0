import {RECOVERY_ACTIONS,planShipmentRecovery} from './shipmentRecovery.js';
import crypto from 'node:crypto';
import {isAshley,isJacobe,isDamon,emailOf} from './launchPolicy.js';
import {orderApprovalGate} from './orderApproval.js';
import {paymentReleaseGate} from './financialDecisions.js';
import {planPaidOrderRelease,planOrderHandoff} from './orderLifecycle.js';

const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const clean=v=>String(v||'').trim().slice(0,2000);
const round=v=>Math.round(Number(v)*100)/100;
export const shipmentInvoiceId=(orderId,shipmentId)=>`freight_${hash([orderId,shipmentId]).slice(0,24)}`;
export const shipmentRecordId=(orderId,shipmentId)=>`shp_${hash([orderId,shipmentId]).slice(0,24)}`;
export const shipmentBillFingerprint=invoice=>hash([invoice.id,invoice.order_id,invoice.shipment_id,invoice.amount,invoice.freight,invoice.tax,invoice.tax_reference,invoice.revision||1]);
export function shipmentExecutionGate(order,shipment,invoice){
  if(shipment?.status==='cancelled')return {ok:false,reason:'shipment_cancelled'};
  if(!order||['cancelled','canceled','refunded','shipped','delivered','closed'].includes(order.status))return {ok:false,reason:'order_closed'};
  const approval=orderApprovalGate(order);if(!approval.ok)return approval;
  const payment=paymentReleaseGate(order);if(!payment.ok)return payment;
  if(!['paid','terms_approved'].includes(order.payment_status))return {ok:false,reason:'payment_not_released'};
  if(order.fulfillment_blocked||order.credit_hold||order.quality_hold)return {ok:false,reason:'other_order_holds_remain'};
  if(shipment.phase==='later'){
    if(shipment.charge?.waived&&shipment.charge.final_amount===0)return {ok:true};
    if(!invoice||invoice.id!==shipmentInvoiceId(order.id,shipment.id)||invoice.freight!==shipment.charge?.final_amount)return {ok:false,reason:'shipment_invoice_required'};
    if(invoice.customer_approval?.fingerprint!==shipmentBillFingerprint(invoice)||invoice.customer_approval?.actor_email!=='jacobe@unitemedical.net')return {ok:false,reason:'customer_freight_approval_required'};
    if(invoice.status!=='paid'||Number(invoice.balance)!==0||Number(invoice.paid_amount)<Number(invoice.amount))return {ok:false,reason:'later_freight_payment_pending'};
  }
  return {ok:true};
}
export function planShipmentExecution({order,items=[],invoice=null,record=null,reservations=[],inventory=[],lots=[],ownerLots=[],actor,input,now=new Date()}){
  if(!order?.id||!(order.shipment_plan?.length>1))return {ok:false,reason:'split_order_required'};
  if(Number(input.expected_revision)!==Number(order.shipping_plan_revision||0))return {ok:false,reason:'records_changed_refresh'};
  const shipment=order.shipment_plan.find(s=>s.id===input.shipment_id);if(!shipment)return {ok:false,reason:'shipment_not_found'};
  if(['cancelled','canceled','refunded','shipped','delivered','closed'].includes(order.status))return {ok:false,reason:'order_closed'};
  const allocated=new Map(),ordered=new Map();
  for(const item of items)ordered.set(item.sku,(ordered.get(item.sku)||0)+Number(item.qty));
  for(const part of order.shipment_plan){
    if(!Array.isArray(part.items)||!part.items.length||new Set(part.items.map(i=>i.sku)).size!==part.items.length)return {ok:false,reason:'invalid_allocation'};
    for(const line of part.items){if(!ordered.has(line.sku)||!Number.isInteger(line.qty)||line.qty<=0)return {ok:false,reason:'invalid_allocation'};allocated.set(line.sku,(allocated.get(line.sku)||0)+line.qty);}
  }
  if([...ordered].some(([sku,qty])=>allocated.get(sku)!==qty))return {ok:false,reason:'allocation_must_match_order'};
  if(RECOVERY_ACTIONS.includes(input.action))return planShipmentRecovery({order,shipment,invoice,record,reservations,inventory,ownerLots,actor,input,now});
  if(shipment.status==='cancelled')return {ok:false,reason:'shipment_cancelled'};
  const reason=clean(input.reason),reference=clean(input.reference),at=now.toISOString();
  if(!reason||!reference)return {ok:false,reason:'review_evidence_required'};
  const next=structuredClone(order),current=next.shipment_plan.find(s=>s.id===shipment.id);
  next.shipping_plan_revision=Number(order.shipping_plan_revision||0)+1;next.updated_at=at;
  const event={actor_id:actor.user_id,actor_email:emailOf(actor),reason,reference,at};
  if(input.action==='prepare_invoice'){
    if(!isAshley(actor))return {ok:false,reason:'ashley_review_required'};
    if(invoice||shipment.status!=='planned'||shipment.phase!=='later'||shipment.charge?.waived)return {ok:false,reason:'shipment_invoice_locked'};
    const freight=shipment.charge?.final_amount,tax=round(input.tax);
    if(freight==null||!Number.isFinite(Number(freight))||Number(freight)<0||input.tax==null||input.tax===''||!Number.isFinite(tax)||tax<0)return {ok:false,reason:'freight_and_tax_required'};
    const id=shipmentInvoiceId(order.id,shipment.id),amount=round(Number(freight)+tax);
    const bill={id,order_id:order.id,shipment_id:shipment.id,kind:'shipment_freight',customer_id:order.customer_id,customer_name:order.customer_name,amount,total:amount,freight:Number(freight),tax,tax_reference:reference,balance:amount,paid_amount:0,status:amount===0?'paid':'open',terms:'due_on_receipt',currency:'USD',due_date:at.slice(0,10),created_at:at,review:event};
    current.invoice_id=id;return {ok:true,order:next,invoice:bill};
  }
  if(input.action==='approve_invoice'){
    if(!isJacobe(actor))return {ok:false,reason:'jacobe_customer_approval_required'};
    if(!invoice||invoice.freight!==shipment.charge?.final_amount||shipment.status!=='planned')return {ok:false,reason:'shipment_invoice_required'};
    current.charge={...current.charge,approval_status:'approved',approved_amount:invoice.freight,approval_reference:reference};
    return {ok:true,order:next,invoice:{...invoice,customer_approval:{...event,fingerprint:shipmentBillFingerprint(invoice)},updated_at:at}};
  }
  const gate=shipmentExecutionGate(order,shipment,invoice);if(!gate.ok)return gate;
  const scoped=reservations.filter(r=>r.shipment_plan_id===shipment.id&&['held','committed'].includes(r.status));
  if(input.action==='release'){
    if(!isAshley(actor))return {ok:false,reason:'ashley_release_required'};
    if(shipment.status!=='planned'||record&&!['voided'].includes(record.status)||scoped.some(r=>['held','committed'].includes(r.status)))return {ok:false,reason:'shipment_already_released'};
    if(reservations.some(r=>!r.shipment_plan_id&&['held','committed'].includes(r.status)))return {ok:false,reason:'existing_allocation_needs_reconciliation'};
    const selected=[],cycle=Number(record?.reservation_cycle||0)+1;
    for(const allocation of shipment.items){
      const matching=items.filter(i=>i.sku===allocation.sku);
      if(matching.length!==1)return {ok:false,reason:'ambiguous_split_line'};
      const item=matching[0];selected.push({...item,id:`${item.id}:${shipment.id}:cycle${cycle}`,qty:allocation.qty,fulfillment_qty:allocation.qty});
    }
    const plan=planPaidOrderRelease({order:{...order,shipment_plan:[]},items:selected,inventory,lots,ownerLots,reservations:[],now});if(!plan.ok)return plan;
    current.status='inventory_reserved';current.release=event;
    return {ok:true,order:next,inventory:plan.inventory,owner_lots:plan.owner_lots,reservations:plan.reservations.map(r=>({...r,shipment_plan_id:shipment.id,order_item_id:items.find(i=>i.sku===r.sku)?.id})),record:{...record,reservation_cycle:cycle,id:shipmentRecordId(order.id,shipment.id),order_id:order.id,shipment_plan_id:shipment.id,status:'inventory_reserved',created_at:at}};
  }
  if(!['warehouse_operator','warehouse_manager','admin'].includes(actor.role))return {ok:false,reason:'warehouse_authority_required'};
  if(input.action==='record_label'){
    if(record?.status!=='inventory_reserved'||!clean(input.tracking)||!clean(input.carrier))return {ok:false,reason:'carrier_label_evidence_required'};
    current.status='ready_to_ship';current.tracking_number=clean(input.tracking);current.carrier=clean(input.carrier);
    return {ok:true,order:next,record:{...record,status:'label_created',tracking_number:current.tracking_number,carrier:current.carrier,provider:'external_verified',provider_shipment_id:reference,label_evidence:event,updated_at:at}};
  }
  if(input.action==='handoff'){
    if(record?.status!=='label_created'||shipment.status!=='ready_to_ship')return {ok:false,reason:'shipment_not_ready'};
    let plan;try{plan=planOrderHandoff({order:{...order,shipment_plan:[],status:'ready_to_ship'},shipment:record,reservations:scoped,inventory,lots,ownerLots,actorId:actor.user_id,handoffReference:reference,now});}catch(e){return {ok:false,reason:e.message.split(':')[0]};}if(!plan.ok)return plan;
    current.status='shipped';current.handoff=event;
    next.status=next.shipment_plan.every(s=>s.status==='shipped')?'shipped':'partially_shipped';
    if(next.shipment_plan.some(s=>s.status==='cancelled')&&next.shipment_plan.every(s=>['shipped','cancelled'].includes(s.status)))next.fulfillment_status='completed_with_cancellations';
    if(next.status==='shipped')next.shipped_at=at;
    return {...plan,order:next,record:plan.shipment};
  }
  return {ok:false,reason:'invalid_action'};
}
export function shipmentPermissions(actor){return {cancel:isDamon(actor),finance:isAshley(actor),customer:isJacobe(actor),plan:isAshley(actor)||isJacobe(actor)||isDamon(actor),warehouse:['admin','warehouse_manager','warehouse_operator'].includes(actor.role)};}
