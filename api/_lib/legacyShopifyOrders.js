import crypto from 'node:crypto';
import { SERVICES } from './services.js';

export const LEGACY_ORDER_QUERY = `query LegacyOrder($id: ID!) {
  order(id: $id) {
    id legacyResourceId name updatedAt cancelledAt closed currencyCode
    displayFinancialStatus displayFulfillmentStatus
    customer { id legacyResourceId email }
    lineItems(first: 250) { nodes { id sku name quantity currentQuantity unfulfilledQuantity } }
  }
}`;

export async function fetchLiveShopifyOrder(orderId, fetchImpl=fetch){
  if(!SERVICES.shopify.configured()) throw new Error('shopify_not_configured');
  const legacy=String(orderId||'').replace(/^gid:\/\/shopify\/Order\//,'');
  if(!/^\d+$/.test(legacy)) throw new Error('invalid_shopify_order_id');
  const version=process.env.SHOPIFY_API_VERSION||'2026-04';
  const response=await fetchImpl(SERVICES.shopify.buildUrl(`/admin/api/${version}/graphql.json`),{method:'POST',headers:await SERVICES.shopify.headers(),body:JSON.stringify({query:LEGACY_ORDER_QUERY,variables:{id:`gid://shopify/Order/${legacy}`}})});
  const payload=await response.json();
  if(!response.ok||payload.errors?.length) throw new Error(payload.errors?.[0]?.message||`shopify_http_${response.status}`);
  if(!payload.data?.order) throw new Error('shopify_order_not_found');
  return payload.data.order;
}

function hash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function legacyId(order){return String(order?.legacyResourceId||String(order?.id||'').split('/').pop()||'');}
export function buildLegacyTransferPreview(order){
 if(!order?.id||!order?.updatedAt) throw new Error('live Shopify order identity and updatedAt required');
 const lines=(order.lineItems?.nodes||[]).map((line)=>({
  source_line_id:String(line.id||''),sku:String(line.sku||'').trim(),name:line.name||'',
  ordered_quantity:Number(line.quantity||0),current_quantity:Number(line.currentQuantity??line.quantity??0),
  transferable_quantity:Math.max(0,Number(line.unfulfilledQuantity||0)),
 })).filter((line)=>line.source_line_id&&line.transferable_quantity>0);
 const canonical={source_order_id:legacyId(order),source_gid:order.id,order_number:order.name,updated_at:order.updatedAt,cancelled_at:order.cancelledAt||null,closed:Boolean(order.closed),currency:order.currencyCode||'USD',lines};
 return {...canonical,lines,hash:hash(canonical)};
}
export function planLegacyOrderTransfer({decision,liveOrder,previewHash,actorId='unknown',now=new Date()}={}){
 if(decision?.action!=='transfer') return {ok:false,reason:'order_not_approved_for_transfer'};
 const preview=buildLegacyTransferPreview(liveOrder);
 if(decision.shopify_order_id&&String(decision.shopify_order_id)!==preview.source_order_id) return {ok:false,reason:'shopify_order_identity_mismatch'};
 if(preview.hash!==previewHash) return {ok:false,reason:'shopify_order_changed'};
 if(preview.cancelled_at||preview.closed) return {ok:false,reason:'shopify_order_closed'};
 if(!preview.lines.length) return {ok:false,reason:'no_remaining_obligation'};
 const at=(now instanceof Date?now:new Date(now)).toISOString();
 const orderId=`legacy_shopify_${preview.source_order_id}`;
 const requestHash=hash({source_order_id:preview.source_order_id,preview_hash:preview.hash,lines:preview.lines.map((line)=>[line.source_line_id,line.transferable_quantity])});
 return {ok:true,request_hash:requestHash,order:{id:orderId,order_source:'legacy_shopify',source_system:'shopify',source_order_id:preview.source_order_id,source_order_gid:preview.source_gid,source_order_number:preview.order_number,source_updated_at:preview.updated_at,source_preview_hash:preview.hash,transfer_request_hash:requestHash,status:'pending_shopify_ack',payment_status:'historical_payment_evidence_only',fulfillment_blocked:true,notification_suppressed:true,created_at:at,created_by:actorId},lines:preview.lines.map((line)=>({id:`legacy_line_${String(line.source_line_id).split('/').pop()}`,order_id:orderId,source_line_id:line.source_line_id,sku:line.sku,name:line.name,qty:line.transferable_quantity,status:'pending_shopify_ack'})),commitment_adoptions:preview.lines.map((line)=>({id:`legacy_commitment_${String(line.source_line_id).split('/').pop()}`,order_id:orderId,source_line_id:line.source_line_id,sku:line.sku,qty:line.transferable_quantity,status:'pending_shopify_ack'})),migration:{id:`legacy_migration_${preview.source_order_id}`,source_order_id:preview.source_order_id,unite_order_id:orderId,status:'pending_shopify_ack',request_hash:requestHash,actor_id:actorId,created_at:at},side_effects:{payments:0,invoices:0,shipments:0,notifications:0}};
}
