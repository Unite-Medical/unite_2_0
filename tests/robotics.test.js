import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPublicInquiry } from '../api/_lib/publicInquiry.js';
import { pushRoboticsContact, roboticsContactProperties } from '../api/_lib/roboticsHubspot.js';
import { validateRestoreSnapshot, publicRestoreSnapshot } from '../api/_lib/restoreSavings.js';
import { savingsDisplay } from '../src/lib/roboticsSavings.js';
import { verifyHmacSignature, hmacHex } from '../api/_lib/http.js';
const input={kind:'robotics',idempotency_key:'robotics-example-key-001',company:'QA Hospital',name:'Test Buyer',email:'buyer@example.test',phone:'555-0100',inquiry_type:'savings',instrument_model:'da Vinci Xi',instrument_volume:'100–500 / yr',message:'Please review our program.'};
const settings={ownerEmail:'jacobe@unitemedical.net',notificationEmail:'support@unitemedical.net',now:new Date('2026-09-24T12:00:00Z')};
test('robotics saves all four request paths with fixed assignment and complete notifications',()=>{
 for(const kind of ['savings','consult','collections','distributor']){
  const result=planPublicInquiry({...input,inquiry_type:kind,owner_email:'attacker@example.test'},settings);
  assert.equal(result.ok,true);assert.equal(result.inquiry.owner_email,settings.ownerEmail);assert.equal(result.task.owner_email,settings.ownerEmail);assert.equal(result.outbox.to_address,settings.notificationEmail);
  assert.equal(result.inquiry.program,'restore_robotics');assert.equal(result.inquiry.hubspot_status,'pending');
  for(const detail of [input.name,input.email,input.phone,input.message,kind])assert.ok(result.outbox.body.includes(detail));
  assert.equal(result.inquiry.instrument_model,['collections','distributor'].includes(kind)?null:input.instrument_model);
 }
});
test('collections accepts contact-only requests and excludes stale purchase fields from stored data and retries',()=>{
 const request={...input,inquiry_type:'collections',instrument_model:'',instrument_volume:'',message:'We have expired instruments to return.'};
 const result=planPublicInquiry(request,settings);
 assert.equal(result.ok,true);
 assert.equal(result.inquiry.instrument_model,null);
 assert.equal(result.inquiry.instrument_volume,null);
 assert.match(result.task.subject,/collections/);
 assert.match(result.outbox.body,/Request: collections/);
 assert.match(result.outbox.body,/expired instruments to return/);
 assert.equal(roboticsContactProperties(result.inquiry).unite_robotics_inquiry,'collections');
 const stale=planPublicInquiry({...request,instrument_model:'da Vinci Xi',instrument_volume:'1,000+ / yr'},settings);
 assert.equal(stale.inquiry.request_hash,result.inquiry.request_hash);
 assert.equal(planPublicInquiry({...request,email:''},settings).ok,false);
});
test('retries are stable and changing the request type/model produces a conflict hash',()=>{
 const original=planPublicInquiry(input,settings);
 assert.deepEqual(planPublicInquiry(input,settings),original);
 for(const patch of [{inquiry_type:'consult'},{instrument_model:'Both'},{message:'Changed'}]){
  const changed=planPublicInquiry({...input,...patch},settings);assert.equal(changed.inquiry.id,original.inquiry.id);assert.notEqual(changed.inquiry.request_hash,original.inquiry.request_hash);
 }
});
test('robotics validates identities, form fields and honeypots on the server',()=>{
 for(const patch of [{email:'broken'},{company:''},{name:''},{inquiry_type:'invalid'},{instrument_model:''},{instrument_volume:''},{website_confirm:'bot'},{idempotency_key:'tiny'}])assert.equal(planPublicInquiry({...input,...patch},settings).ok,false);
 assert.equal(planPublicInquiry({...input,inquiry_type:'distributor',instrument_model:'',instrument_volume:''},settings).ok,true);
});
const row=planPublicInquiry(input,settings).inquiry;
const schema={results:Object.keys(roboticsContactProperties(row)).map(name=>({name}))};
const response=(status,body={})=>({ok:status<300,status,json:async()=>body});
test('HubSpot preserves existing identity/lifecycle and only writes program fields',async()=>{
 const calls=[];const result=await pushRoboticsContact(row,{token:'test',fetcher:async(url,options)=>{calls.push({url,...options});return url.endsWith('/properties/contacts')?response(200,schema):response(200,{id:'123'});}});
 assert.equal(result.status,'synced');assert.equal(calls.length,2);const props=JSON.parse(calls[1].body).properties;
 assert.equal(props.unite_program,'Restore Robotics');assert.equal(props.unite_robotics_inquiry,'savings');assert.equal(props.lifecyclestage,undefined);assert.equal(props.firstname,undefined);assert.equal(props.hs_marketable_status,undefined);
});
test('new HubSpot contact created once and a concurrent create conflict updates by email',async()=>{
 let patches=0;const calls=[];const result=await pushRoboticsContact(row,{token:'test',fetcher:async(url,options)=>{calls.push({url,...options});if(url.endsWith('/properties/contacts'))return response(200,schema);if(options.method==='PATCH')return ++patches===1?response(404):response(200,{id:'456'});return response(409);}});
 assert.equal(result.contact_id,'456');assert.equal(calls.filter(c=>c.method==='POST').length,1);assert.equal(patches,2);
});
test('unconfigured HubSpot makes no requests and failed permissions do not report synced',async()=>{
 assert.equal((await pushRoboticsContact(row,{fetcher:()=>assert.fail('must not call')})).status,'not_configured');
 await assert.rejects(pushRoboticsContact(row,{token:'test',fetcher:async()=>response(403)}),/hubspot_http_403/);
});
const valid={total_savings_usd:912345.67,as_of:'2026-09-23T12:00:00Z'};
test('savings requires a numeric total, dated snapshot and whole nonnegative counts',()=>{
 assert.equal(validateRestoreSnapshot(valid).ok,true);
 for(const patch of [{total_savings_usd:null},{total_savings_usd:''},{total_savings_usd:'900000'},{total_savings_usd:-1},{total_savings_usd:Infinity},{as_of:'bad'},{as_of:'2099-01-01T00:00:00Z'},{instrument_count:1.5},{hospital_count:-1}])assert.equal(validateRestoreSnapshot({...valid,...patch}).ok,false);
 assert.equal(validateRestoreSnapshot({...valid,total_savings_usd:0}).ok,true);
});
test('public savings strips private breakdowns and timestamps the display without rounding up',()=>{
 const visible=publicRestoreSnapshot({...valid,breakdown:[{hospital:'private'}],hospital_count:7,internal:'secret'},'2026-09-24T12:00:00Z');
 assert.equal(visible.breakdown,undefined);assert.equal(visible.internal,undefined);assert.equal(visible.hospital_count,7);
 assert.equal(savingsDisplay(visible).value,'$912,346');assert.match(savingsDisplay(visible).detail,/Sep 23, 2026/);
 assert.equal(savingsDisplay({ok:true,total_savings_usd:null}).live,false);assert.equal(savingsDisplay(null).value,'$1.4M');assert.equal(savingsDisplay({...visible,total_savings_usd:0}).value,'$0');
});
test('webhook signatures cover original whitespace and reject modified bodies',()=>{
 const raw=JSON.stringify(valid,null,2),secret='test-only-secret',header=hmacHex(secret,raw);
 assert.equal(verifyHmacSignature({header,payload:raw,secret}).ok,true);
 assert.equal(verifyHmacSignature({header,payload:JSON.stringify(valid),secret}).ok,false);
});

import { createInquiryHandler } from '../api/public/inquiry.js';
function fakeResponse(){return {statusCode:0,setHeader(){},end(value){this.body=JSON.parse(value);}};}
function databaseFor(plan, mode='saved') {
 const sql=()=>{};
 sql.transaction=async build=>{
  const queries=build((strings,...values)=>({strings:strings.join('?'),values}));
  assert.equal(queries.length,5);assert.ok(queries[0].strings.includes('pg_advisory_xact_lock'));
  assert.ok(queries[2].values.includes('tasks'));assert.ok(queries[3].values.includes('inquiry_notifications'));
  return [[],mode==='saved'?[{id:plan.inquiry.id}]:[],[],[],mode==='limited'?[]:[{request_hash:mode==='conflict'?'different':plan.inquiry.request_hash}]];
 };
 return sql;
}
test('committed anonymous inquiry succeeds even if both external deliveries fail',async()=>{
 const plan=planPublicInquiry(input,settings);let notifications=0,syncs=0;
 const handler=createInquiryHandler({environment:{DATABASE_URL:'test'},connect:()=>databaseFor(plan),notify:async()=>{notifications++;throw new Error('email down');},sync:async()=>{syncs++;throw new Error('CRM down');}});
 const res=fakeResponse();await handler({method:'POST',headers:{},body:input},res);
 assert.equal(res.statusCode,201);assert.equal(res.body.ok,true);assert.equal(res.body.id,plan.inquiry.id);assert.equal(res.body.notification_status,'delivery_unknown');assert.equal(notifications,1);assert.equal(syncs,1);
});
test('rate-limited or conflicting submissions never attempt external delivery',async()=>{
 for(const mode of ['limited','conflict']){
  const handler=createInquiryHandler({environment:{DATABASE_URL:'test'},connect:()=>databaseFor(planPublicInquiry(input,settings),mode),notify:()=>assert.fail('must not send'),sync:()=>assert.fail('must not sync')});
  const res=fakeResponse();await handler({method:'POST',headers:{},body:input},res);assert.equal(res.statusCode,mode==='limited'?429:409);
 }
});
test('malformed requests and database errors cannot produce a false receipt',async()=>{
 const handler=createInquiryHandler({environment:{DATABASE_URL:'test'},connect:()=>{throw new Error('database down');}});
 for(const [body,status] of [['{',400],['null',400],[input,500]]){const res=fakeResponse();await handler({method:'POST',headers:{},body},res);assert.equal(res.statusCode,status);assert.notEqual(res.body.ok,true);}
});
