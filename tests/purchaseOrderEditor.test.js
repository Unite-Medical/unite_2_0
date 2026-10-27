import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePurchaseEditorDraft,purchaseEditorIssues,supplierEditorDraft,supplierEditorView,warehouseEditorView,productEditorView,purchaseEditorView,purchaseEditorFingerprint,requestIdentity,purchaseEditorRelated,purchaseEditorCatalog} from '../api/_lib/purchaseOrderEditor.js';
import {planPurchaseOrderAction} from '../api/vendor/purchase-orders/action.js';
import {planPurchaseOrderReceipt} from '../api/wms/receive.js';
import {createPurchaseOrderEditorHandler} from '../api/admin/purchase-order-editor.js';
const now=new Date('2026-10-26T21:00:00Z');
const actor={user_id:'qa-admin',role:'admin',email:'admin@example.test'};
const vendor={id:'vnd_11111111-1111-4111-8111-111111111111',name:'Synthetic supplier',contact_email:'supplier@example.test',status:'approved'};
const warehouse={id:'wh_test',name:'Synthetic receiving warehouse',address:{address1:'1 Fixture Road',city:'Test',province:'NY',zip:'10001',country:'US'}};
const product={id:'p1',catalog_table:'commerce_products',sku:'QA-ONE',name:'Synthetic gloves',variant:'Case / 100',status:'active',cost:null};
const ship_to={recipient:'QA receiving',address1:'1 Fixture Road',city:'Test',province:'NY',zip:'10001',country:'US'};
const input={id:'po_22222222-2222-4222-8222-222222222222',vendor_id:vendor.id,warehouse_id:warehouse.id,ship_to,line_items:[{id:'33333333-3333-4333-8333-333333333333',product_id:'p1',catalog_table:'commerce_products',sku:'FORGED',name:'FORGED',supplier_sku:'SUP-ONE',qty:'6',cost:'12.34'}],reference:'Supplier quote Q123',notes:'Supplier-visible packing note',payment_terms:'Net 30',expected_delivery:'2026-11-02'};
const related={vendor,warehouse,products:[product]};
const normalize=(patch={},extra={})=>normalizePurchaseEditorDraft({input:{...input,...patch},...related,actor,now,...extra});

test('PO values use authoritative catalog identity but supplier-specific quoted cost',()=>{
 const po=normalize();assert.equal(po.line_items[0].sku,'QA-ONE');assert.equal(po.line_items[0].name,product.name);assert.equal(po.line_items[0].id,input.line_items[0].id);assert.equal(po.line_items[0].supplier_sku,'SUP-ONE');assert.equal(po.total_cost,74.04);assert.equal(po.known_subtotal,74.04);assert.equal(product.cost,null);
 assert.equal(po.status,'draft');assert.equal(po.vendor_id,vendor.id);assert.equal(po.warehouse_id,warehouse.id);assert.equal(po.wms_po_id,po.id);assert.equal(po.receiving_revision,0);assert.equal(po.line_items[0].received_qty,0);assert.equal(po.line_items[0].accepted_qty,0);assert.equal(po.line_items[0].billed_qty,0);assert.equal(po.reference,input.reference);assert.equal(po.payment_terms,input.payment_terms);assert.equal(po.notes,input.notes);assert.deepEqual(purchaseEditorIssues(po,related),[]);
});
test('partial drafts retain unknown amounts as null, without a fabricated total',()=>{
 const po=normalize({line_items:[{...input.line_items[0],qty:'',cost:''}]});assert.equal(po.line_items[0].qty,null);assert.equal(po.line_items[0].cost,null);assert.equal(po.total_cost,null);assert.equal(po.known_subtotal,0);assert.equal(po.total_cost_confirmed,false);assert.match(purchaseEditorIssues(po,related).join(' '),/quantity.*cost/);
 const empty=normalize({vendor_id:'',warehouse_id:'',line_items:[],ship_to:{}},{vendor:null,warehouse:null});assert.equal(empty.total_cost,null);assert.match(purchaseEditorIssues(empty,{}).join(' '),/supplier.*warehouse.*address.*product/);
});
test('explicit zero supplier cost is valid and is distinct from missing cost',()=>{
 const po=normalize({line_items:[{...input.line_items[0],cost:0}]});assert.equal(po.total_cost,0);assert.equal(po.total_cost_confirmed,true);assert.deepEqual(purchaseEditorIssues(po,related),[]);
});
test('quantities, costs, dates and duplicate lines reject invalid values',()=>{
 for(const qty of [0,-1,1.5,'oops',Infinity])assert.throws(()=>normalize({line_items:[{...input.line_items[0],qty}]}),/quantity/);
 for(const cost of [-1,'oops',Infinity])assert.throws(()=>normalize({line_items:[{...input.line_items[0],cost}]}),/unit cost/);
 for(const expected_delivery of ['2026-02-30','tomorrow'])assert.throws(()=>normalize({expected_delivery}),/date/);
 assert.throws(()=>normalize({line_items:[input.line_items[0],{...input.line_items[0]}]}),/Duplicate line/);
 assert.throws(()=>normalize({line_items:[input.line_items[0],{...input.line_items[0],id:'44444444-4444-4444-8444-444444444444'}]}),/SKU is already/);
});
test('inactive or missing reference records cannot be substituted',()=>{
 assert.throws(()=>normalize({}, {vendor:{...vendor,id:'wrong'}}),/supplier.*unavailable/);
 assert.throws(()=>normalize({}, {warehouse:{...warehouse,id:'wrong'}}),/warehouse.*unavailable/);
 assert.throws(()=>normalize({}, {products:[{...product,status:'archived'}]}),/product.*active/);
 assert.throws(()=>normalize({line_items:[{...input.line_items[0],product_id:'unknown'}]}),/product.*active/);
});
test('only an untouched manual draft may be edited; existing receiving evidence is never reset',()=>{
 const po=normalize();
 for(const existing of [{...po,status:'sent'},{...po,status:'approved'},{...po,source:'qbo_import'},{...po,line_items:[{...po.line_items[0],received_qty:1}]},{...po,line_items:[{...po.line_items[0],accepted_qty:1}]},{...po,line_items:[{...po.line_items[0],billed_qty:1}]}])assert.throws(()=>normalize({}, {existing}),/read-only/);
 const next=normalize({notes:'Changed'},{existing:po});assert.equal(next.id,po.id);assert.equal(next.doc_number,po.doc_number);assert.equal(next.revision,2);assert.equal(next.created_at,po.created_at);
});
test('readiness uses current supplier approval, warehouse and catalog values',()=>{
 const po=normalize();assert.match(purchaseEditorIssues(po,{...related,vendor:{...vendor,status:'pending'}}).join(' '),/supplier needs approval/);assert.match(purchaseEditorIssues(po,{...related,warehouse:{...warehouse,status:'archived'}}).join(' '),/warehouse/);assert.match(purchaseEditorIssues(po,{...related,products:[{...product,sku:'changed'}]}).join(' '),/catalog match/);
 const rejected=planPurchaseOrderAction(po,{action:'approve',actorId:actor.user_id,now},{editor:{...related,vendor:{...vendor,status:'pending'}}});assert.equal(rejected.ok,false);assert.equal(rejected.reason,'purchase_order_review_required');
 const approved=planPurchaseOrderAction(po,{action:'approve',actorId:actor.user_id,now},{editor:related});assert.equal(approved.purchase_order.status,'approved');assert.equal(approved.purchase_order.line_items[0].received_qty,0);
 assert.equal(planPurchaseOrderAction({id:'legacy',status:'draft',revision:1},{action:'approve',actorId:actor.user_id,now}).ok,true);
});
test('supplier creation is pending business metadata, with no account/permission creation',()=>{
 const value=supplierEditorDraft({...vendor,status:'approved',password:'not-a-credential',role:'admin',contact_email:'Supplier@Example.Test',address:ship_to},actor,now);assert.equal(value.status,'pending');assert.equal(value.contact_email,'supplier@example.test');assert.equal(value.role,undefined);assert.equal(value.password,undefined);assert.equal(value.created_by,actor.user_id);assert.equal(value.revision,1);
 assert.throws(()=>supplierEditorDraft({...vendor,name:''},actor,now),/company name/);assert.throws(()=>supplierEditorDraft({...vendor,contact_email:'bad email'},actor,now),/email/);assert.throws(()=>supplierEditorDraft({...vendor,id:'existing-random'},actor,now),/Reload/);
});
test('read projections remove credentials/tokens/bank fields and never invent a warehouse address',()=>{
 assert.equal(supplierEditorView({...vendor,bank_account:'private',password:'private'}).bank_account,undefined);
 assert.equal(purchaseEditorView({...normalize(),vendor_review_token:'secret',last_save_fingerprint:'internal'}).vendor_review_token,undefined);
 assert.equal(warehouseEditorView({id:'wh',name:'Unknown address'}).ship_to.address1,'');assert.equal(warehouseEditorView(warehouse).ship_to.address1,ship_to.address1);
 assert.equal(productEditorView({...product,cost:null}).cost,null);assert.equal(productEditorView({...product,cost:0}).cost,0);assert.equal(productEditorView({...product,cost:null,retail:99}).cost,null);
});
test('fingerprints are stable across object key order and bind changed order data',()=>{
 assert.equal(purchaseEditorFingerprint({a:1,b:2}),purchaseEditorFingerprint({b:2,a:1}));assert.notEqual(purchaseEditorFingerprint(input),purchaseEditorFingerprint({...input,notes:'different'}));assert.equal(requestIdentity('save-request-123'),'save-request-123');assert.throws(()=>requestIdentity('bad'));
});

function responseRecorder(){return {statusCode:0,headers:{},setHeader(key,value){this.headers[key]=value;},end(body){this.body=JSON.parse(body);}};}
const req=(method='GET',query={},body)=>({method,url:'/?'+new URLSearchParams(query),query,headers:{host:'staging.example.test',origin:'https://staging.example.test','content-type':'application/json'},body});
const allowed=async()=>({ok:true,session:actor});
test('endpoint enforces live operational authorization and same-origin writes before data changes',async()=>{
 let transactions=0;const sql=async()=>{throw new Error('No read expected.');};sql.transaction=async()=>{transactions++;};
 const denied=createPurchaseOrderEditorHandler({getSql:()=>sql,authorize:async(_req,_sql,options)=>{assert.deepEqual(options.roles,['admin','sales','sales_manager']);return {ok:false,reason:'forbidden'};}});let res=responseRecorder();await denied(req('POST',{},{}),res);assert.equal(res.statusCode,403);assert.equal(transactions,0);
 const handler=createPurchaseOrderEditorHandler({getSql:()=>sql,authorize:allowed});const bad=req('POST',{},{});bad.headers.origin='https://other.example.test';res=responseRecorder();await handler(bad,res);assert.equal(res.statusCode,403);assert.equal(transactions,0);
});
test('exact supplier lookup is not confused with a PO ID and bypasses list truncation',async()=>{
 const all=Array.from({length:60},(_,index)=>({data:{id:'supplier-'+index,name:'Supplier '+index,status:'pending',contact_email:'vendor@example.test',password:'never expose'}}));
 const sql=async(strings)=>{assert.match(strings.join(''),/tbl='vendors'/);return all;};const handler=createPurchaseOrderEditorHandler({getSql:()=>sql,authorize:allowed});const res=responseRecorder();await handler(req('GET',{kind:'suppliers',id:'supplier-59'}),res);assert.equal(res.statusCode,200);assert.equal(res.body.data.rows.length,1);assert.equal(res.body.data.rows[0].id,'supplier-59');assert.equal(res.body.data.rows[0].password,undefined);
});
test('commerce catalog is authoritative when present, including internal active products',async()=>{
 const sql=async()=>[{tbl:'commerce_products',data:{id:'internal',sku:'INTERNAL',name:'Internal procurement',status:'active',cost:null}},{tbl:'products',data:{id:'old',sku:'OLD',name:'Retired fallback',cost:10}}];const products=await purchaseEditorCatalog(sql);assert.deepEqual(products.map(p=>p.id),['internal']);assert.equal(products[0].cost,null);
 const fallback=await purchaseEditorCatalog(async()=>[{tbl:'products',data:{id:'old',sku:'OLD',name:'Legacy',unit_cost:10}}]);assert.equal(fallback[0].catalog_table,'products');assert.equal(fallback[0].cost,10);
});
test('same successful save request replays without another write, changed replay conflicts',async()=>{
 const po=normalize(),requestId='save-request-123';const stored={...po,last_save_request_id:requestId,last_save_fingerprint:purchaseEditorFingerprint(input)};let transactions=0;
 const sql=async(strings,...values)=>{
  const query=strings.join('');if(query.includes("tbl IN ('commerce_products','products')"))return [{tbl:'commerce_products',data:product}];
  if(query.includes("tbl='vendors'"))return [{data:vendor}];if(query.includes("tbl='warehouses'"))return [{data:warehouse}];if(values[0]==='purchase_orders')return [{data:stored}];throw new Error('Unexpected read');
 };sql.transaction=async()=>{transactions++;throw new Error('No write expected');};
 const handler=createPurchaseOrderEditorHandler({getSql:()=>sql,authorize:allowed,now:()=>now});let res=responseRecorder();await handler(req('POST',{}, {action:'save_draft',draft:input,revision:0,request_id:requestId}),res);assert.equal(res.statusCode,200);assert.equal(res.body.duplicate,true);assert.equal(transactions,0);
 res=responseRecorder();await handler(req('POST',{}, {action:'save_draft',draft:{...input,notes:'changed'},revision:0,request_id:requestId}),res);assert.equal(res.statusCode,409);assert.equal(transactions,0);
});
test('stale draft revision fails before starting a transaction',async()=>{
 const po=normalize();let transactions=0;const sql=async()=>[{data:po}];sql.transaction=async()=>{transactions++;};const handler=createPurchaseOrderEditorHandler({getSql:()=>sql,authorize:allowed});const res=responseRecorder();await handler(req('POST',{}, {action:'save_draft',draft:input,revision:0,request_id:'stale-request-123'}),res);assert.equal(res.statusCode,409);assert.equal(transactions,0);
});
test('missing current related records remain missing rather than falling back to staging defaults',async()=>{
 const related=await purchaseEditorRelated(async()=>[],{vendor_id:'not-found',warehouse_id:'not-found'});assert.equal(related.vendor,null);assert.equal(related.warehouse,null);assert.deepEqual(related.products,[]);
});
test('currency and total mismatches cannot be silently accepted for approval',()=>{
 assert.throws(()=>normalize({currency:'EUR'}),/USD only/);
 const po=normalize();assert.match(purchaseEditorIssues({...po,total_cost:1},related).join(' '),/total before approval/);
 assert.throws(()=>normalize({}, {existing:{...po,line_items:[{...po.line_items[0],received_qty:-1}]}}),/read-only/);
});
function captureDatabase({supplierInsert=true}={}){
 const commands=[];
 const sql=async(strings,...values)=>{
  const query=strings.join('');
  if(query.includes("tbl IN ('commerce_products','products')"))return [{tbl:'commerce_products',data:product}];
  if(query.includes("tbl='vendors'")&&query.includes("name_key"))return [{data:vendor}];
  if(query.includes("tbl='vendors'")&&values[0]===vendor.id)return [{data:vendor}];
  if(query.includes("tbl='warehouses'")&&values[0]===warehouse.id)return [{data:warehouse}];
  return [];
 };
 sql.transaction=async builder=>{
  const queries=builder((strings,...values)=>({query:strings.join('?'),values}));commands.push(...queries);
  return queries.map(({query,values})=>{
   if(query.includes("SELECT 'vendors'"))return supplierInsert?[{data:JSON.parse(values[1])}]:[];
   if(query.includes("VALUES('purchase_orders'"))return [{data:JSON.parse(values[1])}];
   return [];
  });
 };
 return {sql,commands};
}
test('saving a new PO writes only its draft and audit, without finance, messaging or stock work',async()=>{
 const db=captureDatabase(),handler=createPurchaseOrderEditorHandler({getSql:()=>db.sql,authorize:allowed,now:()=>now}),res=responseRecorder();
 await handler(req('POST',{}, {action:'save_draft',draft:input,revision:0,request_id:'new-draft-request-123'}),res);
 assert.equal(res.statusCode,201);assert.equal(res.body.read_only,false);assert.equal(res.body.data.status,'draft');assert.equal(res.body.data.total_cost,74.04);assert.deepEqual(res.body.issues,[]);assert.equal(db.commands.length,2);
 assert.match(db.commands[0].query,/VALUES\('purchase_orders'/);assert.match(db.commands[1].query,/SELECT 'audit_log'/);
 assert.doesNotMatch(db.commands.map(command=>command.query).join(' '),/outbox|invoices|payments|stock_movements|service_credentials/);
 const saved=JSON.parse(db.commands[0].values[1]);assert.equal(saved.last_save_request_id,'new-draft-request-123');assert.equal(saved.line_items[0].id,input.line_items[0].id);assert.equal(saved.line_items[0].received_qty,0);
});
test('new supplier creation serializes duplicate names and writes only pending vendor plus audit',async()=>{
 const db=captureDatabase(),handler=createPurchaseOrderEditorHandler({getSql:()=>db.sql,authorize:allowed,now:()=>now}),res=responseRecorder();
 const supplier={...vendor,id:'vnd_55555555-5555-4555-8555-555555555555',status:'approved',role:'admin'};
 await handler(req('POST',{}, {action:'save_supplier',supplier,request_id:'new-supplier-request-123'}),res);
 assert.equal(res.statusCode,201);assert.equal(res.body.data.status,'pending');assert.equal(res.body.data.role,undefined);assert.equal(db.commands.length,3);assert.match(db.commands[0].query,/pg_advisory_xact_lock/);assert.match(db.commands[1].query,/NOT EXISTS.*name_key/);assert.match(db.commands[2].query,/SELECT 'audit_log'/);
 const stored=JSON.parse(db.commands[1].values[1]);assert.equal(stored.status,'pending');assert.equal(stored.created_by,actor.user_id);assert.equal(stored.name_key,'synthetic supplier');assert.equal(stored.role,undefined);
 const conflictDb=captureDatabase({supplierInsert:false}),conflictHandler=createPurchaseOrderEditorHandler({getSql:()=>conflictDb.sql,authorize:allowed,now:()=>now}),conflict=responseRecorder();await conflictHandler(req('POST',{}, {action:'save_supplier',supplier,request_id:'other-supplier-request-123'}),conflict);assert.equal(conflict.statusCode,409);assert.equal(conflict.body.existing_id,vendor.id);
});


test('new composer PO preserves partial receiving and stable line identity in existing warehouse planner',()=>{
 const po=normalize();
 const body={warehouse_id:warehouse.id,ref_type:'purchase_order',ref_id:po.id,idempotency_key:'synthetic_receipt_123',lines:[{sku:product.sku,qty:2,lot_number:'SYNTHETIC-LOT',expiration_date:'2029-01-31',capture_method:'scan'}]};
 const receiver={user_id:'synthetic-warehouse',role:'warehouse_operator'};
 assert.equal(planPurchaseOrderReceipt({po,products:[product],body,session:receiver,now}).reason,'po_not_receivable');
 const plan=planPurchaseOrderReceipt({po:{...po,status:'sent'},products:[product],body,session:receiver,now});
 assert.equal(plan.ok,true,plan.reason);
 assert.equal(plan.updated_po.status,'partial');
 assert.equal(plan.updated_po.line_items[0].id,po.line_items[0].id);
 assert.equal(plan.updated_po.line_items[0].accepted_qty,2);
 assert.equal(plan.updated_po.line_items[0].vendor_backorder_qty,4);
 assert.equal(plan.updated_po.line_items[0].billed_qty,0);
 assert.equal(plan.updated_po.warehouse_id,warehouse.id);
 assert.equal(plan.updated_po.received_at,null);
});
test('Sales saves a PO draft and pending supplier without approval, receipt, accounting or email effects',async()=>{
 const salesActor={user_id:'qa-sales',email:'sales@example.test',role:'sales'},authorize=async(_req,_sql,{roles})=>({ok:roles.includes(salesActor.role),session:salesActor});
 const db=captureDatabase(),handler=createPurchaseOrderEditorHandler({getSql:()=>db.sql,authorize,now:()=>now}),out=responseRecorder();
 await handler(req('POST',{}, {action:'save_draft',draft:input,revision:0,request_id:'sales-save-request-123'}),out);assert.equal(out.statusCode,201);assert.equal(out.body.data.status,'draft');assert.equal(out.body.data.created_by,salesActor.user_id);
 const rejected=responseRecorder();await handler(req('POST',{}, {action:'approve',draft:input,revision:0,request_id:'sales-approve-request-123'}),rejected);assert.equal(rejected.statusCode,400);
});
