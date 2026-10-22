import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { createSessionToken } from '../api/_lib/auth.js';
import { createShopifyCatchupHandler, CATCHUP_IDS, CATCHUP_TARGET, catchupTargetFingerprint } from '../api/admin/shopify-catchup.js';
import { shopifyCatchupHash } from '../api/_lib/shopifyCatchup.js';

const at='2026-10-22T12:00:00.000Z';
const session={user_id:'synthetic-admin',email:'admin@example.test',role:'admin',org_id:CATCHUP_TARGET.org,mfa_verified:true};
const profile={id:session.user_id,email:session.email,role:'admin',org_id:session.org_id,status:'active'};
const identity={database_name:'synthetic_db',schema_name:'public',relation_oid:'123',relkind:'r',row_security:false,partitioned:false,inherited:false,user_triggers:[],rules:[]};
const env={DATABASE_URL:'postgres://synthetic:secret@synthetic.neon.test/synthetic_db?sslmode=require',VERCEL_PROJECT_ID:CATCHUP_TARGET.project,PUBLIC_APP_ORIGIN:CATCHUP_TARGET.origin};
const clone=structuredClone;
const same=(a,b)=>shopifyCatchupHash(a)===shopifyCatchupHash(b);
function sources(){return CATCHUP_IDS.map((id,i)=>({id,name:'#Synthetic-'+(i+1),customer:{id:'2001'},created_at:'2026-10-01T12:00:00Z',updated_at:at,financial_status:'paid',fulfillment_status:i===0?'fulfilled':null,cancelled_at:null,currency:'USD',current_total_price:'25.00',current_subtotal_price:'25.00',current_total_tax:'0.00',total_outstanding:'0.00',total_discounts:'0.00',total_shipping_price_set:{shop_money:{amount:'0.00'}},line_items:[{id:String(3001+i),variant_id:'4001',product_id:'5001',sku:'SYNTHETIC',name:'Invented item',price:'25.00',quantity:1,current_quantity:1,fulfillable_quantity:i===0?0:1,total_discount:'0.00',discount_allocations:[]}],fulfillments:[],refunds:[]}));}
function fixture(options={}){
  const state={rows:[{tbl:'commerce_customers',id:'2001',data:{id:'2001',name:'Invented customer'},deleted:false},{tbl:'commerce_products',id:'4001',data:{id:'4001',variant_id:'gid://shopify/ProductVariant/4001',product_id:'gid://shopify/Product/5001',sku:'SYNTHETIC'},deleted:false},{tbl:'profiles',id:profile.id,data:clone(profile),deleted:false}],identity:clone(identity),sources:sources(),queries:[],transactions:[],fetches:[],writes:0,...options};
  function snapshot(rows,params){
    const [ids,numbers,customers,variants,auditId]=params;
    return rows.filter(r=>r.tbl==='commerce_orders'&&(ids.includes(r.id)||[r.data.id,r.data.shopify_order_id,r.data.source_order_id,r.data.source?.id,r.data.catchup_import?.source_order_id].some(id=>ids.includes(String(id)))||numbers.includes(r.data.number))||r.tbl==='commerce_customers'&&customers.includes(r.id)||r.tbl==='commerce_products'&&(variants.includes(r.id)||variants.includes(r.data.variant_id))||r.tbl==='audit_log'&&r.id===auditId).sort((a,b)=>a.tbl.localeCompare(b.tbl)||a.id.localeCompare(b.id));
  }
  function execute(query,rows,write){
    const {text,params=[]}=query;state.queries.push(query);
    if (/identity_unchanged/.test(text)) {if(!same(state.identity,JSON.parse(params[0])))throw Object.assign(new Error('stale identity'),{code:'22012'});return [{identity_unchanged:1}];}
    if (/snapshot_unchanged/.test(text)){if(!same(snapshot(rows,params),JSON.parse(params[5])))throw Object.assign(new Error('stale snapshot'),{code:'22012'});return [{snapshot_unchanged:1}];}
    if (/profile_unchanged/.test(text)){if(!rows.some(r=>r.tbl==='profiles'&&r.id===params[0]&&!r.deleted&&same(r.data,JSON.parse(params[1]))))throw new Error('stale profile');return [{profile_unchanged:1}];}
    if (/all_inserted/.test(text)){const entries=JSON.parse(params[0]);if(state.failFinalCheck||entries.filter(e=>rows.some(r=>r.tbl==='commerce_orders'&&r.id===e.id&&!r.deleted&&same(r.data,e.data))).length!==params[1])throw new Error('incomplete insert');return [{all_inserted:1}];}
    if (/^SELECT current_database/.test(text))return [clone(state.identity)];
    if (/^SELECT tbl,id,data,deleted/.test(text))return clone(snapshot(rows,params));
    if (/SELECT data FROM um_rows WHERE tbl='profiles'/.test(text))return rows.filter(r=>r.tbl==='profiles'&&r.id===params[0]&&!r.deleted).map(r=>({data:clone(r.data)}));
    if (/^INSERT INTO public.um_rows/.test(text)){
      assert.equal(write,true,'DML must be in atomic write transaction');state.writes++;
      if (text.includes("SELECT 'commerce_orders'")){const entries=JSON.parse(params[0]);for(const entry of entries)if(!rows.some(r=>r.tbl==='commerce_orders'&&r.id===entry.id))rows.push({tbl:'commerce_orders',id:entry.id,data:entry.data,deleted:false});return entries.map(e=>({id:e.id}));}
      if(text.includes("VALUES('audit_log'")){if(rows.some(r=>r.tbl==='audit_log'&&r.id===params[0]))throw new Error('duplicate audit');rows.push({tbl:'audit_log',id:params[0],data:JSON.parse(params[1]),deleted:false});return [];}
      assert.fail('unexpected DML');
    }
    if (/^(SET LOCAL|LOCK TABLE)/.test(text))return [];
    assert.fail('unexpected SQL: '+text.slice(0,90));
  }
  const sql=(parts,...params)=>Promise.resolve(execute({text:parts.join('?'),params},state.rows,false));
  sql.transaction=async(callback,opts)=>{
    state.transactions.push(opts);
    if(!opts.readOnly&&state.race)state.race(state);
    const working=clone(state.rows),tx={query:(text,params)=>({text,params})};
    const queries=callback(tx);if(opts.readOnly)assert.ok(queries.every(q=>/^SELECT /.test(q.text)));
    const result=queries.map(query=>execute(query,working,!opts.readOnly));
    if(!opts.readOnly)state.rows=working;
    return result;
  };
  const service={configured:()=>true,headers:async()=>({'X-Shopify-Access-Token':'invented-token'}),buildUrl:(path,query)=>{const url=new URL('https://synthetic.myshopify.com'+path);for(const [key,value]of Object.entries(query))url.searchParams.set(key,String(value));return url.href;}};
  const fetchImpl=async(url,request)=>{state.fetches.push({url,request});return new Response(JSON.stringify({orders:state.sources}),{status:200,headers:{'Content-Type':'application/json'}});};
  const authorize=async(req,connection,config)=>{assert.deepEqual(config,{roles:['admin']});return {ok:true,session:clone(session),profile:clone(profile)};};
  const handler=createShopifyCatchupHandler({env:{...env,...options.env},sqlFactory:()=>sql,authorize:options.authorize||authorize,service,fetchImpl,now:()=>new Date(state.now||at)});
  async function request({method='GET',query={},body,headers={}}={}){const response={headers:{},setHeader(name,value){this.headers[name]=value;},end(text){this.text=text;}};await handler({method,query,body,headers:{host:'staging.unitemedical.net',origin:CATCHUP_TARGET.origin,'content-type':'application/json',...headers}},response);return {status:response.statusCode,headers:response.headers,text:response.text,...(response.headers['Content-Type']?.includes('json')?{body:JSON.parse(response.text)}:{})};}
  return {state,request,sql,service,fetchImpl};
}
const applyBody=plan=>({action:'apply',run_id:plan.run_id,target_fingerprint:plan.target_fingerprint,baseline_plan_sha256:plan.baseline_plan_sha256,confirm:'IMPORT_48_HISTORICAL_SHOPIFY_ORDERS'});
async function dryRun(f){const response=await f.request({query:{action:'dry_run',run_id:'synthetic-run'}});assert.equal(response.status,200,response.text);return response.body;}

test('identity is read-only and exposes fingerprint, never database host/name/password',async()=>{
  const f=fixture(),r=await f.request();assert.equal(r.status,200);assert.match(r.body.target_fingerprint,/^[a-f0-9]{64}$/);assert.equal(r.body.scope_count,48);
  assert.ok(f.state.transactions.every(tx=>tx.readOnly));assert.equal(f.state.fetches.length,0);assert.equal(f.state.writes,0);
  for(const secret of ['synthetic_db','synthetic.neon.test','secret'])assert.equal(r.text.includes(secret),false);
  assert.equal(catchupTargetFingerprint(env.DATABASE_URL,identity),catchupTargetFingerprint(env.DATABASE_URL.replace('synthetic:secret','other:different'),identity));
});

test('project, exact configured origin/host, staging org, admin and MFA gates fail closed',async()=>{
  for(const patch of [{VERCEL_PROJECT_ID:'other'},{PUBLIC_APP_ORIGIN:'https://other.test'}]){const f=fixture({env:patch});assert.equal((await f.request()).status,403);assert.equal(f.state.transactions.length,0);}
  assert.equal((await fixture().request({headers:{host:'other.test'}})).status,403);
  for(const patch of [{org_id:'other'},{role:'customer'},{mfa_verified:false}]){const f=fixture({authorize:async()=>({ok:true,session:{...session,...patch},profile})});assert.equal((await f.request()).status,403);assert.equal(f.state.transactions.length,0);}
  const f=fixture({authorize:async()=>({ok:false,reason:'authentication_required'})});assert.equal((await f.request()).status,401);
});

test('actual shared authorization accepts valid current MFA profile and rejects missing/stale sessions',async()=>{
  const previous=process.env.SESSION_SECRET;process.env.SESSION_SECRET='synthetic-session-secret-of-more-than-24-characters';
  try{
    const f=fixture();const handler=createShopifyCatchupHandler({env,sqlFactory:()=>f.sql,service:f.service,fetchImpl:f.fetchImpl});
    async function call(cookie){const response={setHeader(){},end(text){this.text=text;}};await handler({method:'GET',headers:{host:'staging.unitemedical.net',cookie},query:{}},response);return response;}
    assert.equal((await call('')).statusCode,401);
    const token=createSessionToken(session);assert.equal((await call('um_session='+token)).statusCode,200);
    f.state.rows.find(r=>r.tbl==='profiles').data.status='inactive';assert.equal((await call('um_session='+token)).statusCode,403);
  }finally{if(previous===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=previous;}
});

test('dry-run fetches only approved 48 through GET and never writes or exposes contacts',async()=>{
  const f=fixture();f.state.sources[0].email='private@example.test';f.state.sources[0].shipping_address={address1:'Private synthetic street'};
  const plan=await dryRun(f);assert.equal(plan.counts.insert,48);assert.equal(f.state.writes,0);assert.equal(f.state.fetches.length,1);
  assert.ok(plan.orders.every(order=>order.financial_status==='payment_review_needed'&&order.source_financial_status==='paid'&&order.total_outstanding===null));
  const remote=f.state.fetches[0];assert.equal(remote.request.method,'GET');assert.equal(remote.request.redirect,'error');assert.deepEqual(new URL(remote.url).searchParams.get('ids').split(','),CATCHUP_IDS);
  assert.ok(f.state.transactions.every(tx=>tx.readOnly));assert.equal(JSON.stringify(plan).includes('private@example.test'),false);assert.equal(JSON.stringify(plan).includes('Private synthetic street'),false);
});

test('POST requires same-origin, explicit fingerprint/plan, bounded body and fixed request fields',async()=>{
  const f=fixture(),plan=await dryRun(f),body=applyBody(plan);
  for(const input of [{headers:{origin:'https://other.test'}},{body:{...body,target_fingerprint:'b'.repeat(64)}},{body:{...body,confirm:'yes'}},{body:{...body,ids:CATCHUP_IDS}},{body:{...body,run_id:'x'.repeat(3000)}}]){
    const before=f.state.fetches.length;const r=await f.request({method:'POST',body,...input});assert.ok(r.status>=400);assert.equal(f.state.writes,0);assert.equal(f.state.fetches.length,before);
  }
});

test('apply is atomic insert-only commerce history plus audit; refreshed unchanged replay has no writes',async()=>{
  const f=fixture(),plan=await dryRun(f),body=applyBody(plan);f.state.now='2026-10-22T13:00:00.000Z';
  const r=await f.request({method:'POST',body});assert.equal(r.status,200,r.text);assert.equal(r.body.inserted,48);
  assert.equal(f.state.rows.filter(r=>r.tbl==='commerce_orders').length,48);assert.equal(f.state.rows.filter(r=>r.tbl==='audit_log').length,1);
  const dml=f.state.queries.filter(q=>/^(INSERT|UPDATE|DELETE)/.test(q.text));assert.equal(dml.length,2);assert.ok(dml.every(q=>q.text.includes("'commerce_orders'")||q.text.includes("'audit_log'")));assert.ok(dml.every(q=>!q.text.includes('DO UPDATE')));
  assert.ok(f.state.queries.some(q=>q.text.startsWith('LOCK TABLE')));assert.ok(f.state.queries.some(q=>q.text.includes('profile_unchanged')));
  const before=clone(f.state.rows),writes=f.state.writes;f.state.now='2026-10-22T14:00:00.000Z';
  const replay=await f.request({method:'POST',body});assert.equal(replay.status,200,replay.text);assert.equal(replay.body.status,'unchanged_replay');assert.equal(f.state.writes,writes);assert.deepEqual(f.state.rows,before);
});

test('changed source or destination mapping invalidates approved baseline before apply',async()=>{
  for(const mutate of [f=>{f.state.sources[0].updated_at='2026-10-22T15:00:00Z';},f=>{f.state.rows.find(r=>r.tbl==='commerce_products').data.sku='CHANGED';}]){
    const f=fixture(),plan=await dryRun(f);mutate(f);const r=await f.request({method:'POST',body:applyBody(plan)});assert.equal(r.status,409,r.text);assert.equal(r.body.error,'baseline_plan_changed_refresh_dry_run');assert.equal(f.state.writes,0);
  }
});

test('existing, edited and deleted target records block the whole import',async()=>{
  const f=fixture(),plan=await dryRun(f);f.state.rows.push({tbl:'commerce_orders',id:CATCHUP_IDS[0],data:{id:CATCHUP_IDS[0],notes:'Existing staff record'},deleted:false});
  const r=await f.request({method:'POST',body:applyBody(plan)});assert.equal(r.status,409);assert.equal(f.state.writes,0);
  const other=fixture(),approved=await dryRun(other);await other.request({method:'POST',body:applyBody(approved)});
  other.state.rows.find(r=>r.tbl==='commerce_orders').data.notes='Staff edit';const before=clone(other.state.rows);const blocked=await other.request({method:'POST',body:applyBody(approved)});assert.equal(blocked.status,409);assert.deepEqual(other.state.rows,before);
});

test('unknown user triggers, rules and relation side effects are blocked before provider reads',async()=>{
  for(const patch of [{user_triggers:[{name:'synthetic_trigger',enabled:'O'}]},{rules:[{name:'synthetic_rule'}]},{row_security:true},{partitioned:true},{inherited:true}]){
    const f=fixture({identity:{...identity,...patch}});const r=await f.request({query:{action:'dry_run'}});assert.equal(r.status,409);assert.equal(f.state.fetches.length,0);assert.equal(f.state.writes,0);
  }
});

test('race after dry-run and final insert assertion failure roll back all effects',async()=>{
  const f=fixture(),plan=await dryRun(f);f.state.race=state=>{state.rows.find(r=>r.tbl==='commerce_products').data.sku='RACE';};
  const r=await f.request({method:'POST',body:applyBody(plan)});assert.equal(r.status,409);assert.equal(f.state.rows.filter(r=>r.tbl==='commerce_orders').length,0);assert.equal(f.state.rows.filter(r=>r.tbl==='audit_log').length,0);
  const second=fixture(),approved=await dryRun(second);second.state.failFinalCheck=true;const failed=await second.request({method:'POST',body:applyBody(approved)});assert.equal(failed.status,409);assert.equal(second.state.rows.filter(r=>r.tbl==='commerce_orders'||r.tbl==='audit_log').length,0);
});

test('normal HTML dry-run/form POST works without script and escapes dynamic source text',async()=>{
  const f=fixture();f.state.sources[0].name='<script>alert(1)</script>';
  const r=await f.request({query:{view:'html',run_id:'synthetic-run'}});assert.equal(r.status,200,r.text);assert.ok(r.headers['Content-Security-Policy'].includes("form-action 'self'"));assert.equal(r.headers['Cache-Control'],'no-store, private');
  assert.equal(r.text.includes('<script>'),false);assert.ok(r.text.includes('&lt;script&gt;'));
  const fields={};for(const match of r.text.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g))fields[match[1]]=match[2];fields.confirm='IMPORT_48_HISTORICAL_SHOPIFY_ORDERS';
  const apply=await f.request({method:'POST',body:new URLSearchParams(fields).toString(),headers:{'content-type':'application/x-www-form-urlencoded'}});assert.equal(apply.status,200,apply.text);assert.ok(apply.text.includes('48 inserted'));
});

test('extra/missing/duplicate provider IDs never broaden import scope',async()=>{
  for(const mutate of [orders=>orders.pop(),orders=>orders.push({...orders[0],id:'999999'}),orders=>{orders[1].id=orders[0].id;}]){const f=fixture();mutate(f.state.sources);const r=await f.request({query:{action:'dry_run'}});assert.equal(r.status,502);assert.equal(f.state.writes,0);}
});
