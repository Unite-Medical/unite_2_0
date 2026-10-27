import test from 'node:test';
import assert from 'node:assert/strict';
import { isUniteCustomerReadIdentity } from '../src/lib/uniteCustomerReadIdentity.js';
import { canReadUniteCustomerBook } from '../api/_lib/customerReadAccess.js';
import { staffShortcuts } from '../src/lib/staffWorkspace.js';
const live={user_id:"usr_shopify_'7337833922726",email:'jacobe@unitemedical.net',role:'sales'};
const env={VERCEL_PROJECT_ID:'prj_PL5BOZooLBtLiPQlrn34SyC0MRKS',PUBLIC_APP_ORIGIN:'https://staging.unitemedical.net'};
test('the actual imported ID grants the same approved identity in navigation and API',()=>{
 assert.equal(isUniteCustomerReadIdentity(live),true);
 assert.equal(canReadUniteCustomerBook(live,env,'staging.unitemedical.net'),true);
 const nav=staffShortcuts(live.role,{customerDirectory:isUniteCustomerReadIdentity(live)});
 assert.ok(nav.some(item=>item.path==='/rep/customers'));
 assert.ok(nav.some(item=>item.path==='/admin/quotes'));
});
test('the formerly misread lookalike ID does not inherit the grant',()=>{
 const wrong={...live,user_id:'usr_shopify_7337833922726'};
 assert.equal(isUniteCustomerReadIdentity(wrong),false);
 assert.equal(canReadUniteCustomerBook(wrong,env,'staging.unitemedical.net'),false);
});
test('identity correction does not normalize arbitrary IDs or expand roles',()=>{
 for(const session of [{...live,user_id:' '+live.user_id},{...live,user_id:live.user_id.replace("'",'')},{...live,email:'other@unitemedical.net'},...['customer','customer_service','finance','admin'].map(role=>({...live,role})),null])assert.equal(isUniteCustomerReadIdentity(session),false);
});
