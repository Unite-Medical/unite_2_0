import crypto from 'node:crypto';
import {isAshley,isDamon,emailOf} from './launchPolicy.js';
export function refundFingerprint(rma){return crypto.createHash('sha256').update(JSON.stringify({id:rma.id,order_id:rma.order_id,refund_total:rma.refund_total,restocking_fee:rma.restocking_fee,items:rma.accepted_items})).digest('hex');}
export function planRefundApproval(rma,{action,actor,reason,now=new Date()}){
 if(rma?.status!=='refund_pending')return {ok:false,reason:'refund_not_pending'};
 if(!String(reason||'').trim())return {ok:false,reason:'review_reason_required'};
 const fingerprint=refundFingerprint(rma),record={actor_id:actor?.user_id,email:emailOf(actor),reason:String(reason).slice(0,2000),fingerprint,at:now.toISOString()};
 let patch;
 if(action==='review_refund'){
  if(!isAshley(actor))return {ok:false,reason:'ashley_review_required'};
  patch={refund_accuracy_review:record,refund_final_approval:null};
 }else if(action==='approve_refund'){
  if(!isDamon(actor))return {ok:false,reason:'damon_final_approval_required'};
  if(rma.refund_accuracy_review?.fingerprint!==fingerprint)return {ok:false,reason:'ashley_review_required'};
  patch={refund_final_approval:record};
 }else return {ok:false,reason:'invalid_refund_action'};
 return {ok:true,rma:{...rma,...patch,revision:Number(rma.revision||0)+1,updated_at:now.toISOString()}};
}
export function refundApprovalGate(rma){const fingerprint=refundFingerprint(rma);return rma.refund_accuracy_review?.fingerprint===fingerprint&&rma.refund_final_approval?.fingerprint===fingerprint&&rma.refund_final_approval.email==='damon@unitemedical.net'?{ok:true}:{ok:false,reason:'ashley_review_and_damon_approval_required'};}
