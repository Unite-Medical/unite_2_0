import test from 'node:test';
import assert from 'node:assert/strict';
import {latestOrderShippingAddress,readLatestOrderShipping} from '../api/_lib/orderShippingDefault.js';
const address={recipient:'Synthetic customer',address1:'2 Fixture Road',city:'Test',zip:'10001',country:'US'};
const order=(id,date,patch={})=>({id,customer_id:'customer-a',historical:true,created_at:date,shipping_address:address,...patch});
test('latest actual order wins, independent of saved address order or import update time',()=>{
 const result=latestOrderShippingAddress([order('old','2026-01-01',{updated_at:'2026-12-31'}),order('latest','2026-10-01')],'customer-a');
 assert.equal(result.order_id,'latest');assert.deepEqual(result.address,{...address,company:'',address2:'',province:'',phone:''});
});
test('exclude other customers, drafts, canceled, undated and incomplete-address orders',()=>{
 const bad=[{draft:true},{customer_id:'customer-b'},{cancelled_at:'2026-10-02'},{status:'cancelled'},{workflow_state:'voided'},{shipping_address:{...address,zip:''}},{created_at:'invalid'},{historical:false,draft:undefined}];
 const rows=bad.map((patch,i)=>order('bad-'+i,'2026-11-01',patch));
 rows.push(order('valid','2026-01-01',{draft:false,historical:false}));
 assert.equal(latestOrderShippingAddress(rows,'customer-a').order_id,'valid');
 assert.equal(latestOrderShippingAddress(rows,'missing'),null);
});
test('date ties have stable ID ordering and address is copied without unrelated order fields',()=>{
 const rows=[order('b','2026-10-01'),order('a','2026-10-01')];
 assert.equal(latestOrderShippingAddress(rows,'customer-a').order_id,'a');
 const result=latestOrderShippingAddress(rows,'customer-a');result.address.address1='changed';assert.equal(rows[0].shipping_address.address1,address.address1);
});
test('read is parameterized to selected customer and returns no account credentials',async()=>{
 let query,values;
 const result=await readLatestOrderShipping(async(strings,...args)=>{query=strings.join('?');values=args;return [{data:order('safe','2026-10-01')}];},'customer-a');
 assert.deepEqual(values,['customer-a']);assert.match(query,/tbl='commerce_orders'.*deleted=false.*customer_id/);assert.equal(result.order_id,'safe');assert.equal(result.address.password,undefined);
});
