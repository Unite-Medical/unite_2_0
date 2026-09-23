import {inquiryLabel} from '../../src/lib/contactReasons.js';
import {paymentReleaseGate} from './financialDecisions.js';
import crypto from 'node:crypto';
import {STAFF_ROLES,teamForRole,STAFF_TEAMS,staffShortcuts} from '../../src/lib/staffWorkspace.js';
import {orderApprovalGate} from './orderApproval.js';
import {refundFingerprint} from './refundApproval.js';
const CLOSED=new Set(['closed','resolved','completed','cancelled','canceled','delivered','refunded','paid','received','rejected']);
const clean=(v,max=1500)=>String(v??'').trim().slice(0,max);
const email=v=>clean(v,254).toLowerCase();
const date=v=>Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const money=v=>Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)):'Not recorded';
export const WORK_TABLES=['financial_decisions','organizations','orders','order_items','invoices','purchase_orders','sourcing_requests','quotes','backorders','distributor_pickups','shipments','rmas','vendor_bills','accounting_tasks','tasks','inventory','count_sessions','public_inquiries','notification_outbox','inquiry_notifications','webhook_events','staff_followups'];
export function buildStaffWorkspace(tables,session,{now=new Date(),jacobeEmail='jacobe@unitemedical.net',ashleyEmail=null}={}) {
 if(!STAFF_ROLES.includes(session?.role))return {ok:false,error:'forbidden'};
 const team=teamForRole(session.role),admin=session.role==='admin',who=email(session.email);
 const canInquiries=admin||(['sales','sales_manager'].includes(session.role)&&who===email(jacobeEmail));
 const orgs=new Map((tables.organizations||[]).map(o=>[o.id,o]));
 const states=new Map((tables.staff_followups||[]).map(s=>[s.id,s]));
 const items=[];
 const ownership=(r)=>email(r.assigned_owner_email||r.account_owner_email||r.owner_email||orgs.get(r.customer_id||r.org_id)?.account_owner_email||orgs.get(r.customer_id||r.org_id)?.owner_email);
 const owns=(r)=>ownership(r)===who||r.owner_id===session.user_id||r.assigned_to===session.user_id||orgs.get(r.customer_id||r.org_id)?.account_owner_id===session.user_id;
 function add(table,r,kind,department,title,next,{href=null,details=[],due=null,urgent=false,summary='',owner=null,shared=false,scope='department',actions=[]}={}){
  if(!r.id)return;
  if(!admin){
   if(department!==team && !(team==='sales'&&department==='sourcing'&&owns(r)))return;
   if(scope==='owned'&&!owns(r))return;
   if(['sales','sourcing'].includes(team)&&ownership(r)&&!owns(r)&&!shared)return;
  }
  const id=`work_${digest([table,r.id,kind]).slice(0,24)}`,saved=states.get(id);
  const sourceVersion=digest(r);
  const stale=saved&&saved.source_version!==sourceVersion;
  const validState=stale?null:saved;
  const dueAt=date(validState?.due_at||due||r.due_at||r.response_due_at);
  items.push({actions,id,source_table:table,source_id:r.id,source_version:sourceVersion,version:Number(saved?.version||0),category:kind,team:department,title:clean(title,220),summary:clean(summary||orgs.get(r.customer_id||r.org_id)?.name||r.customer_name||''),next_action:clean(validState?.next_action||next),status:clean(r.status||'open',60),work_status:validState?.state||(['waiting','in_progress'].includes(r.status)?r.status:'open'),owner_email:email(validState?.owner_email||owner||(department==='finance'?ashleyEmail:department==='warehouse'?r.warehouse_owner_email:ownership(r)))||null,due_at:dueAt,created_at:date(r.created_at||r.placed_at),urgent,overdue:!!dueAt&&Date.parse(dueAt)<now.getTime(),href,details:details.filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([label,value])=>({label,value:clean(value,2400)})),note:saved?.note||'',updated_at:validState?.updated_at||null,updated_by_name:validState?.updated_by_name||null,changed_since_followup:!!stale});
 }
 for(const r of tables.public_inquiries||[])if(canInquiries&&(admin||email(r.owner_email)===email(session.email))&&!CLOSED.has(r.status))add('public_inquiries',r,'Inquiry','sales',`${inquiryLabel(r.kind)} · ${r.company}`,'Review the request, then record your next follow-up.',{shared:true,summary:r.company,owner:r.owner_email||jacobeEmail,href:`/staff/inquiries?inquiry=${encodeURIComponent(r.id)}`,details:[['Contact',r.name],['Email',r.email],['Phone',r.phone],['Request',r.message],['Release',r.kind==='surplus'?'Intake only. Goods, fees and introductions are not enabled.':r.kind==='contact'?'Contact request':'Dealer information request']]});
 for(const r of tables.orders||[]){if(['shipped','delivered','cancelled','canceled','refunded','closed'].includes(r.status))continue;
  const ref=r.source_order_number||r.order_number||r.id;
  if(!orderApprovalGate(r).ok)add('orders',r,'Approval','all',`Review order ${ref}`,'Review this order and record the approval decision.',{urgent:true,owner:'damon@unitemedical.net',href:`/admin/orders?order=${encodeURIComponent(r.id)}`,details:[['Order',ref],['Total',money(r.total)],['Status',r.status]]});
  add('orders',r,'Outgoing','warehouse',`Order ${ref}`,'Review payment and release status, then coordinate picking and handoff.',{href:admin?`/admin/orders?order=${encodeURIComponent(r.id)}`:null,actions:(admin||team==='warehouse')&&orderApprovalGate(r).ok&&['ready_to_ship','ready_for_pickup'].includes(r.status)&&!(r.shipment_plan?.length>1)?['handoff']:[],details:[['Items',(tables.order_items||[]).filter(l=>l.order_id===r.id).map(l=>`${l.sku} · ${l.qty??l.quantity} units`).join('\n')],['Order',ref],['Fulfillment status',r.status],['Payment status',r.payment_status||'Not recorded'],['Release',orderApprovalGate(r).ok?'Check payment, stock and fulfillment requirements before shipping.':'On hold for a business decision.'],['Tracking',r.tracking_number]],summary:'Outgoing order · release checks still apply'});
  if(r.payment_status==='paid'&&!paymentReleaseGate(r).ok)add('orders',r,'Release review','finance',`Release paid order · ${ref}`,'Verify payment evidence and clear release for the team.',{owner:ashleyEmail,href:'/admin/decisions',details:[['Order',ref],['Total',money(r.total)]]});
  if(['pending','failed','awaiting_payment','unpaid','partial'].includes(r.payment_status))add('orders',r,'Payment check','finance',`Payment check · ${ref}`,'Match confirmed payment to the invoice. Keep other order holds in place.',{details:[['Order',ref],['Payment',r.payment_status],['Total',money(r.total)]],href:admin?`/admin/orders?order=${encodeURIComponent(r.id)}`:'/admin/finance'});
 }
 for(const r of tables.financial_decisions||[])if(['pending_approval','approved'].includes(r.status))add('financial_decisions',r,'Financial approval',r.status==='pending_approval'?'all':'finance',`${r.kind==='write_off'?'Write-off':'Credit release'} · ${r.target_id}`,r.status==='pending_approval'?'Review Ashley’s evidence and record a decision.':'Complete the approved accounting or release step.',{owner:r.status==='pending_approval'?'damon@unitemedical.net':ashleyEmail,href:'/admin/decisions',details:[['Amount',money(r.amount)],['Reference',r.target_id]]});
 for(const r of tables.purchase_orders||[])if(['sent','partial','acknowledged','in_transit'].includes(r.status)&&r.po_type!=='consignment_settlement'){
  const remaining=(r.line_items||[]).reduce((n,l)=>n+Math.max(0,Number(l.qty||0)-Number(l.received_qty||0)),0);
  add('purchase_orders',r,'Incoming','warehouse',`Receive ${r.id}`,'Open the purchase order and scan the quantities that actually arrived.',{href:['sent','partial'].includes(r.status)?`/admin/inventory/receive?po=${encodeURIComponent(r.id)}`:null,due:r.expected_at||r.expected_delivery,summary:`${remaining} units remaining · ${r.vendor_name||'Supplier delivery'}`,details:[['Purchase order',r.id],['Supplier',r.vendor_name],['Tracking',r.tracking_number],['Remaining units',remaining],['Receiving','Record short, damaged and unexpected quantities separately.']]});
 }
 for(const r of tables.invoices||[])if(!CLOSED.has(r.status))add('invoices',r,'Invoice','finance',`Invoice ${r.id}`,'Review the balance and record verified payment evidence.',{href:`/admin/finance?invoice=${encodeURIComponent(r.id)}`,due:r.due_date,details:[['Invoice',r.id],['Order',r.order_id],['Invoice total',money(r.amount??r.total)],['Balance',money(r.balance??Math.max(0,Number(r.amount||r.total||0)-Number(r.paid_amount||0)))],['Terms',r.terms]]});
 for(const r of tables.rmas||[])if(r.status==='refund_pending'){
  const fp=refundFingerprint(r),reviewed=r.refund_accuracy_review?.fingerprint===fp,approved=r.refund_final_approval?.fingerprint===fp;
  add('rmas',r,'Refund',reviewed&&!approved?'all':'finance',`Refund review · ${r.id}`,approved?'Approval is recorded. Reconcile the actual refund separately.':reviewed?'Review Ashley’s accuracy check and record the final decision.':'Check the items, amount and restocking fee before sending to Damon.',{owner:reviewed&&!approved?'damon@unitemedical.net':ashleyEmail,href:`/admin/refund-reviews?rma=${encodeURIComponent(r.id)}`,details:[['Order',r.order_id],['Refund',money(r.refund_total)],['Restocking fee',money(r.restocking_fee||0)],['Ashley review',reviewed?'Recorded':'Pending'],['Damon approval',approved?'Recorded':'Pending']]});
 }
 const specs=[
  ['sourcing_requests','Sourcing','sourcing','Review supplier responses and record the next customer update.','/admin/sourcing'],
  ['quotes','Quote','sales','Review the quote and follow up with the customer.','/admin/quotes'],
  ['backorders','Backorder','sales','Confirm availability and update the customer. Use “Awaiting supplier confirmation” when the date is unknown.','/admin/fulfillment'],
  ['distributor_pickups','Pickup','warehouse','Review the requested window and warehouse readiness. Record custody through the fulfillment workflow.','/admin/fulfillment'],
  ['vendor_bills','Supplier bill','finance','Match the purchase order, accepted quantities and supplier invoice.','/admin/finance?section=ap'],
  ['accounting_tasks','Billing follow-up','finance','Review the pending charge, customer approval and payment evidence.','/admin/finance'],
  ['count_sessions','Stock count','warehouse','Record the physical count and review discrepancies.','/admin/inventory/count'],
 ];
 for(const [table,kind,department,next,path]of specs)for(const r of tables[table]||[]){if(CLOSED.has(r.status)||r.status==='approved')continue;
  add(table,r,kind,department,`${kind} · ${r.title||r.subject||r.source_order_number||r.id}`,next,{href:admin?path:department==='finance'?path:null,scope:department==='sales'?'owned':'department',details:[['Reference',r.id],['Order',r.order_id],['Status',r.status],...(department==='warehouse'?[['Requested window',r.requested_window||r.scheduled_at],['Tracking',r.tracking_number]]:[])]});
 }
 for(const r of tables.shipments||[])if(['exception','delivery_failed','lost','delayed'].includes(r.status))add('shipments',r,'Delivery issue','warehouse',`Delivery needs attention · ${r.order_id||r.id}`,'Confirm carrier evidence and coordinate a customer update with the account owner.',{urgent:true,href:admin?'/admin/fulfillment':null,details:[['Shipment',r.id],['Order',r.order_id],['Tracking',r.tracking_number],['Status',r.status]]});
 for(const r of tables.organizations||[])if(r.status!=='merged'&&(r.approval_status==='manual_review'||r.status==='pending_activation'||r.commerce_hold_reason))add('organizations',{...r,org_id:r.id},'Account','sales',`Account follow-up · ${r.name}`,'Review the specific account exception. Preserve verified existing pricing and terms.',{scope:'owned',href:admin?`/admin/customers?customer=${encodeURIComponent(r.id)}`:'/rep',details:[['Account',r.name],['Status',r.status],['Approval',r.approval_status],['Follow-up',r.commerce_hold_reason]]});
 // Assigned tasks without a source-backed queue entry remain visible. Never copy arbitrary payloads.
 for(const r of tables.tasks||[]){if(CLOSED.has(r.status)||(!admin&&!owns(r)))continue;if(r.ref_type==='public_inquiry')continue;
  const taskTeam=/warehouse|receipt|count|pickup/.test(r.kind||'')?'warehouse':/customer/.test(r.kind||'')?'sales':/finance|payment|billing|shortage/.test(r.kind||'')?'finance':/sourcing/.test(r.kind||'')?'sourcing':'sales';
  add('tasks',r,'Follow-up',admin?taskTeam:team,r.subject||'Assigned follow-up',r.next_action||r.payload?.next_action||'Review the reference and record the next step.',{scope:'owned',owner:r.owner_email,details:[['Reference',r.ref_id],['Type',r.kind]],summary:'Assigned follow-up'});
 }
 if(admin)for(const table of ['notification_outbox','inquiry_notifications','webhook_events'])for(const r of tables[table]||[])if(['failed','dead','dead_letter','provider_unknown','delivery_failed'].includes(r.status))add(table,r,'Service issue','all',`Service needs review · ${r.ref_id||r.id}`,'Reconcile the provider outcome before retrying. An uncertain delivery must not be sent twice.',{urgent:true,href:'/admin/integrations',details:[['Reference',r.ref_id||r.id],['Status',r.status]]});
 items.sort((a,b)=>Number(b.overdue)-Number(a.overdue)||Number(b.urgent)-Number(a.urgent)||(Date.parse(a.due_at)||Infinity)-(Date.parse(b.due_at)||Infinity)||(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0)||a.id.localeCompare(b.id));
 return {ok:true,items,team,views:admin?['all','sales','warehouse','finance','sourcing']:[team],role_label:STAFF_TEAMS[team].label,shortcuts:staffShortcuts(session.role,{inquiries:canInquiries}),capabilities:{inquiries:canInquiries,refund_review:['admin','finance'].includes(session.role)&&!!ashleyEmail},generated_at:now.toISOString(),counts:{open:items.length,overdue:items.filter(r=>r.overdue).length,waiting:items.filter(r=>r.work_status==='waiting').length,unassigned:items.filter(r=>!r.owner_email).length}};
}
export function planStaffFollowup(item,input,session,now=new Date()){
 if(!item)return {ok:false,error:'work_item_unavailable'};
 if(input.source_version!==item.source_version||Number(input.version)!==item.version)return {ok:false,error:'work_changed_refresh'};
 if(!['open','in_progress','waiting'].includes(input.state))return {ok:false,error:'invalid_work_state'};
 if(!clean(input.next_action))return {ok:false,error:'next_action_required'};
 if(input.due_at&&!date(input.due_at))return {ok:false,error:'invalid_due_date'};
 // A workflow note never authorizes payment, shipping, pricing or financial approval.
 const row={id:item.id,source_table:item.source_table,source_id:item.source_id,source_version:item.source_version,state:input.state,next_action:clean(input.next_action),note:clean(input.note,4000),due_at:date(input.due_at),owner_email:input.claim===true?email(session.email):item.owner_email,version:item.version+1,updated_by:session.user_id,updated_by_name:clean(session.name||session.email,200),updated_at:now.toISOString()};
 return {ok:true,row};
}
