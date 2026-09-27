import test from 'node:test';
import process from 'node:process';
import assert from 'node:assert/strict';
import {ordinaryParcelCharge,canSetNewPrice,surplusFee,surplusFeeReversal} from '../api/_lib/launchPolicy.js';
import {planPublicInquiry} from '../api/_lib/publicInquiry.js';
import {planRefundApproval,refundApprovalGate} from '../api/_lib/refundApproval.js';
import {planSplitAction,publicShipmentPlan,laterShipmentReleaseGate} from '../api/_lib/splitFulfillment.js';
import {buildMigratedCustomer} from '../src/lib/customerMigrationPolicy.js';
const jacobe={user_id:'j',email:'jacobe@unitemedical.net',role:'sales'},damon={user_id:'d',email:'damon@unitemedical.net',role:'admin'};
const now=new Date('2026-09-21T12:00:00Z');
test('ordinary parcel adds 20 percent and handling once; agreed arrangements survive',()=>{
 assert.equal(ordinaryParcelCharge(100).final_amount,135);
 assert.equal(ordinaryParcelCharge(100,{laterShipment:true}).final_amount,120);
 assert.equal(ordinaryParcelCharge(100,{arrangement:{markup_pct:5,handling_flat:0}}).final_amount,105);
 assert.equal(ordinaryParcelCharge(null).reason,'carrier_cost_pending');
});
test('Jacobe new price authority uses gross margin and Damon exception is named',()=>{
 assert.equal(canSetNewPrice(jacobe,100,65).ok,true);
 assert.equal(canSetNewPrice(jacobe,100,65.01).reason,'damon_approval_required');
 assert.equal(canSetNewPrice(damon,100,80).ok,true);
 assert.equal(canSetNewPrice({...damon,email:'other@example.com'},100,40).ok,false);
});
test('inquiries normalize deterministic private requests, detect changed content and route Jacobe only',()=>{
 const input={kind:'regenicool',idempotency_key:'inquiry-test-123',name:'Test',company:'Test firm',email:'TEST@example.com',business_type:'Dealer'};
 const a=planPublicInquiry(input,{now,ownerEmail:jacobe.email}),b=planPublicInquiry(input,{now,ownerEmail:jacobe.email});
 assert.equal(a.ok,true);assert.equal(a.inquiry.id,b.inquiry.id);assert.equal(a.inquiry.request_hash,b.inquiry.request_hash);
 assert.equal(a.inquiry.visibility,'private');assert.equal(a.outbox.to_address,jacobe.email);assert.equal(a.outbox.cc,undefined);
 assert.notEqual(planPublicInquiry({...input,message:'changed'},{now}).inquiry.request_hash,a.inquiry.request_hash);
 assert.equal(planPublicInquiry({...input,website_confirm:'bot'},{now}).ok,false);
});
test('surplus accepts eligible noncatalog PPE, rejects opened/expired or missing provenance',()=>{
 const input={kind:'surplus',idempotency_key:'surplus-test-123',name:'Test',company:'US firm',email:'test@example.com',us_business:true,eligibility_confirmed:true,lines:[{raw_description:'Level 3 gown',product_identifier:'Other maker 001',category:'PPE',provenance:'Authorized distributor',condition:'new_in_box',qty:50,expiry_date:'2027-01-01'}]};
 assert.equal(planPublicInquiry(input,{now}).inquiry.release_mode,'intake_only');
 for(const change of [{condition:'opened'},{expiry_date:'2026-09-01'},{provenance:''},{qty:1.5}])assert.equal(planPublicInquiry({...input,lines:[{...input.lines[0],...change}]},{now}).ok,false);
});
test('surplus fee and separate refund scenarios preserve the agreed examples',()=>{
 assert.equal(surplusFee(5000),500);assert.equal(surplusFee(10),1);
 assert.equal(surplusFeeReversal({merchandiseValue:5000,merchandiseRefund:1000,reason:'eligible_partial_refund'}).amount,100);
 assert.equal(surplusFeeReversal({merchandiseValue:5000,reason:'buyer_never_paid'}).amount,500);
 assert.equal(surplusFeeReversal({merchandiseValue:5000,reason:'seller_cannot_supply'}).amount,500);
 assert.equal(surplusFeeReversal({merchandiseValue:5000,reason:'voluntary_cancellation',buyerPaid:true,bothAgreed:true,introductionComplete:true}).amount,0);
 assert.equal(surplusFeeReversal({merchandiseValue:5000,reason:'voluntary_cancellation'}).ok,false);
});
test('refund review is Ashley then Damon; changing amount invalidates approval',()=>{
 const previous=process.env.UNITE_ASHLEY_EMAIL;process.env.UNITE_ASHLEY_EMAIL='ashley-test@example.com';
 try{const rma={id:'r',order_id:'o',status:'refund_pending',refund_total:5,accepted_items:[],restocking_fee:0};
 assert.equal(planRefundApproval(rma,{action:'approve_refund',actor:damon,reason:'verified',now}).ok,false);
 const review=planRefundApproval(rma,{action:'review_refund',actor:{user_id:'a',email:'ashley-test@example.com',role:'finance'},reason:'matched',now});assert.equal(review.ok,true);
 const final=planRefundApproval(review.rma,{action:'approve_refund',actor:damon,reason:'approved',now});assert.equal(refundApprovalGate(final.rma).ok,true);
 assert.equal(refundApprovalGate({...final.rma,refund_total:6}).ok,false);
 }finally{if(previous===undefined)delete process.env.UNITE_ASHLEY_EMAIL;else process.env.UNITE_ASHLEY_EMAIL=previous;}
});
test('split plan requires exact allocations, hides origin, and approval alone cannot release freight',()=>{
 const args={order:{id:'o',total:200,freight:27,payment_status:'paid'},items:[{sku:'A',qty:4}],actor:jacobe,now,input:{action:'save_plan',reason:'Backorder',shipments:[{id:'first',items:[{sku:'A',qty:2}]},{id:'later',items:[{sku:'A',qty:2}],internal_origin:'Secret supplier',carrier_cost:20}]}};
 const planned=planSplitAction(args);assert.equal(planned.ok,true);
 const later=planned.order.shipment_plan[1];assert.equal(later.charge.final_amount,24);assert.equal(later.charge.handling_fee,0);
 const customer=JSON.stringify(publicShipmentPlan(planned.order.shipment_plan));assert.equal(customer.includes('Secret supplier'),false);assert.match(customer,/Awaiting supplier confirmation/);
 assert.equal(laterShipmentReleaseGate(later).ok,false);
 const approved=planSplitAction({...args,order:planned.order,input:{action:'record_customer_approval',shipment_id:'later',reason:'Customer agreed',customer_approval_reference:'email-1'}});
 assert.equal(approved.ok,true);assert.equal(laterShipmentReleaseGate(approved.order.shipment_plan[1]).reason,'later_freight_payment_pending');
 const changed=planSplitAction({...args,order:approved.order,input:{action:'set_later_freight',shipment_id:'later',reason:'Rate changed',carrier_cost:25}});
 assert.equal(changed.order.shipment_plan[1].charge.approval_status,'customer_approval_pending');
 assert.equal(planSplitAction({...args,items:[{sku:'A',qty:5}]}).reason,'allocation_must_match_order');
});
test('verified carryover releases source holds and preserves terms and exemption without repricing',()=>{
 const source={'Customer ID':'123',Email:'real@example.com','Tax Exempt':'yes'};
 const agreement={source_verified:true,coverage_complete:true,source_system:'sparklayer',source_customer_id:'123',source_sha256:'a'.repeat(64),terms:'net30',tier:'B',credit_limit:5000};
 const contracts=[{product_sku:'A',unit_price:22.63,min_qty:5,unit:'each'}];
 const result=buildMigratedCustomer(source,{agreement,contract_prices:contracts});
 assert.equal(result.organization.approval_status,'approved');assert.equal(result.organization.terms,'net30');assert.equal(result.organization.shopify_tax_exempt,true);assert.deepEqual(result.pricing.rows,contracts);
 assert.equal(buildMigratedCustomer(source,{agreement:{...agreement,source_customer_id:'wrong'},contract_prices:contracts}).organization.approval_status,'manual_review');
 const standard=buildMigratedCustomer(source,{agreement:{...agreement,pricing_basis:'standard'}});assert.equal(standard.pricing.status,'preserved');assert.equal(standard.organization.commerce_hold_reason,null);
});
