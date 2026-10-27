import {commercePaymentEvidence} from '../../src/lib/commercePaymentStatus.js';
import {customerDirectoryRecord} from '../account/customer-directory.js';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readCommerce} from '../_lib/commerceWorkspace.js';
import {sendJson} from '../_lib/http.js';
import {operationalCustomerScope} from '../_lib/operationalScope.js';
import {ORDER_ENTRY_ROLES} from '../../src/lib/operationalAccess.js';
// Read-only operational workspace. Mutations remain action-scoped in their own APIs.
export function operationalRecord(kind, record) {
 if(!record)return record;
 if(kind==='orders'){record=commercePaymentEvidence(record);record={...record,payment_status:record.financial_status||'payment_review_needed'};}
 const fields={customers:['id','name','company','email','phone','status','addresses','tax_exempt','terms','credit_limit','price_lists','revision'],products:['id','sku','variant_id','name','variant','retail','cost','status','revision','image','stock','pack_size','units_per_case','category','cat','images'],orders:['id','number','customer_id','customer_name','email','created_at','total','subtotal','tax','shipping','payment_status','financial_status','fulfillment_status','workflow_state','draft','historical','revision','lines','shipping_address','billing_address','payment_method','payment_terms','po_number','notes','tags','shipping_confirmed','tax_confirmed','tax_exempt','shipping_kind','shipping_name','shipping_note','discount_percent','operational_order_id','accounting_status']};
 const result=Object.fromEntries((fields[kind]||[]).filter(key=>Object.hasOwn(record,key)).map(key=>[key,record[key]]));
 if(kind==='customers')result.addresses=customerDirectoryRecord(record).addresses;
 if(kind==='orders')result.lines=(record.lines||[]).map(line=>Object.fromEntries(['id','product_id','variant_id','sku','name','variant','quantity','unit_price','requested_unit_price','manual_price','line_discount','ext_price','removed','unfulfilled_quantity','mapping_status'].filter(key=>Object.hasOwn(line,key)).map(key=>[key,line[key]])));
 return result;
}
export function createOrderWorkspaceHandler({getSql=()=>process.env.DATABASE_URL?neon(process.env.DATABASE_URL):null,authorize=authorizeLiveRequest,read=readCommerce,scopeFor=operationalCustomerScope}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store, private');
  if(req.method!=='GET')return sendJson(res,405,{error:'This workspace is read-only.'});
  try{
   const sql=getSql();if(!sql)return sendJson(res,503,{error:'Workspace unavailable.'});
   const live=await authorize(req,sql,{roles:ORDER_ENTRY_ROLES});if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:'Sign in with an order-entry role.'});
   const params=Object.fromEntries(new URL(req.url,'https://local').searchParams),query={...params,...req.query};
   if(!['customers','products','orders','pricing'].includes(query.kind))return sendJson(res,400,{error:'Choose customers, products, orders or pricing.'});
   if(live.session.role!=='admin'&&query.kind==='pricing')return sendJson(res,403,{error:'Pricing configuration is managed separately. Customer prices are applied by order preview.'});
   const scope=await scopeFor(sql,live.session,req);const data=await read(sql,{...query,allowed_customer_ids:scope,draft_owner_id:live.session.user_id});
   if(query.id&&!data)return sendJson(res,404,{error:'Record not found in your customer scope.'});
   if(live.session.role==='admin')return sendJson(res,200,{data});
   return sendJson(res,200,{data:query.id?operationalRecord(query.kind,data):{...data,rows:data.rows.map(r=>operationalRecord(query.kind,r))}});
  }catch{return sendJson(res,503,{error:'Could not load the operational workspace. Try again.'});}
 };
}
export default createOrderWorkspaceHandler();
