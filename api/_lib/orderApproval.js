import crypto from 'node:crypto';
export const DAMON_APPROVER_EMAIL = 'damon@unitemedical.net';
export const ORDER_APPROVAL_THRESHOLD = 10000;
export function orderApprovalFingerprint(order) {
  return crypto.createHash('sha256').update(JSON.stringify({id:order.id,customer_id:order.customer_id,total:Number(order.total),subtotal:Number(order.subtotal||0),freight:Number(order.freight||order.shipping_cost||0),tax:Number(order.tax||0),po_number:order.po_number,ship_to_address_id:order.ship_to_address_id,request_hash:order.request_hash||null,payment_method:order.payment_method,ship_from:order.ship_from,shipping_package:order.shipping_package,tax_basis:order.tax_basis,commercial_revision:Number(order.commercial_revision||0)})).digest('hex');
}
export function orderApprovalGate(order) {
  if (!order) return {ok:false,reason:'order_not_found'};
  if (order.approval?.status === 'rejected') return {ok:false,reason:'order_rejected'};
  if (!(Number(order.total)>ORDER_APPROVAL_THRESHOLD)) return {ok:true};
  const approval=order.approval;
  if (approval?.status!=='approved'||approval.approver_email!==DAMON_APPROVER_EMAIL||!approval.actor_id||!approval.reason||approval.fingerprint!==orderApprovalFingerprint(order)) return {ok:false,reason:'damon_approval_required'};
  return {ok:true};
}
export function planOrderApproval({order,actor,action,reason,now=new Date()}) {
  if(actor?.role!=='admin'||String(actor.email||'').trim().toLowerCase()!==DAMON_APPROVER_EMAIL)return {ok:false,reason:'damon_approval_authority_required'};
  if(!order?.id||!['approve','reject'].includes(action))return {ok:false,reason:'invalid_approval_request'};
  if(!String(reason||'').trim())return {ok:false,reason:'approval_reason_required'};
  if(['shipped','delivered','cancelled','refunded'].includes(order.status))return {ok:false,reason:'order_already_closed'};
  const approval={status:action==='approve'?'approved':'rejected',actor_id:actor.user_id,approver_email:DAMON_APPROVER_EMAIL,reason:String(reason).trim().slice(0,2000),fingerprint:orderApprovalFingerprint(order),decided_at:now.toISOString()};
  return {ok:true,order:{...order,approval,fulfillment_revision:Number(order.fulfillment_revision||0)+1},approval};
}
