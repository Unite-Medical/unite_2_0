import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSalesLinePrice} from '../src/lib/salesOrderPricing.js';
import {orderPriceChange} from '../src/lib/orderPriceReview.js';
import {normalizeAdminDraft,planAdminOrderSubmission} from '../api/_lib/adminOrderDraft.js';
import {buildOrderInvoice} from '../api/_lib/orderAccounting.js';
const actor={user_id:'qa-damon',role:'admin',email:'damon@unitemedical.net'};
const customer={id:'qa-customer',name:'Synthetic customer',status:'active'};
const products=[{id:'p1',variant_id:'v1',sku:'QA-1',name:'Synthetic item',retail:100,cost:40,status:'active'},{id:'p2',variant_id:'v2',sku:'QA-2',name:'Second item',retail:50,cost:15,status:'active'}];
const input={id:'12345678-1234-1234-1234-123456789012',customer_id:customer.id,lines:[{id:'one',product_id:'p1',quantity:3,line_discount:{type:'amount',value:10,reason:'Negotiated case price'}},{id:'two',product_id:'p2',quantity:2}],discount_percent:10,shipping:5,shipping_confirmed:true,tax:0,tax_confirmed:true,shipping_address:{recipient:'QA buyer',address1:'1 Test Road',city:'Test',zip:'10001',country:'US'}};
const normalize=(patch={},extra={})=>normalizeAdminDraft({input:{...input,...patch},customer,products,actor,...extra});
test('currency item discount is per unit; order-wide percentage follows it',()=>{
 const result=calculateSalesLinePrice(100,{type:'amount',value:10,reason:' Case agreement '},10);
 assert.equal(result.unit_price,81);assert.equal(result.item_discount_per_unit,10);assert.equal(result.order_discount_per_unit,9);assert.equal(result.line_discount.reason,'Case agreement');
 assert.equal(calculateSalesLinePrice(100,{type:'percent',value:20},10).unit_price,72);
});
test('line discount only affects selected line and totals remain reconcilable',()=>{
 const result=normalize();assert.equal(result.lines[0].unit_price,81);assert.equal(result.lines[0].ext_price,243);assert.equal(result.lines[1].unit_price,45);assert.equal(result.lines[1].ext_price,90);
 assert.equal(result.items_subtotal,400);assert.equal(result.item_discount_total,30);assert.equal(result.order_discount_total,37);assert.equal(result.subtotal,333);assert.equal(result.total,338);assert.equal(result.items_subtotal-result.item_discount_total-result.order_discount_total,result.subtotal);
});
test('invalid discounts cannot create negative/free/unsupported item prices',()=>{
 for(const discount of [[],10,'10',{type:'percent',value:100},{type:'percent',value:-1},{type:'amount',value:100},{type:'amount',value:101},{type:'amount',value:'bad'},{type:'unknown',value:10}])assert.throws(()=>calculateSalesLinePrice(100,discount));
 assert.equal(calculateSalesLinePrice(100,{type:'amount',value:0}).unit_price,100);
});
test('item discounts preserve verified cost, margin and identity permissions',()=>{
 const lines=[{id:'one',product_id:'p1',quantity:1,line_discount:{type:'percent',value:50}}];
 assert.throws(()=>normalize({lines},{actor:{role:'admin',email:'jacobe@unitemedical.net'}}),/Damon.*35%/);
 assert.throws(()=>normalize({lines},{actor:{role:'admin',email:'other@example.test'}}),/approval/);
 assert.throws(()=>normalize({lines},{products:[{...products[0],cost:null}]}),/verified product cost/);
 assert.equal(normalize({lines}).lines[0].pricing_approval.approved_by,actor.email);
});
test('draft reopen does not apply discounts twice and clearing an item discount restores base',()=>{
 const saved=normalize();const reopened=normalize({lines:saved.lines},{existing:saved});assert.equal(reopened.total,saved.total);assert.equal(reopened.lines[0].unit_price,81);
 const cleared=normalize({lines:saved.lines.map(line=>({...line,line_discount:{type:'amount',value:0,reason:''}}))});assert.equal(cleared.lines[0].unit_price,90);assert.equal(cleared.item_discount_total,0);
});
test('inline margin and submitted finance totals use the same discounted price',()=>{
 const inline=orderPriceChange({price:100,cost:40,product:products[0],lineDiscount:{type:'percent',value:20},discount:10});assert.equal(inline.effective_price,72);assert.equal(inline.gross_margin,32/72);
 const plan=planAdminOrderSubmission(normalize(),customer,actor);const invoice=buildOrderInvoice(plan.order,plan.items,{customer_id:'42',items:{'QA-1':'1','QA-2':'2'},shipping_item_id:'3'});
 assert.equal(invoice.Line.reduce((sum,line)=>sum+line.Amount,0),338);assert.equal(plan.invoice.balance,338);assert.equal(plan.order.payment_status,'unpaid');
});

test('discount-only edits preserve automatic agreed quantity-tier prices',()=>{
 const schedule={status:'active',name:'Agreement',rows:[{variant_id:'v1',status:'active',minimum_quantity:1,unit_price:80},{variant_id:'v1',status:'active',minimum_quantity:10,unit_price:65}]};
 const patch=orderPriceChange({price:80,cost:40,product:products[0],catalogPrice:80,lineDiscount:{type:'percent',value:10}});
 assert.equal(patch.manual_price,false);
 const first=normalize({discount_percent:0,lines:[{id:'one',product_id:'p1',quantity:1,...patch}]},{schedules:[schedule]});
 const bulk=normalize({discount_percent:0,lines:[{...first.lines[0],quantity:10}]},{schedules:[schedule]});
 assert.equal(first.lines[0].unit_price,72);assert.equal(bulk.lines[0].unit_price,58.5);assert.equal(bulk.lines[0].catalog_unit_price,65);
 assert.equal(orderPriceChange({price:75,cost:40,product:products[0],catalogPrice:80}).manual_price,true);
});
