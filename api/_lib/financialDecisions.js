import crypto from 'node:crypto';
import { isAshley, isDamon, emailOf } from './launchPolicy.js';
import { orderApprovalGate, orderApprovalFingerprint } from './orderApproval.js';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => String(value || '').trim().slice(0, 2000);
const money = value => Math.round(Number(value) * 100) / 100;
const closed = order => ['cancelled','canceled','refunded','shipped','delivered','closed'].includes(order?.status);
export function financialFingerprint(target, kind) {
  return hash(kind === 'write_off'
    ? [target.id,target.customer_id,target.order_id,target.amount,target.total,target.balance,target.paid_amount,target.written_off_amount,target.status]
    : [orderApprovalFingerprint(target),target.payment_status,target.paid_amount,target.payment_method,target.credit_hold,target.fulfillment_blocked]);
}
export function paymentReleaseGate(order) {
  if (!order) return {ok:false,reason:'order_not_found'};
  if (order.payment_status !== 'paid') return {ok:true};
  const review = order.finance_release;
  if (!review?.actor_id || !process.env.UNITE_ASHLEY_EMAIL || review.actor_email !== process.env.UNITE_ASHLEY_EMAIL.toLowerCase() || !review.reference || review.fingerprint !== financialFingerprint(order,'release')) return {ok:false,reason:'ashley_release_required'};
  return {ok:true};
}
export function creditDecisionCurrent(order, decision) {
  return decision?.kind === 'credit_release' && decision.status === 'approved' && decision.target_id === order.id && decision.approval?.actor_email === 'damon@unitemedical.net' && decision.review?.actor_id !== decision.approval?.actor_id && decision.fingerprint === financialFingerprint(order,'credit_release');
}
export function planFinancialDecision({target,decision=null,actor,input,now=new Date()}) {
  const at=now.toISOString(), reason=clean(input.reason),reference=clean(input.reference);
  if(!target?.id)return {ok:false,reason:'record_not_found'};
  if((decision?.kind||input.kind)==='write_off'&&['void','voided','cancelled','canceled','refunded','written_off','settled'].includes(target.status))return {ok:false,reason:'invoice_closed'};
  if(!reason)return {ok:false,reason:'reason_required'};
  if(input.action==='request') {
    if(!isAshley(actor))return {ok:false,reason:'ashley_review_required'};
    if(!['write_off','credit_release'].includes(input.kind)||!reference)return {ok:false,reason:'review_evidence_required'};
    const amount=money(input.amount), available=money((decision?.kind||input.kind)==='write_off'?target.balance??Number(target.amount??target.total)-Number(target.paid_amount||0):Number(target.total)-Number(target.paid_amount||0));
    if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(available)||amount>available|| (input.kind==='credit_release'&&amount!==available))return {ok:false,reason:'invalid_decision_amount'};
    if(input.kind==='credit_release'&&(closed(target)||['paid','terms_approved'].includes(target.payment_status)))return {ok:false,reason:'credit_release_not_applicable'};
    return {ok:true,decision:{id:crypto.randomUUID(),kind:input.kind,target_id:target.id,customer_id:target.customer_id,amount,status:'pending_approval',fingerprint:financialFingerprint(target,input.kind),review:{actor_id:actor.user_id,actor_email:emailOf(actor),reason,reference,at},revision:1,created_at:at,updated_at:at}};
  }
  if(!decision || decision.target_id!==target.id)return {ok:false,reason:'decision_not_found'};
  if(Number(input.expected_revision)!==Number(decision.revision))return {ok:false,reason:'records_changed_refresh'};
  if(input.action==='reject') {
    if(!isDamon(actor)||decision.status!=='pending_approval')return {ok:false,reason:'damon_approval_required'};
    return {ok:true,decision:{...decision,status:'rejected',approval:{actor_id:actor.user_id,actor_email:emailOf(actor),reason,at},revision:decision.revision+1,updated_at:at}};
  }
  if(decision.fingerprint!==financialFingerprint(target,decision.kind))return {ok:false,reason:'financial_evidence_changed'};
  if(input.action==='approve') {
    if(!isDamon(actor)||decision.review.actor_id===actor.user_id)return {ok:false,reason:'independent_damon_approval_required'};
    if(decision.status!=='pending_approval')return {ok:false,reason:'decision_already_reviewed'};
    return {ok:true,decision:{...decision,status:'approved',approval:{actor_id:actor.user_id,actor_email:emailOf(actor),reason,at},revision:decision.revision+1,updated_at:at}};
  }
  if(input.action==='record_write_off') {
    if(!isAshley(actor))return {ok:false,reason:'ashley_review_required'};
    if(decision.kind!=='write_off'||decision.status!=='approved'||decision.approval?.actor_email!=='damon@unitemedical.net'||decision.approval.actor_id===decision.review.actor_id||!reference)return {ok:false,reason:'approved_write_off_and_accounting_reference_required'};
    const balance=money(target.balance??Number(target.amount??target.total)-Number(target.paid_amount||0)),remaining=money(balance-decision.amount);
    if(remaining<0)return {ok:false,reason:'financial_evidence_changed'};
    return {ok:true,target:{...target,balance:remaining,written_off_amount:money(Number(target.written_off_amount||0)+decision.amount),status:remaining===0?'written_off':target.status,updated_at:at},decision:{...decision,status:'completed',posting:{actor_id:actor.user_id,reference,reason,at},revision:decision.revision+1,updated_at:at}};
  }
  return {ok:false,reason:'invalid_action'};
}
export function planFinanceRelease({order,actor,input,decision=null,now=new Date()}) {
  if(!isAshley(actor))return {ok:false,reason:'ashley_release_required'};
  if(!order?.id||closed(order))return {ok:false,reason:'order_closed'};
  if(!clean(input.reason)||!clean(input.reference))return {ok:false,reason:'review_evidence_required'};
  const approval=orderApprovalGate(order);if(!approval.ok)return approval;
  if(order.fulfillment_blocked||order.quality_hold)return {ok:false,reason:'other_order_holds_remain'};
  const credit=creditDecisionCurrent(order,decision);
  if(order.payment_status!=='paid'&&!credit)return {ok:false,reason:'payment_or_approved_credit_required'};
  if(order.credit_hold&&!credit)return {ok:false,reason:'credit_approval_required'};
  if(order.payment_status==='paid'&&paymentReleaseGate(order).ok)return {ok:true,idempotent:true,order};
  const at=now.toISOString(),next={...order,...(credit?{payment_status:'terms_approved',credit_hold:false,credit_release_decision_id:decision.id}:{}),updated_at:at};
  next.finance_release={actor_id:actor.user_id,actor_email:emailOf(actor),at,reason:clean(input.reason),reference:clean(input.reference),basis:credit?'approved_credit':'verified_payment',fingerprint:financialFingerprint(next,'release')};
  return {ok:true,order:next,...(credit?{decision:{...decision,status:'completed',revision:decision.revision+1,updated_at:at}}:{})};
}
