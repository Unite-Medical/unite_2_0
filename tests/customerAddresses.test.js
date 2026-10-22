import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCustomerAddress,validateCustomerAddress,sameCustomerAddress} from '../api/_lib/customerAddress.js';
import {createAddressHandler} from '../api/account/addresses.js';
const input={label:'QA delivery',recipient:'Synthetic Buyer',company:'Synthetic Clinic',line1:'100 Example Way',line2:'Suite 2',city:'Atlanta',state:'GA',zip:'30303',country:'US'};
const session={user_id:'qa-buyer',org_id:'qa-org',role:'customer'};
const key='synthetic-address-request-1';

test('delivery address validation rejects incomplete, malformed and authority-bearing payloads',()=>{
 assert.equal(validateCustomerAddress(input).recipient,'Synthetic Buyer');
 for(const patch of [{line1:''},{recipient:''},{state:'Georgia'},{zip:'not a ZIP'},{country:'USA'},{line1:'x'.repeat(201)},{org_id:'other'},{line1:'Street\nInjected'}])assert.equal(validateCustomerAddress({...input,...patch}),null);
 assert.equal(validateCustomerAddress({...input,country:'CA',state:'ON',zip:'M5V 1A1'}).country,'CA');
});
test('address identity is idempotent and scoped to the authenticated organization',()=>{
 const a=buildCustomerAddress({input,session,key}),again=buildCustomerAddress({input,session,key});
 assert.equal(a.id,again.id);assert.notEqual(a.id,buildCustomerAddress({input,session:{...session,org_id:'other'},key}).id);
 assert.equal(a.org_id,session.org_id);assert.equal(a.is_default,false);assert.equal(a.created_by,session.user_id);
 assert.equal(sameCustomerAddress(a,{...again,updated_at:'different'}),true);assert.equal(sameCustomerAddress(a,{...again,zip:'30304'}),false);
 assert.equal(buildCustomerAddress({input,session,key:'short'}),null);
});
function fixture({allowed=true,owned=true,conflict=false}={}){
 const writes=[];let stored;
 const tx=(strings,...values)=>{const query=strings.join('?');writes.push({query,values});if(query.startsWith('INSERT INTO um_rows')&&query.includes("VALUES('addresses'"))stored=JSON.parse(values[1]);return query.startsWith('UPDATE')?[{data:{id:'own',org_id:'qa-org',is_default:true}}]:[];};
 const sql=async(strings,...values)=>{const query=strings.join('?');if(query.includes('SELECT id'))return owned?[{id:'own'}]:[];if(query.includes('SELECT data'))return stored?[{data:conflict?{...stored,zip:'99999'}:stored}]:[];throw new Error('Unexpected query '+query+' '+values.length);};sql.transaction=async callback=>callback(tx);
 const handler=createAddressHandler({env:{DATABASE_URL:'synthetic'},sqlFactory:()=>sql,readSession:()=>session,loadContext:async()=>allowed?{ok:true,session}:{ok:false,reason:'buyer_authority_required'}});
 return {writes,async call(body={action:'create',idempotency_key:key,address:input},origin='https://staging.example.test'){let raw;const res={setHeader(){},end(value){raw=value;}};await handler({method:'POST',headers:{host:'staging.example.test',origin},body},res);return {status:res.statusCode,body:JSON.parse(raw)};}};
}
test('customer delivery save uses signed-in organization, returns the stored row, and audits without copying the address',async()=>{
 const f=fixture(),r=await f.call();assert.equal(r.status,200);assert.equal(r.body.address.org_id,'qa-org');assert.equal(r.body.address.recipient,input.recipient);assert.equal(f.writes.length,2);
 const audit=JSON.parse(f.writes[1].values[1]);assert.equal(audit.actor_id,'qa-buyer');assert.equal(audit.line1,undefined);assert.deepEqual(audit.payload,{source:'customer_settings'});
 assert.equal((await f.call()).body.address.id,r.body.address.id);
});
test('address save rejects changed duplicate requests instead of overwriting another version',async()=>{assert.equal((await fixture({conflict:true}).call()).status,409);});
test('default address updates only the current organization and does not accept a foreign address',async()=>{
 const denied=fixture({owned:false});assert.equal((await denied.call({action:'set_default',address_id:'foreign'})).status,404);assert.equal(denied.writes.length,0);
 const f=fixture(),r=await f.call({action:'set_default',address_id:'own'});assert.equal(r.status,200);assert.equal(r.body.addresses[0].is_default,true);assert.match(f.writes[0].query,/data->>'org_id'=/);assert.ok(f.writes[0].values.includes('qa-org'));
});
test('address actions reject cross-origin, unapproved buyer and account override requests before writes',async()=>{
 const f=fixture();assert.equal((await f.call(undefined,'https://evil.example.test')).status,403);assert.equal(f.writes.length,0);
 const denied=fixture({allowed:false});assert.equal((await denied.call()).status,403);assert.equal(denied.writes.length,0);
 const forged=fixture();assert.equal((await forged.call({action:'create',idempotency_key:key,address:{...input,org_id:'other'}})).status,400);assert.equal(forged.writes.length,0);
});
