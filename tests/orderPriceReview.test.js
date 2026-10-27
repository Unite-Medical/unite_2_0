import test from 'node:test';
import assert from 'node:assert/strict';
import {orderPriceChange} from '../src/lib/orderPriceReview.js';
import {normalizeAdminDraft,draftSubmissionIssues} from '../api/_lib/adminOrderDraft.js';
import {saveAuthorizedCommerce} from '../api/_lib/commerceMutations.js';
const product={id:'p1',variant_id:'v1',name:'Synthetic product',variant:'Case of 100',sku:'QA-CASE',status:'active',cost:null,retail:100,revision:3};
const actor={user_id:'qa-admin',email:'damon@unitemedical.net',role:'admin'};
test('a price for this order never silently edits catalog cost',()=>{
 assert.equal(orderPriceChange({price:'75.50',cost:'',product}).costPatch,null);
 assert.equal(orderPriceChange({price:'75.50',cost:'35',product}).costPatch,null);
 assert.deepEqual(orderPriceChange({price:'75.50',cost:'35',product,updateCatalogCost:true}).costPatch,{cost:35});
});
test('unchanged formatted cost needs no catalog mutation or scope confirmation',()=>{
 assert.equal(orderPriceChange({price:'75.50',cost:'35.00',product:{...product,cost:35}}).costPatch,null);
});
test('blank, invalid, nonpositive and excessive selling prices or new costs fail clearly',()=>{
 for(const price of ['',null,0,-1,'abc',Infinity,100000001])assert.throws(()=>orderPriceChange({price,cost:'',product}),/customer price/);
 for(const cost of ['',0,-1,'abc',Infinity,100000001])assert.throws(()=>orderPriceChange({price:75,cost,product:{...product,cost:35},updateCatalogCost:true}));
});
test('displayed margin uses the discounted, cent-rounded selling price',()=>{
 const result=orderPriceChange({price:100,cost:40,product:{...product,cost:40},discount:10});
 assert.equal(result.unit_price,100);assert.equal(result.effective_price,90);assert.equal(result.gross_margin,50/90);assert.equal(result.costPatch,null);
 for(const discount of [-1,100,Infinity,'abc'])assert.throws(()=>orderPriceChange({price:100,cost:40,product:{...product,cost:40},discount}));
});
test('missing cost is optional; known-cost margin and identity approvals remain intact',()=>{
 const input={id:'12345678-1234-1234-1234-123456789012',customer_id:'c',lines:[{id:'l',product_id:'p1',manual_price:true,unit_price:60,quantity:400}],shipping:0,shipping_confirmed:true,tax:0,tax_confirmed:true,shipping_address:{recipient:'QA buyer',address1:'1 Test Road',city:'Test',zip:'10001',country:'US'}};
 const customer={id:'c',status:'active',name:'QA buyer'};
 const pending=normalizeAdminDraft({input,customer,products:[product],actor,allowPricingReview:true});assert.equal(pending.total,24000);assert.deepEqual(draftSubmissionIssues(pending,customer),[]);assert.equal(pending.lines[0].pricing_approval.gross_margin,null);
 const cost=orderPriceChange({price:60,cost:40,product,updateCatalogCost:true}).costPatch;
 const approved=normalizeAdminDraft({input,customer,products:[{...product,...cost}],actor});assert.deepEqual(draftSubmissionIssues(approved,customer),[]);assert.equal(approved.lines[0].pricing_approval.approved_by,actor.email);
 assert.throws(()=>normalizeAdminDraft({input,customer,products:[{...product,...cost}],actor:{role:'admin',email:'jacobe@unitemedical.net'}}),/Damon.*35%/);
 assert.throws(()=>normalizeAdminDraft({input,customer,products:[{...product,...cost}],actor:{role:'admin',email:'other@example.test'}}),/approval/);
});
test('contextual cost save reuses the existing revision guard and actor audit',async()=>{
 let current={...product},writes=0;
 const sql=async(strings,...values)=>{
  if(strings.join('').includes('SELECT data'))return [{data:current}];
  if(strings.join('').includes('UPDATE um_rows')){writes++;const next=JSON.parse(values[0]);assert.equal(values.at(-1),3);current=next;return [{id:product.id}];}
  throw new Error('Unexpected operation');
 };
 await assert.rejects(()=>saveAuthorizedCommerce(sql,{kind:'products',id:product.id,revision:2,patch:{cost:40},actor}),/changed/);assert.equal(writes,0);
 const saved=await saveAuthorizedCommerce(sql,{kind:'products',id:product.id,revision:3,patch:{cost:40},actor});assert.equal(writes,1);assert.equal(saved.cost,40);assert.equal(saved.revision,4);assert.equal(saved.updated_by,actor.user_id);assert.equal(saved.events.at(-1).actor,actor.email);assert.equal(saved.events.at(-1).text,'Updated cost');assert.equal(saved.retail,100);
});

test('zero catalog cost is missing for draft review, without silently deleting it',()=>{
 const zero={...product,cost:0};
 assert.equal(orderPriceChange({price:60,cost:'',product:zero}).costPatch,null);
 assert.equal(zero.cost,0);
 assert.equal(orderPriceChange({price:60,cost:40,product:zero}).costPatch,null);
 assert.deepEqual(orderPriceChange({price:60,cost:40,product:zero,updateCatalogCost:true}).costPatch,{cost:40});
});

test('selling price can be applied while optional cost information is unavailable',()=>{
 const result=orderPriceChange({price:43.89,cost:'',product:null,catalogPrice:100});
 assert.equal(result.unit_price,43.89);assert.equal(result.manual_price,true);
 assert.equal(result.costPatch,null);assert.equal(result.gross_margin,null);
});

test('unconfirmed optional cost edits never block the selling price or alter catalog cost',()=>{
 const current={...product,cost:35};
 for(const cost of ['',0,-1,'bad',Infinity,100000001]){
  const result=orderPriceChange({price:60,cost,product:current});
  assert.equal(result.costPatch,null);assert.equal(result.gross_margin,25/60);
 }
 assert.equal(current.cost,35);
});
