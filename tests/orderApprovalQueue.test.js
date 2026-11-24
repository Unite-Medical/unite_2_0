import test from 'node:test';
import assert from 'node:assert/strict';
import {orderApprovalGate,planOrderApproval,isOrderApprover} from '../api/_lib/orderApproval.js';
import {planPaidOrderRelease} from '../api/_lib/orderLifecycle.js';
import {buildLabelRequest} from '../api/_lib/orderShipping.js';
import {summarizeApprovalOrder} from '../api/admin/order-approvals.js';
import {staffShortcuts} from '../src/lib/staffWorkspace.js';
const env={ORDER_APPROVER_EMAILS:'ashley@unitemedical.net, Alex+Ashley@unitemedical.net'};
const pending={id:'O1',customer_id:'c',total:1,status:'pending_approval',accounting_status:'awaiting_approval',payment_status:'paid',approval:{status:'pending',requested_by:'jacobe@unitemedical.net',requested_at:'2026-11-24T00:00:00Z'}};
const damon={user_id:'d',role:'admin',email:'damon@unitemedical.net',name:'Damon'};
const ashley={user_id:'a',role:'finance',email:'ashley@unitemedical.net',name:'Ashley'};
test('pending orders are held from payment release and shipping labels',()=>{
 assert.equal(orderApprovalGate(pending).reason,'order_approval_pending');
 assert.equal(planPaidOrderRelease({order:pending}).ok,false);
 assert.equal(buildLabelRequest({order:pending}).ok,false);
});
test('only Damon or configured approvers can approve; other staff cannot',()=>{
 assert.equal(isOrderApprover(damon,env),true);
 assert.equal(isOrderApprover(ashley,env),true);
 assert.equal(isOrderApprover({...ashley,email:'alex+ashley@unitemedical.net'},env),true);
 for(const actor of [{user_id:'s',role:'sales',email:'jacobe@unitemedical.net'},{user_id:'x',role:'admin',email:'other@unitemedical.net'},{...ashley,role:'sales'}])
  assert.equal(planOrderApproval({order:pending,actor,action:'approve',reason:'ok',env}).ok,false);
});
test('approval releases the order into the normal flow and keeps the requester',()=>{
 const plan=planOrderApproval({order:pending,actor:ashley,action:'approve',reason:'Checked price',env});
 assert.equal(plan.ok,true);assert.equal(plan.wasPending,true);
 assert.equal(plan.order.status,'payment_pending');assert.equal(plan.order.accounting_status,'queued');
 assert.equal(plan.approval.requested_by,'jacobe@unitemedical.net');assert.equal(plan.approval.approver_email,'ashley@unitemedical.net');
 assert.equal(orderApprovalGate(plan.order).ok,true);
});
test('rejection needs a reason and cancels without accounting',()=>{
 assert.equal(planOrderApproval({order:pending,actor:damon,action:'reject',reason:' ',env}).reason,'approval_reason_required');
 const plan=planOrderApproval({order:pending,actor:damon,action:'reject',reason:'Wrong price',env});
 assert.equal(plan.order.status,'cancelled');assert.equal(plan.order.accounting_status,'cancelled');
 assert.equal(orderApprovalGate(plan.order).reason,'order_rejected');
});
test('orders over $10,000 still need Damon himself',()=>{
 const big={...pending,total:20000};
 assert.equal(planOrderApproval({order:big,actor:ashley,action:'approve',reason:'ok',env}).reason,'damon_approval_authority_required');
 assert.equal(orderApprovalGate(planOrderApproval({order:big,actor:damon,action:'approve',reason:'ok',env}).order).ok,true);
});
test('queue summary lists lines and every staff role gets the queue in navigation',()=>{
 const s=summarizeApprovalOrder(pending,[{order_id:'O1',sku:'QA-1',name:'Test product',qty:1},{order_id:'O2',sku:'X',qty:3}]);
 assert.deepEqual(s.lines,[{sku:'QA-1',name:'Test product',quantity:1}]);
 for(const role of ['admin','sales','sales_manager','customer_service','warehouse_operator','warehouse_manager','finance','sourcing','sourcing_manager'])
  assert.ok(staffShortcuts(role).some(i=>i.path==='/staff/order-approvals'),role);
});
test('queue orders get one decision; delegated approvers cannot touch orders outside the queue',()=>{
 const approved=planOrderApproval({order:pending,actor:ashley,action:'approve',reason:'ok',env}).order;
 assert.equal(planOrderApproval({order:approved,actor:damon,action:'reject',reason:'changed mind',env}).reason,'approval_already_decided');
 const checkout={id:'C1',customer_id:'c',total:50,status:'payment_pending'};
 assert.equal(planOrderApproval({order:checkout,actor:ashley,action:'reject',reason:'no',env}).reason,'order_not_waiting_for_approval');
});
