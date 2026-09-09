import test from 'node:test';
import assert from 'node:assert/strict';
import {shippingPackage,estimateBinding,validateEstimate,calculateEstimate} from '../api/_lib/checkoutEstimate.js';
import {buildOperationsDesk} from '../api/_lib/operationsDesk.js';
import {deletionAllowed} from '../api/_lib/retention.js';
import {planOrganizationMerge,duplicateOrganizations} from '../api/_lib/organizationMerge.js';
import {validateExtraction} from '../api/_lib/documentProcessing.js';
import {sanitizeFunnelEvent,summarizeFunnel} from '../api/_lib/funnel.js';
const draft={order:{customer_id:'c',subtotal:100,payment_method:'ach'},address:{id:'a',zip:'30303',state:'GA'},lines:[{sku:'p',qty:2,unit_price:50,ext_price:100}]};
const products=[{sku:'p',stripe_tax_code:'txcd_fixture',shipping_packages:[{approved:true,quantity:2,weight_lb:4,length_in:10,width_in:8,height_in:6}]}];
test('checkout uses an approved packed carton and invalidates changed estimate inputs',()=>{
 assert.equal(shippingPackage(draft.lines,products).ok,true);
 assert.equal(shippingPackage([{sku:'p',qty:3}],products).reason,'packing_review_required');
 const e={binding:estimateBinding(draft),expires_at:'2099-01-01',options:[{id:'opt'}]};
 assert.equal(validateEstimate(e,draft,'opt').ok,true);
 assert.equal(validateEstimate(e,{...draft,address:{...draft.address,zip:'90210'}},'opt').ok,false);
 assert.equal(validateEstimate(e,{...draft,order:{...draft.order,tax_exempt_basis:true}},'opt').ok,false);
 assert.equal(validateEstimate({...e,expires_at:'2000-01-01'},draft,'opt').ok,false);
});
test('delivered estimate combines provider freight, handling and exclusive tax without client totals',async()=>{
 const calls=[];const r=await calculateEstimate({draft,products,organization:{},env:{SHIPSTATION_API_KEY:'test',SHIPSTATION_API_SECRET:'test',UNITE_SHIP_FROM_ZIP:'30122',UNITE_SHIP_FROM_STREET:'1 Test Warehouse',UNITE_SHIP_FROM_CITY:'Atlanta',UNITE_SHIP_FROM_STATE:'GA',UNITE_RATE_CARRIERS:'fedex',STRIPE_SECRET_KEY:'test'},fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.includes('shipstation')?[{serviceCode:'fedex_ground',shipmentCost:12,otherCost:2}]:{id:'taxcalc_1',tax_amount_exclusive:903}};}});
 assert.equal(r.ok,true);assert.equal(r.estimate.options[0].freight,29);assert.equal(r.estimate.options[0].tax,9.03);assert.equal(r.estimate.options[0].total,138.03);
 assert.equal(new URLSearchParams(calls[1].options.body).get('shipping_cost[amount]'),'2900');
});
test('exception desk escalates unowned/overdue work and detects missed customer cadence',()=>{
 const now=new Date('2026-09-08');const rows=buildOperationsDesk({organizations:[{id:'c',name:'Clinic',account_owner_email:'owner@example.com'}],orders:[...['2026-07-01','2026-07-08','2026-07-15'].map((d,i)=>({id:String(i),customer_id:'c',status:'delivered',placed_at:d})),{id:'big',total:11000,status:'pending',created_at:'2026-09-01'}]},now);
 assert.equal(rows.find(r=>r.kind==='approval').owner_email,'damon@unitemedical.net');assert.equal(rows.find(r=>r.kind==='missed_reorder').owner_email,'owner@example.com');assert.equal(rows.every(r=>r.escalated),true);
});
test('retention preserves unknown-age records and legal holds beyond the minimum',()=>{
 const now=new Date('2026-09-08');assert.equal(deletionAllowed('orders',{id:'x'},[],now).ok,false);
 assert.equal(deletionAllowed('orders',{id:'x',created_at:'2025-01-01'},[],now).ok,false);
 assert.equal(deletionAllowed('orders',{id:'x',created_at:'2020-01-01'},[{table:'orders',record_id:'x',status:'active'}],now).reason,'legal_hold_active');
 assert.equal(deletionAllowed('orders',{id:'x',created_at:'2020-01-01'},[],now).ok,true);
});
test('reviewed org merge preserves before-images, revokes source sessions, blocks policy conflicts',()=>{
 const source={id:'s',name:'Clinic',tier:'C'},target={id:'t',name:'Clinic',tier:'C'};
 const r=planOrganizationMerge({source,target,rows:[{tbl:'profiles',data:{id:'p',org_id:'s',session_revision:2}}],reason:'Confirmed duplicate by owner',actorId:'admin'});
 assert.equal(r.changes[0].before.org_id,'s');assert.equal(r.changes[0].after.org_id,'t');assert.equal(r.changes[0].after.session_revision,3);
 assert.equal(planOrganizationMerge({source,target:{...target,tier:'A'},rows:[],reason:'merge',actorId:'admin'}).reason,'commercial_policy_conflict');
 assert.equal(duplicateOrganizations([source,target]).length,1);
});
test('document extraction never auto-approves and flags mismatches and expiry',()=>{
 const r=validateExtraction({company_name:'Other',state:'GA',certificate_id:'1',expiration_date:'2020-01-01',confidence:0.5,signature_present:false},{name:'Clinic'});
 assert.equal(r.review_required,true);assert.ok(r.flags.includes('expired'));assert.ok(r.flags.includes('company_name_needs_review'));assert.ok(r.flags.includes('low_confidence'));
});
test('funnel strips personal fields and distinguishes inactivity from conversion',()=>{
 const r=sanitizeFunnelEvent({session_id:'12345678-1234-1234-1234-123456789012',event:'intent_selected',metadata:{intent:'restock',email:'private@example.com',source:'private@example.com'}});
 assert.deepEqual(r.metadata,{intent:'restock'});const report=summarizeFunnel([{...r,created_at:'2026-01-01T00:00:00Z'}],Date.parse('2026-01-02'));assert.equal(report.inferred_abandoned,1);assert.equal(report.converted,0);
});
