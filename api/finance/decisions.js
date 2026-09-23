import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {isAshley,isDamon} from '../_lib/launchPolicy.js';
import {atomicTransition,storedRow} from '../_lib/atomicTransition.js';
import {financialFingerprint,paymentReleaseGate,planFinancialDecision,planFinanceRelease} from '../_lib/financialDecisions.js';
import {releasePaidOrder} from '../_lib/orderLifecycle.js';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store, private');
  if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
  if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
  try {
    const sql=neon(process.env.DATABASE_URL),live=await authorizeLiveRequest(req,sql,{roles:['admin','finance']});
    if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
    const actor=live.session;
    if(req.method==='GET'){
      const rows=await sql`SELECT tbl,data FROM um_rows WHERE tbl IN ('orders','invoices','financial_decisions') AND deleted=false`;
      const orders=rows.filter(r=>r.tbl==='orders').map(r=>r.data),invoices=rows.filter(r=>r.tbl==='invoices').map(r=>r.data);
      const decisions=rows.filter(r=>r.tbl==='financial_decisions').map(r=>({...r.data,current:r.data.fingerprint===financialFingerprint((r.data.kind==='write_off'?invoices:orders).find(t=>t.id===r.data.target_id)||{},r.data.kind)}));
      const pick=(r,keys)=>Object.fromEntries(keys.map(k=>[k,r[k]]));
      return sendJson(res,200,{ok:true,permissions:{review:isAshley(actor),approve:isDamon(actor)},orders:orders.filter(o=>!['shipped','delivered','cancelled','refunded','closed'].includes(o.status)).map(o=>({...pick(o,['id','customer_name','total','paid_amount','payment_status','status','finance_release','shipment_plan']),fingerprint:financialFingerprint(o,'release'),release_required:o.payment_status==='paid'&&!paymentReleaseGate(o).ok})),invoices:invoices.filter(i=>Number(i.balance??Number(i.amount??i.total)-Number(i.paid_amount||0))>0).map(i=>({...pick(i,['id','order_id','customer_name','amount','paid_amount','balance','status']),fingerprint:financialFingerprint(i,'write_off')})),decisions});
    }
    const input=JSON.parse((await readRawBody(req)).toString('utf8'));
    const decision=input.decision_id?await storedRow(sql,'financial_decisions',input.decision_id):null;
    const kind=decision?.kind||input.kind;
    const table=kind==='write_off'?'invoices':'orders';
    const target=await storedRow(sql,table,decision?.target_id||input.target_id);
    if(!target)return sendJson(res,404,{error:'record_not_found'});
    if(['request','release'].includes(input.action)&&input.fingerprint!==financialFingerprint(target,input.action==='release'?'release':kind))return sendJson(res,409,{error:'records_changed_refresh'});
    const plan=input.action==='release'?planFinanceRelease({order:target,actor,input,decision}):planFinancialDecision({target,decision,actor,input});
    if(!plan.ok)return sendJson(res,409,{error:plan.reason});
    if(plan.idempotent)return sendJson(res,200,{ok:true,duplicate:true});
    const checks=[{table,id:target.id,before:target}],writes=[];
    if(decision)checks.push({table:'financial_decisions',id:decision.id,before:decision});
    if(plan.decision)writes.push({table:'financial_decisions',before:decision,data:plan.decision});
    if(plan.order||plan.target)writes.push({table,before:target,data:plan.order||plan.target});
    const at=new Date().toISOString();
    writes.push({table:'audit_log',data:{id:crypto.randomUUID(),kind:`finance.${input.action}`,ref_id:target.id,actor_id:actor.user_id,created_at:at,payload:{decision_id:plan.decision?.id||null,reason:input.reason,reference:input.reference,amount:plan.decision?.amount||null}}});
    if(input.action==='record_write_off'){
      const refId=`writeoff_${crypto.createHash('sha256').update(String(input.reference).trim()).digest('hex')}`;
      writes.push({table:'accounting_reconciliation',data:{id:refId,kind:'write_off',invoice_id:target.id,decision_id:decision.id,amount:decision.amount,accounting_reference:String(input.reference).trim(),status:'recorded',created_at:at}});
    }
    if(input.action==='release')for(const [name,email]of [['Jacobe','jacobe@unitemedical.net'],['Darren','darren@unitemedical.net']]){
      writes.push({table:'tasks',data:{id:`release_${crypto.randomUUID()}`,kind:name==='Darren'?'warehouse_payment_released':'customer_payment_released',order_id:target.id,ref_id:target.id,owner_email:email,subject:`Payment release cleared · ${target.id}`,next_action:name==='Darren'?'Review stock and prepare the shipment.':'Coordinate the customer’s next update.',status:'open',created_at:at}});
    }
    const saved=await atomicTransition(sql,{checks,writes});if(!saved.ok)return sendJson(res,409,{error:saved.reason});
    let allocation=null;
    if(input.action==='release'&&!(target.shipment_plan?.length>1))allocation=await releasePaidOrder(sql,target.id,{actorId:actor.user_id});
    return sendJson(res,200,{ok:true,allocation:allocation?{ok:allocation.ok,reason:allocation.reason}:null,notifications:input.action==='release'?'team_tasks_created':null});
  }catch{return sendJson(res,500,{error:'financial_action_failed'});}
}
