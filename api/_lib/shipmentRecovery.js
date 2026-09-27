import {isAshley,isDamon,ordinaryParcelCharge,emailOf} from './launchPolicy.js';

const clean=value=>String(value||'').trim().slice(0,2000);
const integer=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0;
export const RECOVERY_ACTIONS=['correct_invoice','return_to_planning','cancel_shipment'];
const warehouse=actor=>['admin','warehouse_operator','warehouse_manager'].includes(actor?.role);
const terminal=shipment=>['shipped','delivered','cancelled'].includes(shipment.status);
const financiallyPosted=invoice=>!!(invoice?.accounting_reference||invoice?.qbo_id||invoice?.qbo_invoice_id||invoice?.external_id||invoice?.provider_invoice_id);

// Restoring a reservation only changes reserved quantities. It never increases
// on-hand stock, deletes movement evidence, or reverses carrier custody.
export function releaseShipmentReservations({order,shipment,reservations,inventory,ownerLots,event}){
 const scoped=reservations.filter(r=>r.order_id===order.id&&r.shipment_plan_id===shipment.id&&['held','committed'].includes(r.status));
 if(scoped.some(r=>r.status==='committed'))return {ok:false,reason:'shipped_stock_cannot_be_reversed'};
 if(['inventory_reserved','ready_to_ship'].includes(shipment.status)&&!scoped.length)return {ok:false,reason:'reservation_reconciliation_required'};
 const pools=structuredClone(inventory),owners=structuredClone(ownerLots),released=[];
 const allocated=new Map(shipment.items.map(i=>[i.sku,i.qty])),found=new Map();
 for(const reservation of scoped){
  if(!integer(reservation.qty)||Number(reservation.qty)<=0)return {ok:false,reason:'reservation_reconciliation_required'};
  const sku=reservation.ordered_sku||reservation.sku,quantity=Number(reservation.qty);
  found.set(sku,(found.get(sku)||0)+quantity);
  if(reservation.inventory_owner_type==='distributor'){
   const lot=owners.find(l=>l.id===reservation.inventory_lot_id&&l.owner_org_id===reservation.inventory_owner_org_id&&l.warehouse_id===reservation.warehouse_id&&(l.product_sku===(reservation.inventory_sku||sku)||l.distributor_sku===reservation.distributor_sku&&!!reservation.distributor_sku));
   if(!lot||!integer(lot.qty_reserved)||Number(lot.qty_reserved)<quantity)return {ok:false,reason:'reservation_reconciliation_required'};
   lot.qty_reserved=Number(lot.qty_reserved)-quantity;
  }else{
   const pool=pools.find(p=>p.id===reservation.inventory_id&&(p.owner_type||'unite')==='unite'&&p.sku===(reservation.inventory_sku||sku)&&p.warehouse_id===reservation.warehouse_id);
   if(!pool||!integer(pool.reserved)||Number(pool.reserved)<quantity)return {ok:false,reason:'reservation_reconciliation_required'};
   pool.reserved=Number(pool.reserved)-quantity;
  }
  released.push({...reservation,status:'released',released_at:event.at,recovery:event});
 }
 if(scoped.length&&([...allocated].some(([sku,qty])=>found.get(sku)!==qty)||[...found.keys()].some(sku=>!allocated.has(sku))))return {ok:false,reason:'reservation_reconciliation_required'};
 return {ok:true,inventory:pools,owner_lots:owners,reservations:released};
}

export function planShipmentRecovery({order,shipment,invoice,record,reservations=[],inventory=[],ownerLots=[],actor,input,now=new Date()}){
 const action=input.action;
 if(!RECOVERY_ACTIONS.includes(action))return {ok:false,reason:'invalid_action'};
 if(action==='correct_invoice'?!isAshley(actor):action==='cancel_shipment'?!isDamon(actor):!warehouse(actor))return {ok:false,reason:'shipment_recovery_authority_required'};
 if(terminal(shipment)||record?.handoff_reference||record?.handed_off_at||['shipped','delivered'].includes(record?.status))return {ok:false,reason:'shipped_stock_cannot_be_reversed'};
 const event={action,actor_id:actor.user_id,actor_email:emailOf(actor),reason:clean(input.reason),reference:clean(input.reference),at:now.toISOString()};
 if(!event.reason||!event.reference)return {ok:false,reason:'review_evidence_required'};
 const next=structuredClone(order),current=next.shipment_plan.find(s=>s.id===shipment.id);
 next.shipping_plan_revision=Number(order.shipping_plan_revision||0)+1;next.updated_at=event.at;
 if(action==='correct_invoice'){
  if(shipment.status!=='planned'||record&&!['voided','cancelled'].includes(record.status)||!invoice||invoice.kind!=='shipment_freight'||invoice.order_id!==order.id||invoice.shipment_id!==shipment.id)return {ok:false,reason:'return_to_planning_before_correction'};
  if(!['open','draft','paid'].includes(invoice.status)||Number(invoice.paid_amount||0)!==0||invoice.payment_evidence?.length||Number(invoice.written_off_amount||0)>0||financiallyPosted(invoice)||invoice.payment_intent_id||invoice.checkout_session_id)return {ok:false,reason:'paid_or_posted_invoice_requires_reconciliation'};
  const tax=Number(input.tax);
  if(input.tax==null||String(input.tax).trim()===''||!Number.isFinite(tax)||tax<0||Math.abs(tax*100-Math.round(tax*100))>0.00001)return {ok:false,reason:'freight_and_tax_required'};
  if(input.carrier_cost==null||String(input.carrier_cost).trim()==='')return {ok:false,reason:'freight_and_tax_required'};
  const priced=ordinaryParcelCharge(input.carrier_cost,{laterShipment:true,arrangement:order.shipping_arrangement||{markup_pct:order.shipping_materials_markup_pct??20}});
  if(!priced.ok)return priced;
  const freight=priced.final_amount,amount=Math.round((freight+tax)*100)/100;
  if(!Number.isFinite(amount)||amount<0)return {ok:false,reason:'freight_and_tax_required'};
  if(input.expected_total==null||!Number.isFinite(Number(input.expected_total))||Math.abs(Number(input.expected_total)-amount)>0.001)return {ok:false,reason:'corrected_total_changed_review_again'};
  const {revisions:prior=[],...previous}=invoice;
  const bill={...invoice,freight,tax,amount,total:amount,balance:amount,status:amount===0?'paid':'open',revision:Number(invoice.revision||1)+1,tax_reference:event.reference,customer_approval:null,review:event,revisions:[...prior,{...previous,superseded_at:event.at,superseded_by:actor.user_id}],updated_at:event.at};
  current.charge={...priced,approval_status:'customer_approval_pending',payment_status:bill.status};
  current.corrections=[...(current.corrections||[]),event];
  return {ok:true,order:next,invoice:bill,recovery:event};
 }
 if(!['planned','inventory_reserved','ready_to_ship'].includes(shipment.status)||action==='return_to_planning'&&shipment.status==='planned')return {ok:false,reason:'shipment_not_recoverable'};
 if(input.goods_in_warehouse!==true)return {ok:false,reason:'warehouse_custody_confirmation_required'};
 if(record&&!['inventory_reserved','label_created','voided','cancelled'].includes(record.status))return {ok:false,reason:'carrier_outcome_needs_reconciliation'};
 if(['inventory_reserved','ready_to_ship'].includes(shipment.status)&&(!record||record.order_id!==order.id||record.shipment_plan_id!==shipment.id))return {ok:false,reason:'reservation_reconciliation_required'};
 const hadLabel=record?.status==='label_created'||shipment.status==='ready_to_ship';
 if(hadLabel&&!clean(input.label_void_reference))return {ok:false,reason:'carrier_void_evidence_required'};
 if(hadLabel)event.label_void_reference=clean(input.label_void_reference);
 const released=releaseShipmentReservations({order,shipment,reservations,inventory,ownerLots,event});if(!released.ok)return released;
 current.status=action==='cancel_shipment'?'cancelled':'planned';current.release=null;current.tracking_number=null;current.carrier=null;
 current.recovery_history=[...(current.recovery_history||[]),{...event,previous_status:shipment.status,tracking_number:shipment.tracking_number||record?.tracking_number||null}];
 if(action==='cancel_shipment'){
  current.cancelled_at=event.at;
  next.fulfillment_status=next.shipment_plan.every(s=>s.status==='cancelled')?'cancelled':next.shipment_plan.every(s=>['shipped','cancelled'].includes(s.status))?'completed_with_cancellations':'partially_cancelled';
  if(next.fulfillment_status==='cancelled')next.status='cancelled';
 }
 // Keep invoice balances/payments intact for Ashley's accounting/refund review.
 // Cancelling goods does not silently void an external financial obligation.
 const nextRecord=record?{...record,status:action==='cancel_shipment'?'cancelled':'voided',tracking_number:null,carrier:null,provider_shipment_id:null,recovery_history:[...(record.recovery_history||[]),{...event,previous_status:record.status,tracking_number:record.tracking_number,provider_shipment_id:record.provider_shipment_id}],updated_at:event.at}:null;
 return {...released,order:next,record:nextRecord,recovery:event};
}
