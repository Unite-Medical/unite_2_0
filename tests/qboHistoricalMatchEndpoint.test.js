import test from 'node:test';
import assert from 'node:assert/strict';
import {createQboHistoricalMatchHandler} from '../api/admin/qbo-historical-match.js';
import {CATCHUP_IDS,CATCHUP_TARGET,catchupTargetFingerprint} from '../api/admin/shopify-catchup.js';
const clone=v=>structuredClone(v);
function harness(options={}){
 const identity={database_name:'fixture',schema_name:'public',relkind:'r',relrowsecurity:false,relispartition:false,inherited:false,triggers:0,rules:0,...options.identity};
 const env={DATABASE_URL:'postgres://fixture:fixture@fixture.invalid/fixture',VERCEL_PROJECT_ID:CATCHUP_TARGET.project,PUBLIC_APP_ORIGIN:CATCHUP_TARGET.origin,...options.env};
 let rows=CATCHUP_IDS.map((id,n)=>({id,deleted:false,data:{id,number:'#'+(n+1),historical:true,total:120,currency:'USD',financial_status:'paid',total_outstanding:0,revision:0,catchup_import:{kind:'shopify_historical_catchup_v1'},source:{email:'buyer@example.test'}}}));
 const invoice={Id:'999',DocNumber:'I999',CustomerRef:{value:'100',name:'Buyer'},CustomField:[{Name:'Order Number',StringValue:'1'}],BillEmail:{Address:'buyer@example.test'},CurrencyRef:{value:'USD'},TotalAmt:120,Balance:120,MetaData:{LastUpdatedTime:'2026-10-22T21:00:00Z'}};
 const calls=[],transactions=[];
 const sql={query:async(query)=>query.includes('pg_class')?[clone(identity)]:clone(rows),transaction:async callback=>{
  const commands=[];callback({query:(query,args)=>{commands.push({query,args});return {};}});transactions.push(commands);
  if(options.race)throw new Error('race snapshot assertion');
  for(const c of commands)if(c.query.startsWith('UPDATE public.um_rows'))for(const p of JSON.parse(c.args[0]))rows.find(r=>r.id===p.id).data=p.after;
  return [];
 }};
 const fetchImpl=async(url,init)=>{
  calls.push({url:String(url),method:init.method});
  const path=new URL(url).pathname;
  const value=path.includes('companyinfo')?{CompanyInfo:{CompanyName:options.wrongCompany?'Other LLC':'Unite Medical, LLC'}}:new URL(url).searchParams.get('query').includes('FROM Invoice')?{QueryResponse:{Invoice:[{...invoice,...options.invoice}]}}:{QueryResponse:{Customer:[{Id:'100',PrimaryEmailAddr:{Address:'buyer@example.test'}}]}};
  return {ok:true,json:async()=>clone(value),text:async()=>JSON.stringify(value)};
 };
 const live={ok:true,session:{role:'admin',mfa_verified:true,org_id:CATCHUP_TARGET.org,user_id:'admin'},profile:{id:'admin'},...options.live};
 const service={configured:()=>true,context:async()=>({realmId:'fixture-realm',environment:'production',accessToken:'never-exposed'}),buildUrl:(path,query)=>'https://quickbooks.api.intuit.com/v3/company/fixture-realm'+(query.q?'/query?query='+encodeURIComponent(query.q):path),headers:async()=>({Authorization:'Bearer fixture'})};
 const handler=createQboHistoricalMatchHandler({env,sqlFactory:()=>sql,authorize:async()=>live,service,fetchImpl,expectedFingerprint:catchupTargetFingerprint(env.DATABASE_URL,identity),now:()=>new Date('2026-10-22T22:00:00Z')});
 async function request(body,headers={}){const req={method:body?'POST':'GET',query:{},headers:{host:'staging.unitemedical.net',origin:CATCHUP_TARGET.origin,'content-type':'application/json',...headers},...(body?{body}:{} )};const res={setHeader(){},end(text){this.text=text;}};await handler(req,res);return {status:res.statusCode,data:res.text?.startsWith('{')?JSON.parse(res.text):res.text};}
 return {request,calls,transactions,rows:()=>rows};
}
const preview={action:'preview',invoice_ids:'999',capture_sha256:'a'.repeat(64)};
test('only exact staging project, origin, database metadata and current admin MFA are accepted',async()=>{
 for(const options of [{env:{VERCEL_PROJECT_ID:'other'}},{live:{ok:false}},{live:{session:{role:'finance',mfa_verified:true,org_id:CATCHUP_TARGET.org}}},{identity:{triggers:1}},{identity:{rules:1}}]){
  const h=harness(options),r=await h.request(preview);assert.ok(r.status>=400);assert.equal(h.calls.length,0);assert.equal(h.transactions.length,0);
 }
 const h=harness();assert.equal((await h.request(preview,{origin:'https://other.invalid'})).status,403);
});
test('preview refreshes only selected provider records via GET, matches customer and never writes',async()=>{
 const h=harness(),r=await h.request(preview);assert.equal(r.status,200);assert.deepEqual(r.data.counts,{confirmed:1,ambiguous:0,unmatched:47});assert.equal(h.transactions.length,0);assert.equal(h.calls.length,3);assert.ok(h.calls.every(c=>c.method==='GET'));assert.doesNotMatch(JSON.stringify(r.data),/never-exposed|Bearer fixture|fixture.invalid/);
});
test('apply updates confirmed commerce balances plus audit atomically; replay adds nothing',async()=>{
 const h=harness(),p=await h.request(preview),a=await h.request({...preview,action:'apply',confirm:'APPLY_CONFIRMED_QBO_BALANCES',baseline_sha256:p.data.baseline_sha256});
 assert.equal(a.status,200);assert.equal(a.data.updated,1);assert.equal(h.rows()[0].data.financial_status,'unpaid');assert.equal(h.rows()[0].data.total_outstanding,120);assert.equal(h.transactions.length,1);
 const sql=h.transactions[0].map(c=>c.query).join('\n');assert.match(sql,/LOCK TABLE/);assert.match(sql,/profile|profiles/);assert.match(sql,/u.data=p.before/);assert.match(sql,/all|COUNT/);assert.doesNotMatch(sql,/tbl='(invoices|payments|inventory|outbox)'/);
 const replay=await h.request({...preview,action:'apply',confirm:'APPLY_CONFIRMED_QBO_BALANCES',baseline_sha256:p.data.baseline_sha256});assert.equal(replay.data.updated,0);assert.equal(h.transactions.length,1);assert.ok(h.calls.every(c=>c.method==='GET'));
});
test('stale baseline, invalid body, wrong company and races cannot apply',async()=>{
 const h=harness();assert.equal((await h.request({...preview,action:'apply',confirm:'APPLY_CONFIRMED_QBO_BALANCES',baseline_sha256:'b'.repeat(64)})).status,409);assert.equal(h.transactions.length,0);
 assert.equal((await h.request({...preview,invoice_ids:'999,999'})).status,400);
 const wrong=harness({wrongCompany:true});assert.equal((await wrong.request(preview)).status,409);assert.equal(wrong.transactions.length,0);
 const race=harness({race:true}),p=await race.request(preview),a=await race.request({...preview,action:'apply',confirm:'APPLY_CONFIRMED_QBO_BALANCES',baseline_sha256:p.data.baseline_sha256});assert.equal(a.status,409);assert.equal(race.rows()[0].data.financial_status,'paid');
});
