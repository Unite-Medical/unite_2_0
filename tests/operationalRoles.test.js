import test from 'node:test';
import assert from 'node:assert/strict';
import {canEnterOrders,canPreparePurchases,canUseOrderAction,orderWorkspacePath,purchaseWorkspacePath} from '../src/lib/operationalAccess.js';
import {ownsOperationalCustomer,operationalCustomerScope} from '../api/_lib/operationalScope.js';
import {createOrderWorkspaceHandler,operationalRecord} from '../api/staff/order-workspace.js';
import {createOrderDraftHandler} from '../api/admin/order-drafts.js';
import {quoteCustomerContext} from '../api/_lib/quoteCustomerContext.js';
import {staffShortcuts} from '../src/lib/staffWorkspace.js';
const sales={user_id:'sales-1',email:'rep@example.test',role:'sales'};
const res=()=>({setHeader(){},end(value){this.body=JSON.parse(value);}});
const req=(method='GET',query={},body)=>({method,url:'/?'+new URLSearchParams(query),query,headers:{host:'localhost',origin:'https://localhost','content-type':'application/json'},body});
const authorized=session=>async(_req,_sql,{roles})=>roles.includes(session?.role)?{ok:true,session}:{ok:false,reason:session?'forbidden':'authentication_required'};
for(const role of ['admin','sales','sales_manager'])test(role+' can enter orders and prepare purchase drafts without admin escalation',()=>{
 const session={role};assert.equal(canEnterOrders(session),true);assert.equal(canPreparePurchases(session),true);
 for(const action of ['preview','save','submit'])assert.equal(canUseOrderAction(session,action),true);
});
for(const role of ['finance','warehouse_operator','warehouse_manager','customer','customer_service','sourcing','unassigned',undefined])test(String(role)+' does not acquire sales/order capabilities',()=>{assert.equal(canEnterOrders({role}),false);assert.equal(canPreparePurchases({role}),false);assert.equal(canUseOrderAction({role},'submit'),false);});
test('Sales accounting controls stay denied and its landing paths stay out of admin queues',()=>{
 for(const action of ['accounting_choices','save_accounting_mappings','sync_accounting','delete','approve'])assert.equal(canUseOrderAction(sales,action),false);
 assert.equal(orderWorkspacePath(sales),'/sales/orders');assert.equal(purchaseWorkspacePath(sales),'/sales/purchase-orders');assert.equal(orderWorkspacePath({role:'admin'}),'/admin/orders');
 const links=staffShortcuts('sales',{inquiries:true,customerDirectory:true});for(const route of ['/sales/orders','/sales/orders/new','/sales/purchase-orders'])assert.ok(links.some(l=>l.path===route));
 assert.equal(links.some(l=>/finance|team|integrations|refund/.test(l.path)),false);
});
test('assignment matching uses verified IDs/emails, never display names or fuzzy identity',()=>{
 assert.equal(ownsOperationalCustomer({id:'c',account_rep:'REP@example.test'},sales),true);
 assert.equal(ownsOperationalCustomer({id:'c',account_rep:'Rep Display Name'},sales),false);
 assert.equal(ownsOperationalCustomer({id:'c'},sales),false);
 assert.equal(ownsOperationalCustomer({id:'c',organization_id:'o'},sales,[{id:'o',account_owner_id:sales.user_id}]),true);
 assert.equal(ownsOperationalCustomer({id:'c',organization_id:'other'},sales,[{id:'o',account_owner_id:sales.user_id}]),false);
});
test('ordinary Sales scope remains assigned and admin does not require roster scans',async()=>{
 let calls=0;const sql=async()=>{calls++;return [{tbl:'commerce_customers',data:{id:'a',account_rep:sales.email}},{tbl:'commerce_customers',data:{id:'b',account_rep:'other@example.test'}}];};
 assert.deepEqual(await operationalCustomerScope(sql,sales,req(),{}),['a']);assert.equal(await operationalCustomerScope(sql,{role:'admin'},req(),{}),null);assert.equal(calls,1);
});
test('operational read handler rejects mutations and denied roles before reading business records',async()=>{
 let reads=0;for(const session of [null,{role:'customer'},{role:'finance'},{role:'warehouse_operator'}]){
  const handler=createOrderWorkspaceHandler({getSql:()=>({}),authorize:authorized(session),read:async()=>{reads++;},scopeFor:async()=>[]});const out=res();await handler(req('GET',{kind:'customers'}),out);assert.equal(out.statusCode,session?403:401);
 }
 const out=res();await createOrderWorkspaceHandler()(req('POST'),out);assert.equal(out.statusCode,405);assert.equal(reads,0);
});
test('operational reads bind server customer scope and redact private provider/source fields',async()=>{
 const handler=createOrderWorkspaceHandler({getSql:()=>({}),authorize:authorized(sales),scopeFor:async()=>['a'],read:async(_sql,q)=>{assert.deepEqual(q.allowed_customer_ids,['a']);return {rows:[{id:'a',name:'Synthetic customer',source:{private:true},bank_details:'private',password:'private',addresses:[{id:'addr',address1:'1 Example',secret:'private'}]}],total:1};}});
 const out=res();await handler(req('GET',{kind:'customers',allowed_customer_ids:'forged'}),out);assert.equal(out.statusCode,200);assert.equal(JSON.stringify(out.body).includes('private'),false);
 const hidden=operationalRecord('orders',{id:'o',historical:true,financial_status:'paid',payment_status:'paid',source:{private:true},lines:[{id:'i',sku:'X',token:'private'}]});assert.equal(hidden.source,undefined);assert.equal(JSON.stringify(hidden).includes('private'),false);assert.notEqual(hidden.payment_status,'paid');
});
test('Sales cannot request whole pricing configurations and missing scoped ID stays unavailable',async()=>{
 let reads=0;const handler=createOrderWorkspaceHandler({getSql:()=>({}),authorize:authorized(sales),scopeFor:async()=>[],read:async()=>{reads++;return null;}});
 let out=res();await handler(req('GET',{kind:'pricing'}),out);assert.equal(out.statusCode,403);assert.equal(reads,0);
 out=res();await handler(req('GET',{kind:'customers',id:'other'}),out);assert.equal(out.statusCode,404);
});
test('order endpoint rejects denied roles and Sales accounting requests without writes/provider calls',async()=>{
 let calls=0;const sql=async()=>{calls++;return [];};
 for(const session of [null,{role:'customer'},{role:'finance'},{role:'warehouse_operator'}]){
  const handler=createOrderDraftHandler({getSql:()=>sql,authorize:authorized(session),scopeFor:async()=>null});const out=res();await handler(req('POST',{},{}),out);assert.equal(out.statusCode,session?403:401);
 }
 const handler=createOrderDraftHandler({getSql:()=>sql,authorize:authorized(sales),scopeFor:async()=>[]});
 for(const action of ['sync_accounting','save_accounting_mappings','accounting_choices']){const out=res();await handler(req('POST',{}, {action}),out);assert.equal(out.statusCode,403);}
 assert.equal(calls,0);
});
test('order draft/customer history cannot cross assignment scope',async()=>{
 let reads=0;const sql=async()=>{reads++;return [{data:{id:'draft',customer_id:'other'}}];};
 const handler=createOrderDraftHandler({getSql:()=>sql,authorize:authorized(sales),scopeFor:async()=>['mine']});
 let out=res();await handler(req('GET',{customer_id:'other'}),out);assert.equal(out.statusCode,404);assert.equal(reads,0);
 out=res();await handler(req('GET',{id:'draft'}),out);assert.equal(out.statusCode,404);assert.equal(reads,1);
});
test('quote context retains exact account mapping and blocks guessing/ambiguous imports',()=>{
 const organizations=[{id:'org',name:'Clinic',status:'active',commerce_customer_id:'c',contact_email:'buyer@example.test'}];
 assert.equal(quoteCustomerContext('org',organizations).customer_id,'org');assert.equal(quoteCustomerContext('c',organizations,[{id:'c'}]).customer_id,'org');
 assert.equal(quoteCustomerContext('c',[{id:'other',status:'active',name:'Clinic',contact_email:'buyer@example.test'}],[{id:'c',name:'Clinic',email:'buyer@example.test'}]).status,'mapping_needed');
 assert.equal(quoteCustomerContext('c',[...organizations,{...organizations[0],id:'org2'}],[{id:'c'}]).status,'ambiguous');assert.equal(quoteCustomerContext('missing',organizations).status,'unavailable');
});
function orderDatabase(){
 const rows=new Map(),writes=[];
 const customer={id:'customer-a',name:'Synthetic Clinic',status:'active',email:'buyer@example.test',tax_exempt:true,price_lists:[],terms:'due_on_receipt'};
 const product={id:'product-a',sku:'QA-ONE',name:'Synthetic product',variant_id:'variant-a',status:'active',retail:10,cost:null};
 rows.set('commerce_customers:customer-a',customer);rows.set('commerce_products:product-a',product);
 const sql=async(strings,...v)=>{const q=strings.join('?');
  if(q.startsWith('SELECT data FROM um_rows WHERE tbl='))return rows.has(v[0]+':'+v[1])?[{data:rows.get(v[0]+':'+v[1])}]:[];
  if(q.startsWith("INSERT INTO um_rows(tbl,id,data) VALUES('commerce_orders'")){const key='commerce_orders:'+v[0];if(rows.has(key))return [];rows.set(key,JSON.parse(v[1]));writes.push('commerce_orders');return [{id:v[0]}];}
  if(q.startsWith('INSERT INTO um_rows(tbl,id,data) SELECT')){const [table,id,json,sourceId,nonce]=v;if(rows.get('commerce_orders:'+sourceId)?.submission_nonce!==nonce)return [];rows.set(table+':'+id,JSON.parse(json));writes.push(table);return [];}
  throw Error('Unexpected synthetic SQL: '+q);
 };
 sql.transaction=async callback=>Promise.all(callback(sql));return {sql,rows,writes,customer,product};
}
const draftInput=()=>({id:'11111111-1111-4111-8111-111111111111',customer_id:'customer-a',lines:[{id:'line-a',product_id:'product-a',quantity:2}],shipping:0,shipping_kind:'pickup',shipping_note:'Synthetic local pickup',shipping_confirmed:true,tax_confirmed:true,tax:0,payment_method:'due_on_receipt',shipping_address:{recipient:'Synthetic Buyer',address1:'1 Example Road',city:'Test City',zip:'10001',country:'US'}});
test('Sales preview/save never invoke accounting or create an operational order',async()=>{
 const db=orderDatabase();let syncs=0;const handler=createOrderDraftHandler({getSql:()=>db.sql,authorize:authorized(sales),scopeFor:async()=>['customer-a'],syncAccounting:async()=>{syncs++;}});
 for(const action of ['preview','save']){const out=res();await handler(req('POST',{}, {action,id:draftInput().id,revision:0,draft:draftInput()}),out);assert.equal(out.statusCode,200);assert.equal(out.body.data.total,20);assert.deepEqual(out.body.issues,[]);}
 assert.deepEqual(db.writes,['commerce_orders']);assert.equal(syncs,0);
});
test('Sales final creation is unpaid, records one accounting job and calls injected sync once; replay is harmless',async()=>{
 const db=orderDatabase();let syncs=0;const handler=createOrderDraftHandler({getSql:()=>db.sql,authorize:authorized(sales),scopeFor:async()=>['customer-a'],syncAccounting:async(_sql,id)=>{syncs++;return {status:'synthetic_only',order_id:id};}});
 const input={action:'submit',id:draftInput().id,revision:0,draft:draftInput()};let out=res();await handler(req('POST',{},input),out);assert.equal(out.statusCode,201);assert.equal(out.body.operational.payment_status,'unpaid');assert.equal(out.body.data.draft,false);
 const invoice=[...db.rows.entries()].find(([key])=>key.startsWith('invoices:'))[1];assert.equal(invoice.balance,20);assert.equal(invoice.paid_amount,0);assert.equal(syncs,1);assert.equal(db.writes.filter(t=>t==='accounting_jobs').length,1);assert.equal(db.writes.some(t=>['inventory','shipments','notification_outbox','payments'].includes(t)),false);
 const count=db.writes.length;out=res();await handler(req('POST',{},input),out);assert.equal(out.body.duplicate,true);assert.equal(syncs,1);assert.equal(db.writes.length,count);
});
test('Sales cannot save a customer outside scope or skip shipping/tax and price authority checks',async()=>{
 const db=orderDatabase();let syncs=0;const handler=createOrderDraftHandler({getSql:()=>db.sql,authorize:authorized(sales),scopeFor:async()=>[],syncAccounting:async()=>{syncs++;}});
 let out=res();await handler(req('POST',{}, {action:'submit',id:draftInput().id,draft:draftInput()}),out);assert.equal(out.statusCode,404);assert.equal(db.writes.length,0);
 const scoped=createOrderDraftHandler({getSql:()=>db.sql,authorize:authorized(sales),scopeFor:async()=>['customer-a'],syncAccounting:async()=>{syncs++;}});
 for(const patch of [{shipping_confirmed:false},{tax_confirmed:false},{lines:[{id:'line-a',product_id:'product-a',quantity:2,manual_price:true,unit_price:3}]}]){const d={...draftInput(),...patch};if('tax_confirmed'in patch)db.customer.tax_exempt=false;out=res();await scoped(req('POST',{}, {action:'submit',id:d.id,revision:0,draft:d}),out);assert.equal(out.statusCode,400);}
 assert.equal(db.writes.length,0);assert.equal(syncs,0);
});
test('a blank draft remains available only to its creator when no customer has been chosen',async()=>{
 const {draftInScope}=await import('../api/_lib/operationalScope.js');
 assert.equal(draftInScope([],{draft:true,customer_id:'',created_by:sales.user_id},sales),true);
 assert.equal(draftInScope([],{draft:true,customer_id:'',created_by:'someone-else'},sales),false);
 assert.equal(draftInScope([],{draft:true,customer_id:'other-customer',created_by:sales.user_id},sales),false);
});
