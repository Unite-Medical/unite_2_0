import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOrderAddressDefaults} from '../src/lib/adminOrderClient.js';
const edits={shipping_address:0,billing_address:0};
const options={customerId:'customer-a',shipping:{address1:'Last order street'},billing:{address1:'Billing street'},expectedEdits:edits,currentEdits:edits,taxExempt:false};
test('late history cannot overwrite either manually edited address',()=>{
 const draft={customer_id:'customer-a',shipping_address:{address1:'Manual shipping'},billing_address:{address1:'Manual billing'},tax_confirmed:true};
 const result=applyOrderAddressDefaults(draft,{...options,currentEdits:{shipping_address:1,billing_address:1}});
 assert.deepEqual(result,draft);
});
test('switching customer rejects the prior customer response entirely',()=>{
 const draft={customer_id:'customer-b',shipping_address:{address1:'Customer B'}};
 assert.equal(applyOrderAddressDefaults(draft,options),draft);
});
test('shipping and billing edits are protected independently; new shipping invalidates tax review',()=>{
 const draft={customer_id:'customer-a',shipping_address:{address1:'Initial'},billing_address:{address1:'Manual billing'},tax_confirmed:true};
 const result=applyOrderAddressDefaults(draft,{...options,currentEdits:{shipping_address:0,billing_address:1}});
 assert.deepEqual(result.shipping_address,options.shipping);assert.deepEqual(result.billing_address,draft.billing_address);assert.equal(result.tax_confirmed,false);
 assert.equal(draft.shipping_address.address1,'Initial');
});
