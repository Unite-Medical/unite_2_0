import test from 'node:test';
import assert from 'node:assert/strict';
import {accountContacts,customerBillingSummary} from '../src/lib/customerAccountPresentation.js';
import {createProfileHandler,validateProfilePatch} from '../api/account/profile.js';

test('customer contacts stay within the selected organization and expose presentation fields only',()=>{
 const rows=[{id:'a',org_id:'qa',name:'Alex Hassan',email:'alex@example.test',password_hash:'never-display',status:'active'},{id:'b',org_id:'other',name:'Other'},{id:'c',org_id:'qa',status:'disabled'}];
 assert.deepEqual(accountContacts(rows,'qa'),[{id:'a',name:'Alex Hassan',email:'alex@example.test',title:''}]);
});
test('an approved ACH method never invents a linked bank, payment or auto-pay status',()=>{
 const summary=customerBillingSummary([{org_id:'qa',method:'ach',status:'active'},{org_id:'other',method:'card',status:'active'}],'qa');
 assert.equal(summary.approvedMethods,'ACH');assert.match(summary.collection,/does not mean a bank account is linked/);
 assert.doesNotMatch(JSON.stringify(summary),/CHASE|5421|auto.pay.*Off|Last sync/);
 assert.match(customerBillingSummary([],'qa').approvedMethods,/No approved/);
});
test('own-profile edits accept only a bounded name and title, never identity or authority fields',()=>{
 assert.deepEqual(validateProfilePatch({name:' Alex Hassan ',title:'Owner'}),{name:'Alex Hassan',title:'Owner'});
 for(const body of [{name:'',title:''},{name:'x'.repeat(121),title:''},{name:'Alex',title:'',role:'admin'},{name:'Alex',title:'',id:'another'},{name:'Alex',title:'',password:'secret'}])assert.equal(validateProfilePatch(body),null);
});
function fixture({authorized=true,race=false}={}){
 const writes=[];const profile={id:'self',name:'Alex',role:'customer',org_id:'qa'};
 const sql={transaction:async callback=>{callback((strings,...values)=>{writes.push({query:strings.join('?'),values});return {};});return [race?[]:[{id:'self'}],[]];}};
 const handler=createProfileHandler({env:{DATABASE_URL:'synthetic-only'},sqlFactory:()=>sql,authorize:async(_req,_sql,options)=>{assert.deepEqual(options.roles,['customer','distributor']);return authorized?{ok:true,profile,session:{user_id:'self',org_id:'qa'}}:{ok:false,reason:'authentication_required'};}});
 return {writes,async call({origin='https://staging.example.test',body={name:'Alex Hassan',title:'Owner'}}={}){let text='';const res={setHeader(){},end(value){text=value;}};await handler({method:'POST',headers:{origin,host:'staging.example.test'},body},res);return {status:res.statusCode,body:JSON.parse(text)};}};
}
test('profile save persists only the authenticated user and returns no credentials',async()=>{
 const f=fixture(),result=await f.call();assert.equal(result.status,200);assert.equal(result.body.profile.id,'self');assert.equal(result.body.profile.name,'Alex Hassan');assert.equal(result.body.profile.title,'Owner');assert.ok(Date.parse(result.body.profile.updated_at));assert.deepEqual(Object.keys(result.body.profile).sort(),['id','name','title','updated_at']);
 assert.equal(f.writes.length,2);assert.ok(f.writes[0].values.includes('self'));assert.match(f.writes[0].query,/AND data=/);assert.match(f.writes[1].query,/audit_log/);
});
test('profile endpoint blocks cross-origin, signed-out and concurrent edits without reporting success',async()=>{
 const cross=fixture();assert.equal((await cross.call({origin:'https://elsewhere.example.test'})).status,403);assert.equal(cross.writes.length,0);
 const anon=fixture({authorized:false});assert.equal((await anon.call()).status,401);assert.equal(anon.writes.length,0);
 assert.equal((await fixture({race:true}).call()).status,409);
 const authority=fixture();assert.equal((await authority.call({body:{name:'Alex',title:'',role:'admin'}})).status,400);assert.equal(authority.writes.length,0);
});
