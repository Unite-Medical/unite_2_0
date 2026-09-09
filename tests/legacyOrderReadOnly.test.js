import test from 'node:test';
import assert from 'node:assert/strict';
import { projectLegacyOrderLine, projectCustomerLegacyOrders } from '../api/account/legacy-orders.js';

test('legacy order customer projection is allowlisted and read-only',()=>{
 const projected=projectLegacyOrderLine({Name:'#1','Created at':'2026-01-01','Financial Status':'paid','Fulfillment Status':'partial','Lineitem sku':'SKU','Lineitem name':'Item','Lineitem quantity':'2','Lineitem price':'10','Shipping Method':'Ground','Payment Reference':'secret','Notes':'internal'});
 assert.deepEqual(projected,{order_number:'#1',created_at:'2026-01-01',financial_status:'paid',fulfillment_status:'partial',sku:'SKU',name:'Item',quantity:2,unit_price:10,shipping_method:'Ground'});
 assert.equal('payment_reference' in projected,false);assert.equal('notes' in projected,false);
});

const historyRow=(id,run,email,sku,imported='2026-08-24')=>({id,run_id:run,imported_at:imported,payload:{Name:'#10',Email:email,'Created at':'2026-08-01','Lineitem sku':sku,'Lineitem quantity':'1'}});
test('customer history includes continuation lines but never another customer or empty-email session',()=>{
 const rows=[historyRow('1','a','one@example.com','A'),historyRow('2','a','','B'),historyRow('3','b','two@example.com','C')];
 assert.deepEqual(projectCustomerLegacyOrders(rows,'one@example.com')[0].lines.map(x=>x.sku),['A','B']);
 assert.deepEqual(projectCustomerLegacyOrders(rows,''),[]);
 assert.deepEqual(projectCustomerLegacyOrders([...rows,historyRow('4','a','two@example.com','D')],'one@example.com'),[]);
});
test('a refreshed import replaces the earlier order without doubling quantities',()=>{
 const row=historyRow('2','new','one@example.com','B','2026-09-08');
 const orders=projectCustomerLegacyOrders([historyRow('1','old','one@example.com','A'),row,row],'one@example.com');
 assert.equal(orders.length,1);assert.equal(orders[0].lines.length,1);assert.equal(orders[0].lines[0].sku,'B');
});
