import test from 'node:test';
import assert from 'node:assert/strict';
import {planQboHistoricalMatches,reconciledQboPayment} from '../api/_lib/qboHistoricalMatch.js';
import {shopifyCatchupHash} from '../api/_lib/shopifyCatchup.js';
const ids=Array.from({length:48},(_,i)=>String(i+1));
const orders=()=>ids.map(id=>({id,number:'#'+id,historical:true,total:120,currency:'USD',financial_status:'paid',total_outstanding:0,fulfillment_status:'fulfilled',revision:0,source:{email:'buyer@example.test',note:'PO PO-'+id,billing_address:{company:'Example buyer'}}}));
const invoice=(id='1',patch={})=>({Id:id,DocNumber:'INV-'+id,CustomField:[{Name:'Order Number',StringValue:id}],CustomerRef:{value:'C1',name:'Example buyer'},CurrencyRef:{value:'USD'},BillEmail:{Address:'buyer@example.test'},TotalAmt:120,Balance:120,MetaData:{LastUpdatedTime:'2026-10-22T21:00:00Z'},...patch});
const plan=(invoices,overrides={})=>planQboHistoricalMatches({orders:orders(),invoices,allowedIds:ids,...overrides});
const meta={realmFingerprint:'realm-hash',retrievedAt:'2026-10-22T22:00:00Z',scopeEvidenceHash:shopifyCatchupHash({source:'complete synthetic invoice capture'})};
test('requires exact 48 distinct historical records and unique provider invoice IDs',()=>{
 assert.throws(()=>plan([],{allowedIds:ids.slice(1)}),/exact_48/);
 assert.throws(()=>plan([],{orders:orders().slice(1)}),/scope_mismatch/);
 assert.throws(()=>plan([invoice(),invoice()]),/duplicate_invoice/);
 const rows=orders();rows[0].historical=false;assert.throws(()=>plan([],{orders:rows}),/scope_mismatch/);
});
test('explicit order reference, customer and total agree; Shopify paid does not determine balance',()=>{
 const p=plan([invoice()]);assert.deepEqual(p.counts,{confirmed:1,ambiguous:0,unmatched:47});
 const next=reconciledQboPayment(orders()[0],p.rows[0],meta);
 assert.equal(next.financial_status,'unpaid');assert.equal(next.total_outstanding,120);assert.equal(next.source_financial_status,'paid');assert.equal(next.source_total_outstanding,0);assert.equal(next.fulfillment_status,'fulfilled');
});
test('zero balance without invoice identity, fuzzy names or matching total is never payment evidence',()=>{
 assert.equal(plan([invoice('99',{Balance:0})]).counts.confirmed,0);
 const bad=invoice('1',{CustomerRef:{value:'C1',name:'Similar buyer'},BillEmail:{Address:'different@example.test'},Balance:0});
 assert.equal(plan([bad]).rows[0].status,'ambiguous');
 assert.equal(plan([invoice('1',{TotalAmt:121})]).rows[0].status,'ambiguous');
 assert.equal(plan([invoice('1',{CurrencyRef:{value:'CAD'}})]).rows[0].status,'ambiguous');
 assert.equal(plan([invoice('1',{Balance:null})]).rows[0].status,'ambiguous');
});
test('duplicate explicit references block; reused PO never overrides an explicit order reference',()=>{
 const other=invoice('51',{CustomField:[{Name:'Order Number',StringValue:'1'}]});assert.equal(plan([invoice(),other]).rows[0].status,'ambiguous');
 const legacy=invoice('52',{CustomField:[{Name:'P.O. Number',StringValue:'PO-1'}]});assert.equal(plan([invoice(),legacy]).rows[0].status,'confirmed');
 const old=invoice('53',{CustomField:[{Name:'Order Number',StringValue:'old'},{Name:'P.O. Number',StringValue:'PO-2'}]});assert.equal(plan([old]).rows[1].status,'unmatched');
});
test('one invoice cannot settle several orders sharing the same PO',()=>{
 const rows=orders();rows[0].source.note='PO SHARED';rows[1].source.note='PO SHARED';
 const p=plan([invoice('71',{CustomField:[{Name:'P.O. Number',StringValue:'SHARED'}]})],{orders:rows});
 assert.equal(p.rows[0].status,'ambiguous');assert.equal(p.rows[1].status,'ambiguous');
});
test('exact normalized street plus postal, primary customer email and invoice CC are identity evidence',()=>{
 const rows=orders();rows[0].source.email='other@example.test';rows[0].source.billing_address={address1:'10 Example Street',zip:'10001'};
 const p=plan([invoice('1',{BillEmail:{Address:'none@example.test'},CustomerRef:{value:'C1',name:'Different'},BillAddr:{Line2:'10 Example Street',Line3:'NEW YORK NY 10001'}})],{orders:rows});assert.equal(p.rows[0].status,'confirmed');
 assert.equal(plan([invoice('1',{BillEmail:{Address:'none@example.test'},BillEmailCc:{Address:'Buyer@example.test'},CustomerRef:{value:'C1',name:'Different'}})]).rows[0].status,'confirmed');
});
test('verified balance persists provenance and replay is unchanged; partial never claims cash received',()=>{
 for(const [balance,status] of [[0,'paid'],[40,'partially_paid'],[120,'unpaid']]){
  const p=plan([invoice('1',{Balance:balance})]);const next=reconciledQboPayment(orders()[0],p.rows[0],meta);
  assert.equal(next.financial_status,status);assert.equal(next.total_outstanding,balance);assert.equal(next.amount_paid,undefined);assert.equal(next.revision,1);
  assert.equal(reconciledQboPayment(next,p.rows[0],{...meta,retrievedAt:'2026-10-22T23:00:00Z'}),null);
 }
 const p=plan([invoice()]);assert.throws(()=>reconciledQboPayment(orders()[0],p.rows[0],{...meta,scopeEvidenceHash:''}),/provenance/);
});

test('structured QBO customer street, unit and postal resolves aliases without fuzzy names',()=>{
 const rows=orders();rows[0].source.email='other@example.test';rows[0].source.shipping_address={address1:'1150 Example Drive',address2:'Suite 600',zip:'30328'};
 const i=invoice('1',{CustomerRef:{value:'C1',name:'An abbreviated alias'},BillEmail:{Address:'different@example.test'}});
 const customers=[{Id:'C1',ShipAddr:{Line2:'1150 Example Dr, Ste 600',PostalCode:'30328'}}];
 assert.equal(plan([i],{orders:rows,customers}).rows[0].status,'confirmed');
 assert.equal(plan([i],{orders:rows,customers:[{...customers[0],ShipAddr:{Line2:'1150 Example Dr, Ste 601',PostalCode:'30328'}}]}).rows[0].status,'ambiguous');
 assert.equal(plan([i],{orders:rows,customers:[{...customers[0],ShipAddr:{Line2:'1150 Example Dr, Ste 600',PostalCode:'30329'}}]}).rows[0].status,'ambiguous');
});
