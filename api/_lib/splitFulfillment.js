import { ordinaryParcelCharge, isDamon, isJacobe, isAshley, emailOf } from './launchPolicy.js';
export const canEditShipping = actor => isDamon(actor) || isJacobe(actor) || isAshley(actor);
const cents = n => Math.round(Number(n)*100);
export function publicShipmentPlan(plan = []) {
 return (Array.isArray(plan)?plan:[]).map(s=>({id:s.id,items:s.items.map(i=>({sku:i.sku,qty:i.qty})),phase:s.phase,timing:s.expected_date||'Awaiting supplier confirmation',status:s.status||'planned',tracking_number:s.tracking_number||null,carrier:s.carrier||null,freight:s.charge?.final_amount??null,freight_status:s.charge?.waived?'waived':s.charge?.approval_status||'pending',payment_status:s.charge?.payment_status||'pending'}));
}
export function planSplitAction({order,items=[],actor,input={},now=new Date()}){
 if(!order?.id)return {ok:false,reason:'order_not_found'};
 if(!canEditShipping(actor))return {ok:false,reason:'shipping_authority_required'};
 if(['cancelled','canceled','refunded','shipped','delivered','closed'].includes(order.status))return {ok:false,reason:'order_closed'};
 const plan=structuredClone(order.shipment_plan||[]),at=now.toISOString();
 const event={actor_id:actor.user_id,actor_email:emailOf(actor),at,reason:String(input.reason||'').trim()};
 if(!event.reason)return {ok:false,reason:'reason_required'};
 if(input.action==='save_plan'){
  if(plan.some(s=>s.invoice_id||s.release||s.charge?.payment_status==='paid'||['shipped','cancelled'].includes(s.status)))return {ok:false,reason:'settled_plan_requires_reconciliation'};
  if(!Array.isArray(input.shipments)||input.shipments.length<2||input.shipments.length>20)return {ok:false,reason:'split_shipments_required'};
  const totals=new Map(),ids=new Set();
  const shipments=[];
  for(const [index,s] of input.shipments.entries()){
   if(!/^[a-zA-Z0-9_-]{1,80}$/.test(s.id||'')||ids.has(s.id)||!Array.isArray(s.items)||!s.items.length)return {ok:false,reason:'invalid_shipment'};
   ids.add(s.id);
   if(new Set(s.items.map(i=>i.sku)).size!==s.items.length)return {ok:false,reason:'invalid_allocation'};
   for(const item of s.items){if(!items.some(i=>i.sku===item.sku)||!Number.isInteger(item.qty)||item.qty<=0)return {ok:false,reason:'invalid_allocation'};totals.set(item.sku,(totals.get(item.sku)||0)+item.qty);}
   if(s.expected_date && (!/^\d{4}-\d{2}-\d{2}$/.test(s.expected_date)||!Number.isFinite(Date.parse(s.expected_date))||new Date(s.expected_date).toISOString().slice(0,10)!==s.expected_date))return {ok:false,reason:'invalid_expected_date'};
   const charge=index===0?{calculated_amount:Number(order.shipping_calculated??order.freight??order.shipping_cost??0),final_amount:Number(order.freight??order.shipping_cost??0),approval_status:'included_in_order',payment_status:order.payment_status,handling_fee:Number(order.shipping_handling_fee??15)}:s.carrier_cost==null?{final_amount:null,approval_status:'pending_amount',payment_status:'pending',handling_fee:0}:ordinaryParcelCharge(s.carrier_cost,{laterShipment:true,arrangement:order.shipping_arrangement||{markup_pct:order.shipping_materials_markup_pct??20}});
   if(charge.ok===false)return charge;
   shipments.push({id:s.id,items:s.items.map(i=>({sku:i.sku,qty:i.qty})),phase:index===0?'now':'later',expected_date:s.expected_date||null,internal_origin:String(s.internal_origin||''),status:'planned',charge:{...charge,...(index?{approval_status:charge.final_amount==null?'pending_amount':'customer_approval_pending',payment_status:'pending'}:{})},follow_up_owner:'Jacobe'});
  }
  const ordered=new Map();for(const item of items)ordered.set(item.sku,(ordered.get(item.sku)||0)+Number(item.qty));
  if([...ordered].some(([sku,qty])=>totals.get(sku)!==qty))return {ok:false,reason:'allocation_must_match_order'};
  return {ok:true,order:{...order,shipment_plan:shipments,shipping_plan_revision:Number(order.shipping_plan_revision||0)+1,updated_at:at},event,notify_accounting:true,notify_customer:true};
 }
 const shipment=plan.find(s=>s.id===input.shipment_id);if(!shipment)return {ok:false,reason:'shipment_not_found'};
 if(shipment.invoice_id||shipment.release)return {ok:false,reason:'shipment_invoice_locked'};
 if(shipment.status==='shipped')return {ok:false,reason:'shipped_plan_requires_reconciliation'};
 const charge=shipment.charge;
 if(input.action==='set_later_freight'){
  if(shipment.phase!=='later'||charge.payment_status==='paid')return {ok:false,reason:'charge_already_settled_or_initial'};
  const priced=ordinaryParcelCharge(input.carrier_cost,{laterShipment:true,arrangement:order.shipping_arrangement||{markup_pct:order.shipping_materials_markup_pct??20}});if(!priced.ok)return priced;
  shipment.charge={...priced,approval_status:'customer_approval_pending',payment_status:'pending',changed_by:event};
 }else if(input.action==='record_customer_approval'){
  if(!isJacobe(actor))return {ok:false,reason:'jacobe_customer_approval_required'};
  if(charge.final_amount==null||!String(input.customer_approval_reference||'').trim())return {ok:false,reason:'amount_and_customer_approval_evidence_required'};
  shipment.charge={...charge,approval_status:'approved',approved_amount:charge.final_amount,approval_reference:input.customer_approval_reference,approved_by:event};
 }else if(input.action==='record_freight_payment'){
  if(!isAshley(actor))return {ok:false,reason:'ashley_payment_review_required'};
  if(charge.payment_status==='paid')return {ok:false,reason:'charge_already_paid'};
  if(plan.some(s=>s.id!==shipment.id&&s.charge?.payment_reference===String(input.payment_reference||'').trim()))return {ok:false,reason:'payment_reference_already_used'};
  if(charge.approval_status!=='approved'||cents(input.amount)!==cents(charge.final_amount)||!String(input.payment_reference||'').trim())return {ok:false,reason:'approved_amount_and_payment_reference_required'};
  shipment.charge={...charge,payment_status:'paid',payment_reference:input.payment_reference,paid_by:event};
 }else if(input.action==='waive_freight'){
  if(shipment.phase!=='later'||charge.payment_status==='paid')return {ok:false,reason:'paid_charge_requires_refund_review'};
  shipment.charge={...charge,final_amount:0,waived:true,approval_status:'waived',payment_status:'waived',waiver:event};
 }else return {ok:false,reason:'invalid_split_action'};
 return {ok:true,order:{...order,shipment_plan:plan,shipping_plan_revision:Number(order.shipping_plan_revision||0)+1,updated_at:at},event,notify_accounting:true,notify_customer:true};
}
export function laterShipmentReleaseGate(shipment){
 const c=shipment?.charge;
 if(shipment?.phase!=='later')return {ok:true};
 if(c?.waived&&c.final_amount===0)return {ok:true};
 if(c?.approval_status!=='approved'||c.approved_amount!==c.final_amount)return {ok:false,reason:'customer_freight_approval_required'};
 if(c.payment_status!=='paid')return {ok:false,reason:'later_freight_payment_pending'};
 return {ok:true};
}
