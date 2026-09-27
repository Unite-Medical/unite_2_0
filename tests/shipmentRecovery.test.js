import process from 'node:process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planShipmentExecution,shipmentExecutionGate} from '../api/_lib/shipmentExecution.js';
import {planFinanceRelease} from '../api/_lib/financialDecisions.js';
import {planInvoicePayment} from '../api/_lib/arPayment.js';
import {authorizeLiveProfile,sessionFromRequest} from '../api/_lib/auth.js';
process.env.UNITE_ASHLEY_EMAIL='accounting@unitemedical.net';
const ashley={user_id:'a',email:'accounting@unitemedical.net',role:'finance'},damon={user_id:'d',email:'damon@unitemedical.net',role:'admin'},jacobe={user_id:'j',email:'jacobe@unitemedical.net',role:'sales'},darren={user_id:'w',email:'darren@unitemedical.net',role:'warehouse_operator'};
const now=new Date('2026-09-23T12:00:00Z');
function fixture(owner=false){
 const order=planFinanceRelease({order:{id:'R1',customer_id:'C1',total:100,paid_amount:100,payment_status:'paid',status:'payment_pending'},actor:ashley,input:{reason:'r',reference:'paid'},now}).order;
 return {order:{...order,shipping_plan_revision:1,shipment_plan:[{id:'first',phase:'now',status:'planned',items:[{sku:'S',qty:1}],charge:{final_amount:15}},{id:'later',phase:'later',status:'planned',items:[{sku:'S',qty:1}],charge:{final_amount:24}}]},items:[{id:'I1',order_id:'R1',sku:'S',qty:2,...(owner?{inventory_owner_type:'distributor',inventory_owner_org_id:'OWNER',inventory_sku:'O-S'}:{})}],inventory:[{id:'POOL',warehouse_id:'W',sku:'S',on_hand:10,reserved:0}],lots:[{id:'LOT',warehouse_id:'W',product_sku:'S',qty_remaining:10,expiration_date:'2027-01-01'}],ownerLots:[{id:'OWNERLOT',warehouse_id:'W',owner_org_id:'OWNER',product_sku:'O-S',qty_on_hand:10,qty_reserved:0}],reservations:[],records:{},invoices:{}};
}
function run(state,action,actor=ashley,extra={},part='first'){
 return planShipmentExecution({...state,invoice:state.invoices[part]||null,record:state.records[part]||null,actor,now,input:{action,shipment_id:part,expected_revision:state.order.shipping_plan_revision,reason:'Test evidence',reference:'REF',...(action==='correct_invoice'?{expected_total:Math.round((Number(extra.carrier_cost)*1.2+Number(extra.tax))*100)/100}:{}),...extra}});
}
function apply(state,result,part='first'){
 assert.equal(result.ok,true,result.reason);state.order=result.order;
 for(const [key,source]of [['inventory','inventory'],['ownerLots','owner_lots'],['lots','lots']])if(result[source])state[key]=result[source];
 if(result.reservations)state.reservations=[...state.reservations.filter(r=>!result.reservations.some(x=>x.id===r.id)),...result.reservations];
 if(result.record)state.records[part]=result.record;if(result.invoice)state.invoices[part]=result.invoice;
 return result;
}
test('return to planning and re-reserve keeps historical reservations and on-hand stock',()=>{
 const s=fixture();apply(s,run(s,'release'));const oldId=s.reservations[0].id;
 assert.equal(run(s,'return_to_planning',ashley,{goods_in_warehouse:true}).reason,'shipment_recovery_authority_required');
 assert.equal(run(s,'return_to_planning',darren).reason,'warehouse_custody_confirmation_required');
 apply(s,run(s,'return_to_planning',darren,{goods_in_warehouse:true}));assert.equal(s.inventory[0].on_hand,10);assert.equal(s.inventory[0].reserved,0);assert.equal(s.reservations[0].status,'released');
 apply(s,run(s,'release'));assert.equal(s.inventory[0].reserved,1);assert.equal(s.reservations.length,2);assert.notEqual(s.reservations.find(r=>r.status==='held').id,oldId);
 apply(s,run(s,'record_label',darren,{carrier:'test',tracking:'track'}));apply(s,run(s,'handoff',darren,{reference:'pickup'}));assert.equal(s.inventory[0].on_hand,9);assert.equal(s.inventory[0].reserved,0);assert.equal(s.reservations.find(r=>r.id===oldId).status,'released');
});
test('a label requires external void evidence before recovery; custody can never be undone',()=>{
 const s=fixture();apply(s,run(s,'release'));apply(s,run(s,'record_label',darren,{carrier:'test',tracking:'track'}));
 assert.equal(run(s,'return_to_planning',darren,{goods_in_warehouse:true}).reason,'carrier_void_evidence_required');
 apply(s,run(s,'return_to_planning',darren,{goods_in_warehouse:true,label_void_reference:'VOID-1'}));assert.equal(s.records.first.recovery_history[0].tracking_number,'track');assert.equal(s.inventory[0].on_hand,10);
 apply(s,run(s,'release'));apply(s,run(s,'record_label',darren,{carrier:'test',tracking:'track2'}));apply(s,run(s,'handoff',darren,{reference:'PICKUP'}));
 assert.equal(run(s,'return_to_planning',darren,{goods_in_warehouse:true,label_void_reference:'VOID-2'}).reason,'shipped_stock_cannot_be_reversed');
 assert.equal(run(s,'cancel_shipment',damon,{goods_in_warehouse:true}).reason,'shipped_stock_cannot_be_reversed');
});
test('owner-stock recovery changes only the matching owner lot reservation',()=>{
 const s=fixture(true);s.ownerLots.push({...s.ownerLots[0],id:'OTHER',owner_org_id:'OTHER',qty_reserved:3});apply(s,run(s,'release'));assert.equal(s.ownerLots[0].qty_reserved,1);
 apply(s,run(s,'return_to_planning',darren,{goods_in_warehouse:true}));assert.equal(s.ownerLots[0].qty_reserved,0);assert.equal(s.ownerLots[0].qty_on_hand,10);assert.equal(s.ownerLots[1].qty_reserved,3);assert.equal(s.inventory[0].on_hand,10);
});
test('reservation mismatches and uncertain carrier outcomes require reconciliation',()=>{
 const s=fixture();apply(s,run(s,'release'));s.inventory[0].reserved=0;assert.equal(run(s,'return_to_planning',darren,{goods_in_warehouse:true}).reason,'reservation_reconciliation_required');
 s.inventory[0].reserved=1;s.records.first.status='provider_unknown';assert.equal(run(s,'return_to_planning',darren,{goods_in_warehouse:true}).reason,'carrier_outcome_needs_reconciliation');
});
test('unpaid invoice correction keeps prior totals and invalidates customer approval',()=>{
 const s=fixture();apply(s,run(s,'prepare_invoice',ashley,{tax:1.5},'later'),'later');apply(s,run(s,'approve_invoice',jacobe,{},'later'),'later');
 assert.equal(run(s,'correct_invoice',damon,{carrier_cost:30,tax:2},'later').reason,'shipment_recovery_authority_required');
 apply(s,run(s,'correct_invoice',ashley,{carrier_cost:30,tax:2},'later'),'later');const bill=s.invoices.later;assert.equal(bill.amount,38);assert.equal(bill.revisions[0].amount,25.5);assert.equal(bill.customer_approval,null);assert.equal(s.order.paid_amount,100);
 assert.equal(shipmentExecutionGate(s.order,s.order.shipment_plan[1],bill).reason,'customer_freight_approval_required');
 assert.equal(planInvoicePayment({invoice:bill,order:s.order,input:{provider:'off_platform',payment_reference:'x',method:'ach',amount:38},actorId:'a'}).reason,'customer_freight_approval_required');
 apply(s,run(s,'approve_invoice',jacobe,{},'later'),'later');const payment=planInvoicePayment({invoice:s.invoices.later,order:s.order,input:{provider:'off_platform',payment_reference:'corrected',method:'ach',amount:38},actorId:'a'});assert.equal(payment.ok,true);s.invoices.later=payment.invoice;s.order=payment.order;
 assert.equal(run(s,'correct_invoice',ashley,{carrier_cost:10,tax:0},'later').reason,'paid_or_posted_invoice_requires_reconciliation');
});
test('invoice correction blocks partial payments and accounting postings',()=>{
 for(const patch of [{paid_amount:1},{payment_evidence:[{amount:1}]},{qbo_invoice_id:'posted'},{payment_intent_id:'pending'}]){
  const s=fixture();apply(s,run(s,'prepare_invoice',ashley,{tax:0},'later'),'later');Object.assign(s.invoices.later,patch);assert.equal(run(s,'correct_invoice',ashley,{carrier_cost:10,tax:0},'later').reason,'paid_or_posted_invoice_requires_reconciliation');
 }
});
test('Damon cancellation preserves money and excludes the cancelled allocation from fulfillment',()=>{
 const s=fixture();apply(s,run(s,'release'));assert.equal(run(s,'cancel_shipment',darren,{goods_in_warehouse:true}).reason,'shipment_recovery_authority_required');apply(s,run(s,'cancel_shipment',damon,{goods_in_warehouse:true}));assert.equal(s.inventory[0].reserved,0);assert.equal(s.order.paid_amount,100);assert.equal(s.order.total,100);assert.equal(s.order.shipment_plan[0].status,'cancelled');assert.equal(run(s,'release').reason,'shipment_cancelled');
 apply(s,run(s,'cancel_shipment',damon,{goods_in_warehouse:true},'later'),'later');assert.equal(s.order.status,'cancelled');assert.equal(s.order.payment_status,'paid');assert.equal(s.order.paid_amount,100);
});
test('closed, inconsistent and sub-cent payment amounts cannot alter balances',()=>{
 const invoice={id:'I',amount:100,paid_amount:0,balance:100,status:'open'},input={provider:'off_platform',payment_reference:'x',method:'ach',amount:1};
 for(const status of ['void','cancelled','refunded','written_off','settled'])assert.equal(planInvoicePayment({invoice:{...invoice,status},input,actorId:'a'}).reason,'invoice_closed');
 assert.equal(planInvoicePayment({invoice:{...invoice,balance:90},input,actorId:'a'}).reason,'invoice_balance_requires_reconciliation');
 assert.equal(planInvoicePayment({invoice,input:{...input,amount:0.001},actorId:'a'}).reason,'payment_amount_requires_cents');
 assert.equal(planInvoicePayment({invoice,order:{id:'O',status:'cancelled'},input,actorId:'a'}).reason,'cancelled_order_payment_requires_reconciliation');
});
test('live identity and newly added MFA roles invalidate stale sessions',()=>{
 const session={user_id:'p',email:'old@example.test',role:'sales',session_revision:0};
 const profile={id:'p',email:'new@example.test',role:'sales',status:'active',session_revision:0};
 assert.equal(authorizeLiveProfile(session,profile).reason,'session_identity_stale');
 assert.equal(authorizeLiveProfile(session,{...profile,email:session.email,roles:['sales','finance']}).reason,'mfa_required');
 assert.doesNotThrow(()=>sessionFromRequest({headers:{cookie:'um_session=%E0%A4%A'}}));
});
test('invoice correction rejects a total that changed since the operator reviewed it',()=>{
 const s=fixture();apply(s,run(s,'prepare_invoice',ashley,{tax:0},'later'),'later');
 const result=run(s,'correct_invoice',ashley,{carrier_cost:30,tax:2,expected_total:37},'later');assert.equal(result.ok,false);
 assert.equal(s.invoices.later.amount,24);
});
