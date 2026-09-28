import test from 'node:test';
import assert from 'node:assert/strict';
import {planWellRequest,publicWellRequest,reviewWellRequest} from '../api/_lib/welllinkIntake.js';
import {createWellRequestHandler} from '../api/welllink/requests.js';
import {WELL_PUBLIC_PRODUCTS} from '../src/data/welllinkPublic.js';
import {projectSyncPage} from '../api/_lib/syncPage.js';
import {rawSyncMutationAllowed} from '../api/db/sync.js';
const input={idempotency_key:'welllink-test-123456',kind:'access',name:'QA Buyer',title:'Purchasing',email:'buyer@example.org',organization:'QA organization',facility:'QA facility',address:'1 Test Way',city:'Atlanta',state:'GA',zip:'30303',participation_status:'accepted',contact_permission:true,skus:[],referral:{utm_source:'welllink',utm_campaign:'welllink_cc_ns_0052'}};
const actor={role:'admin',email:'damon@unitemedical.net',user_id:'admin'};

test('public intake saves a routed request without trusting self-reported approval or price',()=>{
 const p=planWellRequest({...input,status:'approved',pricing_enabled:true,unit_price:0.01,owner_email:'attacker@elsewhere.org'});
 assert.equal(p.ok,true);assert.equal(p.request.status,'requested');assert.equal(p.request.pricing_enabled,false);assert.equal(p.request.unit_price,undefined);assert.equal(p.request.owner_email,'damon@unitemedical.net');assert.equal(p.lead.owner,p.request.owner_email);assert.equal(p.task.owner_email,p.request.owner_email);assert.equal(p.request.marketing_opt_in,false);assert.equal(p.request.referral.utm_source,'welllink');
 assert.equal(planWellRequest(input).request.request_hash,planWellRequest(input).request.request_hash);
});
test('case requests and sample boxes cannot be interchanged or priced by the client',()=>{
 const p=WELL_PUBLIC_PRODUCTS[2];assert.equal(p.sku,'21IN-0503000010-C');assert.equal(p.eachPerCase,1600);
 for(const quantity of ['0','1.5','-2','10001','banana'])assert.equal(planWellRequest({...input,kind:'quote',skus:[p.sku],quantity}).error,'whole_cases_required');
 assert.equal(planWellRequest({...input,kind:'quote',skus:[p.sampleSku],quantity:'1'}).error,'invalid_products');
 const quote=planWellRequest({...input,kind:'quote',skus:[p.sku],quantity:'2'});assert.deepEqual(quote.request.case_quantities,{[p.sku]:2});
 assert.equal(planWellRequest({...input,kind:'sample',skus:[p.sku],carrier:'quote_shipping'}).error,'invalid_products');
 assert.equal(planWellRequest({...input,kind:'sample',skus:[p.sampleSku],carrier:'UPS',carrier_account:'SYNTHETIC'}).error,'carrier_authorization_required');
 assert.equal(planWellRequest({...input,kind:'sample',skus:[p.sampleSku],carrier:'quote_shipping'}).ok,true);
});
test('validation bounds requests and separates contact permission from marketing opt-in',()=>{
 for(const patch of [{name:''},{email:'bad'},{facility:'x'.repeat(201)},{zip:'abcde'},{participation_status:'approved'},{contact_permission:false},{skus:['PRIVATE']}])assert.equal(planWellRequest({...input,...patch}).ok,false);
 assert.equal(planWellRequest({...input,marketing_opt_in:true}).request.marketing_opt_in,true);
});
test('staff review is versioned and cannot grant contract pricing or expose internal notes',()=>{
 const {request}=planWellRequest(input);
 assert.equal(reviewWellRequest(request,{version:0,status:'approved',note:'approved'},actor).error,'invalid_status');
 assert.equal(reviewWellRequest(request,{version:1,status:'verifying',note:'Roster review'},actor).error,'request_changed');
 assert.equal(reviewWellRequest(request,{version:0,status:'verifying',note:'Roster review'},{role:'customer'}).error,'welllink_review_forbidden');
 const changed=reviewWellRequest(request,{version:0,status:'cpf_pending',note:'Internal evidence reference'},actor).row;
 assert.equal(changed.version,1);assert.equal(changed.pricing_enabled,false);
 const publicRow=publicWellRequest(changed);for(const field of ['staff_note','address','email','carrier_account','request_hash'])assert.equal(publicRow[field],undefined);
 assert.equal(rawSyncMutationAllowed({table:'welllink_requests',op:'upsert'}),false);
 assert.deepEqual(projectSyncPage([{tbl:'welllink_requests',data:changed}],{cutoff:new Date().toISOString()}).tables,{});
});

function fixture(){
 const store=new Map();let transactions=0;
 const sql=async(strings,...values)=>{
  const query=strings.join('?');
  if(query.includes('COUNT(*)'))return [{count:0}];
  if(query.includes('INSERT INTO')&&!query.includes('WITH changed')){const [table,id,json]=values;const key=`${table}:${id}`;if(store.has(key))return [];store.set(key,JSON.parse(json));return [{id}];}
  if(query.includes('SELECT data')&&query.includes("tbl='welllink_requests'")){
   let rows=[...store].filter(([k])=>k.startsWith('welllink_requests:')).map(([,data])=>({data}));
   if(query.includes('AND id='))rows=rows.filter(r=>r.data.id===values[0]);
   if(query.includes("lower(data->>'email')"))rows=rows.filter(r=>r.data.email===values[0]);
   return rows;
  }
  throw new Error('Unhandled fake query');
 };
 sql.transaction=async callback=>{transactions++;return Promise.all(callback(sql));};
 return {store,sql,get transactions(){return transactions;}};
}
async function call(handler,{method='POST',body=input,session=null,query={},headers={}}={}){
 let result;const res={setHeader(){},end(value){result={status:this.statusCode,body:JSON.parse(value)};}};
 await handler({method,body,session,query,headers:{'content-type':'application/json',host:'staging.unitemedical.net',origin:'https://staging.unitemedical.net',...headers}},res);return result;
}
test('request API persists once, retries safely, conflicts on changes and prevents anonymous reads',async()=>{
 const f=fixture();const handler=createWellRequestHandler({getSql:()=>f.sql,hasSession:req=>Boolean(req.session),authorize:async req=>req.session?{ok:true,session:req.session}:{ok:false,reason:'authentication_required'}});
 assert.equal((await call(handler)).status,201);assert.equal(f.store.size,4);
 assert.equal((await call(handler)).status,200);assert.equal(f.transactions,1);
 assert.equal((await call(handler,{body:{...input,facility:'Changed'}})).status,409);
 assert.equal((await call(handler,{method:'GET'})).status,401);
 assert.equal((await call(handler,{method:'GET',session:{role:'customer',email:'other@example.org'},query:{view:'staff'}})).status,403);
 assert.deepEqual((await call(handler,{method:'GET',session:{role:'customer',email:'other@example.org'}})).body.requests,[]);
 const own=await call(handler,{method:'GET',session:{role:'customer',email:input.email}});assert.equal(own.body.requests.length,1);assert.equal(own.body.requests[0].address,undefined);
 assert.equal((await call(handler,{headers:{origin:'https://different.example'}})).status,403);
 assert.equal((await call(handler,{body:{...input,action:'review',status:'approved'}})).status,403);
 const staff=await call(handler,{method:'GET',session:actor,query:{view:'staff'}});assert.equal(staff.body.requests.length,1);
});
