import test from 'node:test';
import process from 'node:process';
import assert from 'node:assert/strict';
import {readFlexport} from '../api/_lib/commerceAgentFlexport.js';
import {agentTools,callCommerceAgentTool} from '../api/_lib/commerceAgentTools.js';
import {projectSyncPage} from '../api/_lib/syncPage.js';
import {canUseServiceProxy} from '../api/_lib/rowStore.js';

const envKeys=['FLEXPORT_API_KEY','FLEXPORT_CLIENT_ID','FLEXPORT_CLIENT_SECRET','MFA_ENCRYPTION_KEY'];
let prior;
test.beforeEach(()=>{prior=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));for(const k of envKeys)delete process.env[k];});
test.afterEach(()=>{for(const k of envKeys){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

test('Flexport proxy permits authorized reads but blocks bookings and edits for every role',()=>{
 for(const role of ['admin','warehouse_manager','sourcing']){
  assert.equal(canUseServiceProxy({role},'flexport','/shipments','GET'),true);
  for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(canUseServiceProxy({role},'flexport','/shipments',method),false);
 }
 for(const role of ['sales','customer'])assert.equal(canUseServiceProxy({role},'flexport','/shipments','GET'),false);
 assert.equal(canUseServiceProxy(null,'flexport','/shipments','GET'),false);
});

test('missing credentials return disconnected, never sample records',async()=>{
 const result=await readFlexport({}, {fetcher:()=>assert.fail('No network request expected')});
 assert.equal(result.connected,false);assert.equal(result.records,undefined);
 const tool=agentTools.find(t=>t.name==='read_flexport');assert.ok(tool);assert.equal(tool.parameters.additionalProperties,false);
 assert.equal((await callCommerceAgentTool(null,{name:'read_flexport',arguments:{}},{actor:{user_id:'test'},sessionId:'test'})).connected,false);
});
test('live lists use a fixed GET endpoint, version 3, page metadata and sanitized fields',async()=>{
 process.env.FLEXPORT_API_KEY='fixture-secret';
 const r=await readFlexport({resource:'shipments',page:2,limit:10},{fetcher:async(url,options)=>{
  assert.equal(url,'https://api.flexport.com/shipments?page=2&per=10&sort=id&direction=desc');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers['Flexport-Version'],'3');
  return json({data:{data:[{id:42,status:'in_transit',access_token:'must-not-appear',nested:{bank_account:'hidden',eta:'2026-10-01'}}],next:'https://untrusted.example/never-follow',total_count:21}});
 }});
 assert.equal(r.total,21);assert.equal(r.next_page,3);assert.equal(r.records[0].nested.eta,'2026-10-01');assert.ok(!JSON.stringify(r).includes('must-not-appear'));assert.ok(!JSON.stringify(r).includes('hidden'));
});
test('record lookup preserves invoice currency and rejects paths or unsupported resources',async()=>{
 process.env.FLEXPORT_API_KEY='fixture-secret';
 const r=await readFlexport({resource:'invoices',id:'a_B-123'},{fetcher:async(url)=>{assert.equal(url,'https://api.flexport.com/invoices/a_B-123');return json({data:{id:'a_B-123',total:{amount:'1941.13',currency_code:'USD'}}});}});
 assert.equal(r.record.total.currency_code,'USD');
 for(const input of [{id:'../../oauth/token'},{resource:'booking_quotes'},{page:0},{limit:1000},{page:1.5}])await assert.rejects(readFlexport(input));
});
test('provider failures are visible without leaking raw errors or pretending success',async()=>{
 process.env.FLEXPORT_API_KEY='fixture-secret';
 await assert.rejects(readFlexport({}, {fetcher:async()=>json({error:'sensitive upstream body'},403)}),/Enable access/);
 await assert.rejects(readFlexport({}, {fetcher:async()=>json({data:{wrong:[]}})}),/Unexpected/);
 await assert.rejects(readFlexport({}, {fetcher:async()=>json({error:{message:'sensitive'}})}),/API error/);
});
test('OAuth tokens are encrypted, reused across calls, and refresh leases prevent duplicate exchanges',async()=>{
 process.env.FLEXPORT_CLIENT_ID='fixture-id';process.env.FLEXPORT_CLIENT_SECRET='fixture-secret';process.env.MFA_ENCRYPTION_KEY='ab'.repeat(32);
 let stored={},exchanges=0;
 const sql=async(strings,...values)=>{const q=strings.join('?');if(q.startsWith('INSERT'))return [];if(q.startsWith('SELECT'))return [{data:stored}];if(q.includes('RETURNING id')){if((stored.refresh_after||0)>Date.now())return [];stored={...stored,...JSON.parse(values[0])};return [{id:values[1]}];}stored=JSON.parse(values[0]);return [];};
 const fetcher=async(url,options)=>{if(url.endsWith('/oauth/token')){exchanges++;assert.equal(options.method,'POST');return json({access_token:'fixture-access',expires_in:86400});}assert.equal(options.headers.Authorization,'Bearer fixture-access');return json({data:{data:[],total_count:0,next:null}});};
 await readFlexport({}, {sql,fetcher});assert.ok(!JSON.stringify(stored).includes('fixture-access'));
 await readFlexport({}, {sql,fetcher});assert.equal(exchanges,1);
 stored={refresh_after:Date.now()+60000};await assert.rejects(readFlexport({}, {sql,fetcher}),/refreshing/);assert.equal(exchanges,1);
});
test('encrypted credential cache never syncs into the browser workspace',()=>{
 const result=projectSyncPage([{tbl:'commerce_flexport_credentials',id:'test',data:{token:'encrypted'},updated_at:'2026-09-24T00:00:00Z'}],{cutoff:'2026-09-24T01:00:00Z'});
 assert.deepEqual(result.tables,{});
});
