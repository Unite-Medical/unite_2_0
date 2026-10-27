import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerDirectoryHandler, customerDirectoryRecord } from '../api/account/customer-directory.js';
import { approvedCustomerDatabase } from '../api/_lib/customerReadAccess.js';
import { staffShortcuts } from '../src/lib/staffWorkspace.js';
const actor = {user_id:"usr_shopify_'7337833922726",email:'jacobe@unitemedical.net',role:'sales'};
const env = {DATABASE_URL:'postgres://test:test@example.test/test',VERCEL_PROJECT_ID:'prj_PL5BOZooLBtLiPQlrn34SyC0MRKS',PUBLIC_APP_ORIGIN:'https://staging.unitemedical.net'};
const record = {id:'real',name:'Company',email:'contact@example.test',source:{private:'hidden'},credit_limit:999,payment_token:'hidden',events:[{text:'hidden'}],addresses:[{id:'ship',address1:'123 Main',source_orders:['hidden'],private:'hidden'},{id:'old',archived:true}]};
function fixture({session=actor,authenticated=true,database=true,environment=env}={}) {
 const calls=[];
 const handler=createCustomerDirectoryHandler({env:environment,sqlFactory:()=>{calls.push('sqlFactory');return {};},authorize:async(_req,_sql,{roles})=>authenticated&&roles.includes(session?.role)?{ok:true,session}:{ok:false,reason:authenticated?'forbidden':'authentication_required'},verifyDatabase:async()=>database,read:async(_sql,query)=>{calls.push(query);return query.id?query.id==='missing'?null:record:{rows:[record],total:123,page:query.page};}});
 async function call({method='GET',query={},host='staging.unitemedical.net'}={}) {let body;const response={setHeader(){},end(value){body=JSON.parse(value);}};await handler({method,query,headers:{host}},response);return {status:response.statusCode,body};}
 return {call,calls};
}
test('Jacobe lists searches and opens real customer records using a fixed customer collection',async()=>{
 const f=fixture();const list=await f.call({query:{q:'Company',page:'2'}});
 assert.equal(list.status,200);assert.equal(list.body.data.total,123);assert.equal(list.body.read_only,true);
 assert.deepEqual(f.calls.at(-1),{kind:'customers',id:undefined,q:'Company',page:2,limit:50});
 assert.equal(JSON.stringify(list.body).includes('hidden'),false);
 const detail=await f.call({query:{id:'real'}});assert.equal(detail.status,200);assert.equal(detail.body.data.id,'real');assert.equal(detail.body.data.addresses.length,1);assert.equal(JSON.stringify(detail.body).includes('hidden'),false);
 assert.equal((await f.call({query:{id:'missing'}})).status,404);
});
test('all non-GET methods are denied before authentication, database, or reader invocation',async()=>{
 for(const method of ['POST','PATCH','PUT','DELETE','OPTIONS']) {const f=fixture();assert.equal((await f.call({method})).status,405);assert.deepEqual(f.calls,[]);}
});
test('anonymous customer public and other staff identities cannot read this directory',async()=>{
 assert.equal((await fixture({authenticated:false}).call()).status,401);
 for(const session of [null,{...actor,user_id:'other'},{...actor,email:'other@unitemedical.net'},...['customer','distributor','finance','warehouse_operator','customer_service','admin'].map(role=>({...actor,role}))]) {
  const f=fixture({session});assert.equal((await f.call()).status,403);assert.equal(f.calls.filter(v=>typeof v==='object').length,0);
 }
});
test('wrong staging host project origin or database fails closed',async()=>{
 for(const config of [{database:false},{environment:{...env,VERCEL_PROJECT_ID:'other'}},{environment:{...env,PUBLIC_APP_ORIGIN:'https://unitemedical.net'}}]) {const f=fixture(config);assert.equal((await f.call()).status,403);assert.equal(f.calls.filter(v=>typeof v==='object').length,0);}
 assert.equal((await fixture().call({host:'unitemedical.net'})).status,403);
 assert.equal(await approvedCustomerDatabase(async()=>[{database_name:'other',schema_name:'public'}],env.DATABASE_URL),false);
});
test('caller cannot select orders pricing source data arbitrary actions or invalid paging',async()=>{
 for(const query of [{kind:'orders'},{action:'search'},{selected_ids:'x'},{page:'-1'},{page:'NaN'},{page:'1.5'},{q:['bad']},{id:'x'.repeat(201)}]) {const f=fixture();assert.equal((await f.call({query})).status,400);assert.equal(f.calls.filter(v=>typeof v==='object').length,0);}
});
test('customer fields are allowlisted and non-approved staff navigation stays unchanged',()=>{
 assert.equal(customerDirectoryRecord(record).credit_limit,undefined);assert.equal(customerDirectoryRecord(record).source,undefined);
 assert.equal(staffShortcuts('sales').some(item=>item.path==='/rep/customers'),false);
 const shortcuts=staffShortcuts('sales',{customerDirectory:true});assert.ok(shortcuts.some(item=>item.path==='/rep/customers'));assert.ok(shortcuts.some(item=>item.path==='/admin/quotes'));
 assert.equal(staffShortcuts('finance',{customerDirectory:true}).some(item=>item.path==='/rep/customers'),false);
});
