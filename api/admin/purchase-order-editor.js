import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {PurchaseEditorError,requestIdentity,supplierEditorDraft,supplierEditorView,warehouseEditorView,purchaseEditorView,purchaseEditorCatalog,purchaseEditorRelated,purchaseEditorIssues,normalizePurchaseEditorDraft,isPurchaseEditorEditable,purchaseEditorFingerprint,purchaseEditorAuditId,supplierCanonicalName} from '../_lib/purchaseOrderEditor.js';

async function row(sql,table,id){return (await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${id} AND deleted=false`)[0]?.data||null;}
const safeList=(rows,q)=>rows.filter(item=>[item.name,item.sku,item.variant,item.contact_name,item.contact_email].join(' ').toLowerCase().includes(q)).slice(0,50);
function response(po,related,duplicate=false){return {data:purchaseEditorView(po),issues:po.source==='manual_composer'?purchaseEditorIssues(po,related):[],read_only:!isPurchaseEditorEditable(po),duplicate};}
function ensureSameOrigin(req){try{if(!req.headers.origin||new URL(req.headers.origin).host!==(req.headers['x-forwarded-host']||req.headers.host))throw new Error();}catch{throw new PurchaseEditorError('Save purchase orders from the Unite workspace.',403);}}

export function createPurchaseOrderEditorHandler({getSql=()=>process.env.DATABASE_URL?neon(process.env.DATABASE_URL):null,authorize=authorizeLiveRequest,now=()=>new Date()}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'Method not allowed.'});
  try{
   const sql=getSql();if(!sql)return sendJson(res,503,{error:'Purchase order workspace is unavailable.'});
   const live=await authorize(req,sql,{roles:['admin']});if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:'Sign in to the admin workspace.'});
   const params=new URL(req.url,'https://local').searchParams;
   if(req.method==='GET'){
    const id=String(req.query?.id||params.get('id')||'').slice(0,200),kind=String(req.query?.kind||params.get('kind')||'');
    if(id&&!kind){const po=await row(sql,'purchase_orders',id);if(!po)return sendJson(res,404,{error:'Purchase order not found.'});return sendJson(res,200,response(po,await purchaseEditorRelated(sql,po)));}
    const q=String(req.query?.q||params.get('q')||'').trim().toLowerCase().slice(0,150);
    let choices;
    if(kind==='suppliers')choices=(await sql`SELECT data FROM um_rows WHERE tbl='vendors' AND deleted=false`).map(({data})=>supplierEditorView(data));
    else if(kind==='warehouses')choices=(await sql`SELECT data FROM um_rows WHERE tbl='warehouses' AND deleted=false`).map(({data})=>data).filter(item=>item.status!=='archived'&&item.active!==false).map(warehouseEditorView);
    else if(kind==='products')choices=await purchaseEditorCatalog(sql);
    else return sendJson(res,400,{error:'Choose suppliers, warehouses or products.'});
    const filtered=choices.filter(item=>(!id||item.id===id)&&[item.name,item.sku,item.variant,item.contact_name,item.contact_email].join(' ').toLowerCase().includes(q));
    return sendJson(res,200,{data:{rows:safeList(filtered,''),total:filtered.length}});
   }
   ensureSameOrigin(req);
   if(!String(req.headers['content-type']||'').startsWith('application/json'))return sendJson(res,415,{error:'Use a JSON request.'});
   const raw=await readRawBody(req);if(raw.length>500000)return sendJson(res,413,{error:'This draft is too large.'});
   let body;try{body=JSON.parse(raw.toString('utf8'));}catch{return sendJson(res,400,{error:'The request was not valid JSON.'});}
   const requestId=requestIdentity(body.request_id),at=now(),actor=live.session;
   if(body.action==='save_supplier'){
    const supplier=supplierEditorDraft(body.supplier,actor,at),fingerprint=purchaseEditorFingerprint(body.supplier);
    const existing=await row(sql,'vendors',supplier.id);
    if(existing){
     if(existing.creation_request_id===requestId&&existing.creation_fingerprint===fingerprint)return sendJson(res,200,{data:supplierEditorView(existing),duplicate:true});
     throw new PurchaseEditorError('That supplier record already exists. Choose it from the supplier list.',409,{existing_id:existing.id});
    }
    const nameKey=supplierCanonicalName(supplier.name),saved={...supplier,name_key:nameKey,creation_request_id:requestId,creation_fingerprint:fingerprint};
    const audit={id:purchaseEditorAuditId('supplier',supplier.id,requestId),kind:'supplier.created_from_po',ref_id:supplier.id,actor_id:actor.user_id,created_at:at.toISOString(),payload:{status:'pending',request_id:requestId}};
    const result=await sql.transaction(tx=>[
     tx`SELECT pg_advisory_xact_lock(hashtext(${nameKey}))`,
     tx`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'vendors',${saved.id},${JSON.stringify(saved)}::jsonb,false,now() WHERE NOT EXISTS (SELECT 1 FROM um_rows WHERE tbl='vendors' AND deleted=false AND COALESCE(data->>'name_key',lower(regexp_replace(btrim(data->>'name'),'[[:space:]]+',' ','g')))=${nameKey}) ON CONFLICT(tbl,id) DO NOTHING RETURNING data`,
     tx`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='vendors' AND id=${saved.id} AND data->>'creation_request_id'=${requestId}) ON CONFLICT(tbl,id) DO NOTHING`,
    ]);
    if(!result[1]?.length){
     const repeated=await row(sql,'vendors',saved.id);if(repeated?.creation_request_id===requestId&&repeated.creation_fingerprint===fingerprint)return sendJson(res,200,{data:supplierEditorView(repeated),duplicate:true});
     const match=(await sql`SELECT data FROM um_rows WHERE tbl='vendors' AND deleted=false AND COALESCE(data->>'name_key',lower(regexp_replace(btrim(data->>'name'),'[[:space:]]+',' ','g')))=${nameKey} LIMIT 1`)[0]?.data;
     throw new PurchaseEditorError('A supplier with that name already exists. Select it or review its existing record.',409,match?{existing_id:match.id}:{});
    }
    return sendJson(res,201,{data:supplierEditorView(result[1][0].data),duplicate:false});
   }
   if(body.action!=='save_draft')return sendJson(res,400,{error:'Choose a supported draft action.'});
   const input=body.draft||{},id=String(input.id||''),fingerprint=purchaseEditorFingerprint(input),existing=await row(sql,'purchase_orders',id);
   if(existing?.last_save_request_id===requestId){
    if(existing.last_save_fingerprint!==fingerprint)throw new PurchaseEditorError('This save request changed. Review the draft and save again.',409);
    return sendJson(res,200,response(existing,await purchaseEditorRelated(sql,existing),true));
   }
   if(existing&&Number(body.revision)!==Number(existing.revision||1))throw new PurchaseEditorError('This purchase order changed. Reopen its current draft before saving.',409);
   if(!existing&&Number(body.revision||0)!==0)throw new PurchaseEditorError('This purchase order no longer exists. Reopen the workspace.',409);
   const related=await purchaseEditorRelated(sql,{vendor_id:input.vendor_id,warehouse_id:input.warehouse_id});
   const draft=normalizePurchaseEditorDraft({input,existing,...related,actor,now:at});
   const saved={...draft,last_save_request_id:requestId,last_save_fingerprint:fingerprint};
   const audit={id:purchaseEditorAuditId('draft',draft.id,requestId),kind:existing?'purchase_order.draft_updated':'purchase_order.draft_created',ref_id:draft.id,actor_id:actor.user_id,created_at:at.toISOString(),payload:{request_id:requestId,revision:draft.revision,total_cost:draft.total_cost,warehouse_id:draft.warehouse_id,vendor_id:draft.vendor_id}};
   const result=await sql.transaction(tx=>[
    existing?tx`UPDATE um_rows SET data=${JSON.stringify(saved)}::jsonb,updated_at=now() WHERE tbl='purchase_orders' AND id=${id} AND deleted=false AND data->>'status'='draft' AND data->>'source'='manual_composer' AND data=${JSON.stringify(existing)}::jsonb RETURNING data`:tx`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) VALUES('purchase_orders',${id},${JSON.stringify(saved)}::jsonb,false,now()) ON CONFLICT(tbl,id) DO NOTHING RETURNING data`,
    tx`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='purchase_orders' AND id=${id} AND data->>'last_save_request_id'=${requestId} AND data->>'last_save_fingerprint'=${fingerprint}) ON CONFLICT(tbl,id) DO NOTHING`,
   ]);
   if(!result[0]?.length){
    const repeated=await row(sql,'purchase_orders',id);
    if(repeated?.last_save_request_id===requestId&&repeated.last_save_fingerprint===fingerprint)return sendJson(res,200,response(repeated,await purchaseEditorRelated(sql,repeated),true));
    throw new PurchaseEditorError('This purchase order changed. Your draft edits are still here; reopen its current version before saving.',409);
   }
   return sendJson(res,existing?200:201,response(result[0][0].data,related));
  }catch(error){return sendJson(res,error instanceof PurchaseEditorError?error.status:503,{error:error instanceof PurchaseEditorError?error.message:'Purchase order workspace is unavailable. Keep your draft and try again.',...(error instanceof PurchaseEditorError?error.details:{})});}
 };
}
export default createPurchaseOrderEditorHandler();
