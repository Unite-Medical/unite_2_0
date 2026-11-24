import crypto from 'node:crypto';
export const DAMON_APPROVER_EMAIL = 'damon@unitemedical.net';
export const ORDER_APPROVAL_THRESHOLD = 10000;
const emailOf=(actor)=>String(actor?.email||'').trim().toLowerCase();
// Staff-entered orders wait for one of these people. ORDER_APPROVER_EMAILS adds more (comma-separated).
export function orderApproverEmails(env=process.env){return new Set([DAMON_APPROVER_EMAIL,...String(env.ORDER_APPROVER_EMAILS||'').split(',')].map(e=>e.trim().toLowerCase()).filter(Boolean));}
export function isOrderApprover(actor,env=process.env){return ['admin','finance'].includes(actor?.role)&&orderApproverEmails(env).has(emailOf(actor));}
export function orderApprovalFingerprint(order) {
  return crypto.createHash('sha256').update(JSON.stringify({id:order.id,customer_id:order.customer_id,total:Number(order.total),subtotal:Number(order.subtotal||0),freight:Number(order.freight||order.shipping_cost||0),tax:Number(order.tax||0),po_number:order.po_number,ship_to_address_id:order.ship_to_address_id,request_hash:order.request_hash||null,payment_method:order.payment_method,ship_from:order.ship_from,shipping_package:order.shipping_package,tax_basis:order.tax_basis,commercial_revision:Number(order.commercial_revision||0)})).digest('hex');
}
export function orderApprovalGate(order) {
  if (!order) return {ok:false,reason:'order_not_found'};
  if (order.approval?.status === 'rejected') return {ok:false,reason:'order_rejected'};
  if (order.approval?.status === 'pending') return {ok:false,reason:'order_approval_pending'};
  if (!(Number(order.total)>ORDER_APPROVAL_THRESHOLD)) return {ok:true};
  const approval=order.approval;
  if (approval?.status!=='approved'||approval.approver_email!==DAMON_APPROVER_EMAIL||!approval.actor_id||!approval.reason||approval.fingerprint!==orderApprovalFingerprint(order)) return {ok:false,reason:'damon_approval_required'};
  return {ok:true};
}
export function planOrderApproval({order,actor,action,reason,now=new Date(),env=process.env}) {
  const highValue=Number(order?.total)>ORDER_APPROVAL_THRESHOLD;
  if(highValue?!(actor?.role==='admin'&&emailOf(actor)===DAMON_APPROVER_EMAIL):!isOrderApprover(actor,env))return {ok:false,reason:highValue?'damon_approval_authority_required':'order_approval_authority_required'};
  if(!order?.id||!['approve','reject'].includes(action))return {ok:false,reason:'invalid_approval_request'};
  if(!String(reason||'').trim())return {ok:false,reason:'approval_reason_required'};
  if(['shipped','delivered','cancelled','refunded'].includes(order.status))return {ok:false,reason:'order_already_closed'};
  const wasPending=order.approval?.status==='pending';
  const approval={...(wasPending?{requested_by:order.approval.requested_by,requested_at:order.approval.requested_at}:{}),status:action==='approve'?'approved':'rejected',actor_id:actor.user_id,approver_email:emailOf(actor),approver_name:actor.name||null,reason:String(reason).trim().slice(0,2000),fingerprint:orderApprovalFingerprint(order),decided_at:now.toISOString()};
  const status=wasPending?(action==='approve'?'payment_pending':'cancelled'):order.status;
  return {ok:true,wasPending,order:{...order,status,...(wasPending?{accounting_status:action==='approve'?'queued':'cancelled'}:{}),approval,fulfillment_revision:Number(order.fulfillment_revision||0)+1},approval};
}
