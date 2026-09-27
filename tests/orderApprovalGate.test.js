import test from 'node:test';
import assert from 'node:assert/strict';
import {orderApprovalGate,planOrderApproval} from '../api/_lib/orderApproval.js';
import {planPaidOrderRelease} from '../api/_lib/orderLifecycle.js';
import {buildLabelRequest} from '../api/_lib/orderShipping.js';
const order={id:'big',customer_id:'c',total:10001,payment_status:'paid',status:'payment_pending'};
const actor={user_id:'damon',role:'admin',email:'damon@unitemedical.net'};
test('high-value gate blocks paid release and label creation until Damon approves',()=>{
 assert.equal(orderApprovalGate({...order,total:10000}).ok,true);
 assert.equal(planPaidOrderRelease({order}).reason,'damon_approval_required');
 assert.equal(buildLabelRequest({order}).reason,'damon_approval_required');
 const approved=planOrderApproval({order,actor,action:'approve',reason:'Reviewed customer commitment'});
 assert.equal(orderApprovalGate(approved.order).ok,true);
 assert.equal(orderApprovalGate({...approved.order,total:10002}).reason,'damon_approval_required');
});
test('another admin cannot approve, rejection and missing reasons hold order',()=>{
 assert.equal(planOrderApproval({order,actor:{...actor,email:'other@example.com'},action:'approve',reason:'yes'}).ok,false);
 assert.equal(planOrderApproval({order,actor,action:'approve',reason:''}).ok,false);
 assert.equal(orderApprovalGate(planOrderApproval({order,actor,action:'reject',reason:'Unconfirmed price'}).order).reason,'order_rejected');
});
