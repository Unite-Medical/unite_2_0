import test from 'node:test';
import assert from 'node:assert/strict';
import { canSetCustomerOrderPrice } from '../api/_lib/orderPricingAuthority.js';
import { canSetNewPrice } from '../api/_lib/launchPolicy.js';
const jacobe={role:'sales',email:'jacobe@unitemedical.net'};
const damon={role:'admin',email:'damon@unitemedical.net'};
test('existing pricing identities may price customer orders without known cost or margin',()=>{
 for(const actor of [jacobe,damon])for(const cost of [null,undefined,0,'',NaN])assert.deepEqual(canSetCustomerOrderPrice(actor,43.89,cost),{ok:true,approved_by:actor.email,gross_margin:null,cost_available:false});
});
test('known-cost margin limits remain intact and quote policy is unchanged',()=>{
 assert.equal(canSetCustomerOrderPrice(jacobe,50,40).reason,'damon_approval_required');
 assert.equal(canSetCustomerOrderPrice(damon,50,40).ok,true);
 assert.equal(canSetCustomerOrderPrice(jacobe,100,40).gross_margin,.6);
 assert.equal(canSetNewPrice(jacobe,43.89,0).reason,'valid_price_and_landed_cost_required');
});
test('optional cost does not authorize new identities roles or invalid prices',()=>{
 for(const actor of [{role:'sales',email:'other@example.test'},{role:'admin',email:'other@example.test'},{...jacobe,role:'finance'},{...jacobe,role:'customer'}])assert.equal(canSetCustomerOrderPrice(actor,43.89,null).reason,'pricing_authority_required');
 for(const price of [0,-1,NaN,Infinity])assert.equal(canSetCustomerOrderPrice(damon,price,null).reason,'valid_price_required');
});
