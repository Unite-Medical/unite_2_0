import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedSalesShipping} from '../src/lib/salesOrderShipping.js';
test('manual shipping records the actual reviewed amount without carrier estimation',()=>{
 assert.deepEqual(reviewedSalesShipping({shipping_kind:'manual',shipping:'24.50',shipping_name:'Agreed ground service',shipping_note:'Quote QA-1'}),{shipping_kind:'manual',shipping:24.5,shipping_name:'Agreed ground service',shipping_note:'Quote QA-1'});
});
test('pickup/free have honest zero charges and cannot conceal a positive amount',()=>{
 for(const kind of ['pickup','free']){assert.equal(reviewedSalesShipping({shipping_kind:kind,shipping:0}).shipping,0);assert.throws(()=>reviewedSalesShipping({shipping_kind:kind,shipping:12}),/\$0.00/);}
});
test('invalid shipping choices and amounts fail closed; legacy manual drafts retain amount',()=>{
 for(const shipping of [-1,'bad',Infinity,100000001])assert.throws(()=>reviewedSalesShipping({shipping}));
 assert.throws(()=>reviewedSalesShipping({shipping_kind:'live_carrier_rate'}),/Choose/);assert.equal(reviewedSalesShipping({shipping:10}).shipping,10);
});
