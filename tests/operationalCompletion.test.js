import process from 'node:process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planFinancialDecision,planFinanceRelease,paymentReleaseGate,financialFingerprint} from '../api/_lib/financialDecisions.js';
import {planShipmentExecution,shipmentExecutionGate,shipmentBillFingerprint} from '../api/_lib/shipmentExecution.js';
import {planInvoicePayment} from '../api/_lib/arPayment.js';
import {planQuotePrices,quotePricingGate} from '../api/_lib/quotePricing.js';
import {planPaidOrderRelease,planOrderHandoff} from '../api/_lib/orderLifecycle.js';
import {buildLabelRequest} from '../api/_lib/orderShipping.js';
process.env.UNITE_ASHLEY_EMAIL='accounting@unitemedical.net';
const ashley={user_id:'a',email:'accounting@unitemedical.net',role:'finance'},damon={user_id:'d',email:'damon@unitemedical.net',role:'admin'},jacobe={user_id:'j',email:'jacobe@unitemedical.net',role:'sales'},darren={user_id:'w',email:'darren@unitemedical.net',role:'warehouse_operator'};
const now=new Date('2026-09-23T12:00:00Z');
const baseOrder={id:'O1',customer_id:'C1',status:'payment_pending',payment_status:'paid',paid_amount:100,total:100};
const release=order=>planFinanceRelease({order,actor:ashley,input:{reason:'Bank matched',reference:'bank-123'},now}).order;
const invoice={id:'I1',order_id:'O1',customer_id:'C1',amount:100,balance:70,paid_amount:30,status:'partial'};
const request=(kind,target,amount)=>planFinancialDecision({target,actor:ashley,input:{action:'request',kind,amount,reason:'Documented exception',reference:'review-123'},now}).decision;
const approve=(target,decision)=>planFinancialDecision({target,decision,actor:damon,input:{action:'approve',expected_revision:decision.revision,reason:'Approved exception'},now}).decision;

test('paid release belongs to Ashley and binds to reviewed payment and commercial values',()=>{
 assert.equal(paymentReleaseGate(baseOrder).reason,'ashley_release_required');
 for(const actor of [damon,jacobe,darren,{...ashley,email:'other@example.com'}])assert.equal(planFinanceRelease({order:baseOrder,actor,input:{reason:'r',reference:'e'},now}).ok,false);
 const order=release(baseOrder);assert.equal(paymentReleaseGate(order).ok,true);
 assert.equal(paymentReleaseGate({...order,total:101}).ok,false);
 assert.equal(paymentReleaseGate({...order,paid_amount:99}).ok,false);
 assert.equal(planFinanceRelease({order,actor:ashley,input:{reason:'r',reference:'e'},now}).idempotent,true);
});
test('paid release preserves other holds and closed-order protection',()=>{
 for(const key of ['fulfillment_blocked','quality_hold','credit_hold'])assert.equal(planFinanceRelease({order:{...baseOrder,[key]:true},actor:ashley,input:{reason:'r',reference:'e'},now}).ok,false);
 for(const status of ['shipped','cancelled','refunded','delivered'])assert.equal(planFinanceRelease({order:{...baseOrder,status},actor:ashley,input:{reason:'r',reference:'e'},now}).ok,false);
 assert.equal(planFinanceRelease({order:{...baseOrder,total:10001},actor:ashley,input:{reason:'r',reference:'e'},now}).reason,'damon_approval_required');
});
test('write-off requires Ashley review, independent Damon approval and actual accounting evidence',()=>{
 const pending=request('write_off',invoice,20);assert.equal(pending.status,'pending_approval');
 assert.equal(planFinancialDecision({target:invoice,decision:pending,actor:ashley,input:{action:'approve',expected_revision:1,reason:'r'},now}).ok,false);
 const approved=approve(invoice,pending);
 assert.equal(planFinancialDecision({target:invoice,decision:approved,actor:ashley,input:{action:'record_write_off',expected_revision:2,reason:'r'},now}).ok,false);
 const result=planFinancialDecision({target:invoice,decision:approved,actor:ashley,input:{action:'record_write_off',expected_revision:2,reason:'Posted in QBO',reference:'QBO-CM-1'},now});
 assert.equal(result.target.balance,50);assert.equal(result.target.paid_amount,30);assert.equal(result.target.written_off_amount,20);assert.equal(result.decision.status,'completed');
});
test('stale balances, stale revisions, overages and nonfinite decisions are rejected',()=>{
 const pending=request('write_off',invoice,20);
 assert.equal(planFinancialDecision({target:{...invoice,balance:69},decision:pending,actor:damon,input:{action:'approve',expected_revision:1,reason:'r'},now}).reason,'financial_evidence_changed');
 assert.equal(planFinancialDecision({target:invoice,decision:pending,actor:damon,input:{action:'approve',expected_revision:0,reason:'r'},now}).reason,'records_changed_refresh');
 for(const amount of [-1,0,71,Infinity,NaN])assert.equal(planFinancialDecision({target:invoice,actor:ashley,input:{action:'request',kind:'write_off',amount,reason:'r',reference:'e'},now}).ok,false);
});
test('full write-off does not record cash or silently release an order',()=>{
 const result=planFinancialDecision({target:invoice,decision:approve(invoice,request('write_off',invoice,70)),actor:ashley,input:{action:'record_write_off',expected_revision:2,reason:'posted',reference:'QBO-CM-2'},now});
 assert.equal(result.target.status,'written_off');assert.equal(result.target.paid_amount,30);assert.equal(result.order,undefined);
});
test('credit exception is order-specific, two-stage, and preserves actual cash paid',()=>{
 const order={...baseOrder,payment_status:'partial',paid_amount:20,credit_hold:true};
 const decision=approve(order,request('credit_release',order,80));
 const result=planFinanceRelease({order,decision,actor:ashley,input:{reason:'Release approved credit',reference:'review-1'},now});
 assert.equal(result.order.payment_status,'terms_approved');assert.equal(result.order.paid_amount,20);assert.equal(result.decision.status,'completed');assert.equal(result.order.credit_hold,false);
 assert.equal(planFinanceRelease({order:{...order,total:120},decision,actor:ashley,input:{reason:'r',reference:'e'},now}).ok,false);
});
function splitFixture(){
 return {order:{...release(baseOrder),shipping_plan_revision:1,shipment_plan:[{id:'first',phase:'now',status:'planned',items:[{sku:'A',qty:2}],charge:{final_amount:15}},{id:'second',phase:'later',status:'planned',items:[{sku:'A',qty:2}],charge:{final_amount:24}}]},items:[{id:'L1',order_id:'O1',sku:'A',qty:4}],inventory:[{id:'INV',sku:'A',warehouse_id:'wh_unite',on_hand:4,reserved:0}],lots:[{id:'LOT',product_sku:'A',warehouse_id:'wh_unite',qty_remaining:4,expiration_date:'2027-01-01'}],reservations:[],ownerLots:[]};
}
const act=(state,action,actor,extra={})=>planShipmentExecution({...state,actor,now,input:{action,shipment_id:extra.shipment_id||'first',expected_revision:state.order.shipping_plan_revision,reason:'Documented review',reference:'evidence-1',...extra}});
test('split dispatch reserves only selected quantity; label creation never means shipped; handoff is partial',()=>{
 let state=splitFixture();let result=act(state,'release',ashley);assert.equal(result.ok,true);assert.equal(result.inventory[0].reserved,2);assert.equal(result.inventory[0].on_hand,4);assert.equal(result.reservations[0].shipment_plan_id,'first');
 state={...state,...result};result=act(state,'record_label',darren,{tracking:'T1',carrier:'FedEx'});assert.equal(result.order.shipment_plan[0].status,'ready_to_ship');assert.equal(result.order.status,'payment_pending');
 state={...state,...result};result=act(state,'handoff',darren);assert.equal(result.ok,true);assert.equal(result.order.status,'partially_shipped');assert.equal(result.inventory[0].on_hand,2);assert.equal(result.lots[0].qty_remaining,2);assert.equal(result.order.shipment_plan[1].status,'planned');
 assert.equal(act({...state,...result},'handoff',darren).ok,false);
});
test('later shipment requires separate tax-reviewed invoice, customer approval and full payment',()=>{
 let state=splitFixture();assert.equal(act(state,'release',ashley,{shipment_id:'second'}).reason,'shipment_invoice_required');
 let result=act(state,'prepare_invoice',ashley,{shipment_id:'second',tax:1.5});assert.equal(result.invoice.amount,25.5);state={...state,...result};
 assert.equal(act(state,'release',ashley,{shipment_id:'second'}).reason,'customer_freight_approval_required');
 assert.equal(act(state,'approve_invoice',ashley,{shipment_id:'second'}).ok,false);
 result=act(state,'approve_invoice',jacobe,{shipment_id:'second'});state={...state,...result};
 assert.equal(act(state,'release',ashley,{shipment_id:'second'}).reason,'later_freight_payment_pending');
 result=planInvoicePayment({invoice:state.invoice,order:state.order,actorId:ashley.user_id,now,input:{provider:'off_platform',method:'ach',payment_reference:'extra-freight',amount:25.5}});assert.equal(result.ok,true);assert.equal(result.order.paid_amount,100);assert.equal(result.invoice.paid_amount,25.5);assert.equal(result.order.shipment_plan[1].charge.payment_status,'paid');
 state={...state,...result};assert.equal(act(state,'release',ashley,{shipment_id:'second'}).ok,true);
});
test('tax or invoice changes invalidate customer consent and freight cannot be paid without consent',()=>{
 const state=splitFixture(),result=act(state,'prepare_invoice',ashley,{shipment_id:'second',tax:0});
 assert.equal(planInvoicePayment({invoice:result.invoice,order:result.order,actorId:'a',input:{amount:24,provider:'off_platform',method:'ach',payment_reference:'e'}}).ok,false);
 const approved=act({...state,...result},'approve_invoice',jacobe,{shipment_id:'second'});
 assert.notEqual(shipmentBillFingerprint({...approved.invoice,tax:5}),approved.invoice.customer_approval.fingerprint);
 assert.equal(shipmentExecutionGate(approved.order,approved.order.shipment_plan[1],{...approved.invoice,tax:5,status:'paid',balance:0,paid_amount:24}).ok,false);
});
test('split action roles, existing whole-order reservations and closed orders fail safely',()=>{
 const state=splitFixture();assert.equal(act(state,'release',darren).ok,false);assert.equal(act(state,'record_label',ashley).ok,false);
 assert.equal(act({...state,reservations:[{id:'old',order_id:'O1',status:'held'}]},'release',ashley).reason,'existing_allocation_needs_reconciliation');
 assert.equal(act({...state,order:{...state.order,status:'cancelled'}},'prepare_invoice',ashley,{shipment_id:'second',tax:0}).ok,false);
 assert.equal(act({...state,inventory:[{...state.inventory[0],on_hand:1}]},'release',ashley).reason,'allocation_shortfall');
});
test('label and custody enforce Ashley review even if an old order already has stock held',()=>{
 assert.equal(buildLabelRequest({order:{...baseOrder,status:'inventory_reserved'}}).reason,'ashley_release_required');
 assert.equal(planOrderHandoff({order:baseOrder}).reason,'ashley_release_required');
 assert.equal(planPaidOrderRelease({order:{...baseOrder,status:'cancelled'}}).reason,'order_closed');
});
const quote={id:'Q1',customer_id:'C1',status:'draft',revision:1,total:100};
const quoteItems=[{id:'QI1',sku:'A',target_qty:2,sell_per_unit:50,ext_sell:100}];
const products=[{id:'A',sku:'A',price:50,landed_cost:30}];
test('new quote prices enforce named authority and 35% gross margin without changing existing contracts',()=>{
 const input={expected_revision:1,reason:'Reviewed quote',prices:[{id:'QI1',unit_price:46.16}]};
 assert.equal(planQuotePrices({quote,items:quoteItems,products,actor:jacobe,input,now}).ok,true);
 assert.equal(planQuotePrices({quote,items:quoteItems,products,actor:jacobe,input:{...input,prices:[{id:'QI1',unit_price:40}]},now}).reason,'damon_approval_required');
 const result=planQuotePrices({quote,items:quoteItems,products,actor:damon,input:{...input,prices:[{id:'QI1',unit_price:40}]},now});assert.equal(result.ok,true);assert.equal(result.quote.totals_verified,false);assert.equal(result.quote.acceptance_token_hash,null);assert.equal(result.quote.revision,2);
 assert.equal(planQuotePrices({quote,items:quoteItems,products,actor:{...damon,email:'another@example.com'},input,now}).ok,false);
 assert.equal(quotePricingGate({quote,items:[{...quoteItems[0],sell_per_unit:20}],products,organization:{id:'C1',tier:'C'},contractRows:[{org_id:'C1',product_sku:'A',unit_price:20,status:'active'}]}).ok,true);
});
test('quote approval cannot cover changed items or unsupported cost',()=>{
 const result=planQuotePrices({quote,items:quoteItems,products,actor:damon,input:{expected_revision:1,reason:'r',prices:[{id:'QI1',unit_price:40}]},now});
 assert.equal(quotePricingGate({quote:result.quote,items:result.items,products,organization:{id:'C1'}}).ok,true);
 assert.equal(quotePricingGate({quote:result.quote,items:[{...result.items[0],sell_per_unit:39}],products,organization:{id:'C1'}}).ok,false);
 assert.equal(planQuotePrices({quote,items:quoteItems,products:[],actor:damon,input:{expected_revision:1,reason:'r',prices:[{id:'QI1',unit_price:40}]},now}).ok,false);
});
test('financial fingerprint ignores presentation updates but binds amount and customer',()=>{
 assert.equal(financialFingerprint(baseOrder,'release'),financialFingerprint({...baseOrder,status:'inventory_reserved'},'release'));
 assert.notEqual(financialFingerprint(baseOrder,'release'),financialFingerprint({...baseOrder,customer_id:'C2'},'release'));
});

test('recorded quote pricing approval expires when verified cost changes',()=>{
 const quote={id:'cost-q',customer_id:'c',revision:1,status:'draft'};
 const items=[{id:'cost-i',sku:'s',qty:1,unit_price:50}];
 const actor={user_id:'j',email:'jacobe@unitemedical.net',role:'sales'};
 const products=[{id:'s',sku:'s',landed_cost:30}];
 const planned=planQuotePrices({quote,items,products,actor,input:{expected_revision:1,reason:'Verified cost and price',prices:[{id:'cost-i',unit_price:50}]}});
 assert.equal(planned.ok,true);
 assert.equal(quotePricingGate({...planned,products,organization:{id:'c'}}).ok,true);
 assert.equal(quotePricingGate({...planned,products:[{id:'s',sku:'s',landed_cost:40}],organization:{id:'c'}}).ok,false);
});

test('collecting a written-down balance does not mark the whole order paid',()=>{
 const plan=planInvoicePayment({invoice:{id:'i-write',order_id:'o-write',amount:100,balance:60,paid_amount:20,written_off_amount:20,status:'partial'},order:{id:'o-write',total:100,paid_amount:20,payment_status:'partial'},input:{provider:'off_platform',payment_reference:'final-60',method:'ach',amount:60},actorId:'ashley'});
 assert.equal(plan.ok,true);assert.equal(plan.invoice.balance,0);assert.equal(plan.invoice.status,'settled');assert.equal(plan.invoice.paid_amount,80);assert.equal(plan.order.paid_amount,80);assert.equal(plan.order.payment_status,'partial');
});

test('Damon can reject a stale review without applying it',()=>{
 const target={id:'reject-invoice',amount:100,balance:100,paid_amount:0};
 const review=planFinancialDecision({target,actor:ashley,input:{action:'request',kind:'write_off',amount:10,reference:'r',reason:'review'}}).decision;
 const changed={...target,balance:50,paid_amount:50};
 const input={action:'reject',expected_revision:review.revision,reason:'Balance changed; review again'};
 assert.equal(planFinancialDecision({target:changed,decision:review,actor:ashley,input}).ok,false);
 const rejected=planFinancialDecision({target:changed,decision:review,actor:damon,input});assert.equal(rejected.ok,true);assert.equal(rejected.decision.status,'rejected');assert.equal(rejected.target,undefined);
});
