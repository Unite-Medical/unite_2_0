import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  authorizeVendorPurchaseOrder,
  hashVendorReviewToken,
  applyVendorPurchaseOrderResponse,
  sanitizePurchaseOrderForVendor,
  validateVendorPurchaseOrderAction,
} from '../api/vendor/purchase-orders/review.js';
import { hashVendorReviewToken as hashVendorReviewTokenClient } from '../src/lib/vendorPoTokens.js';
import { db } from '../src/lib/db.js';
import { purchaseOrders } from '../src/lib/wms/purchaseOrders.js';
import { planPurchaseOrderAction } from '../api/vendor/purchase-orders/action.js';
import {
  buildVendorPurchaseOrderReviewLink,
  isVendorPurchaseOrderOutboxClaimable,
  retryVendorPurchaseOrderOutbox,
  validateVendorPurchaseOrderDelivery,
} from '../api/vendor/purchase-orders/send.js';

test('vendor PO review projection contains supplier terms but no customer or internal commercial data', () => {
  const po = {
    id: 'po_vendor_review',
    vendor_name: 'Supply Co',
    vendor_review_token: 'secret-review-token',
    status: 'sent',
    revision: 3,
    expected_delivery: '2026-08-01T00:00:00.000Z',
    line_items: [{ sku: 'SUP-1', name: 'Supply item', qty: 5, cost: 12.5 }],
    total_cost: 62.5,
    customer_po: 'SECRET-CUSTOMER-PO',
    customer_name: 'Secret Hospital',
    customer_id: 'org_secret',
    sourcing_request_id: 'src_internal',
    vendor_offer_id: 'offer_internal',
    margin: 0.42,
    internal_notes: 'never expose',
  };

  const view = sanitizePurchaseOrderForVendor(po);

  assert.equal(view.id, po.id);
  assert.equal(view.line_items[0].cost, 12.5);
  assert.equal(view.total_cost, 62.5);
  const serialized = JSON.stringify(view);
  assert.doesNotMatch(serialized, /SECRET-CUSTOMER-PO|Secret Hospital|org_secret|src_internal|offer_internal|never expose|margin/);
  assert.ok(!('vendor_review_token' in view));
});

test('vendor PO token authorization and actions fail closed', () => {
  const po = {
    id: 'po_auth', revision: 4, status: 'sent',
    vendor_review_token_hash: hashVendorReviewToken('correct-token', 'po_auth', 4),
    vendor_review_revision: 4,
  };
  assert.equal(authorizeVendorPurchaseOrder(po, 'correct-token'), true);
  assert.equal(authorizeVendorPurchaseOrder(po, 'wrong-token'), false);
  assert.equal(authorizeVendorPurchaseOrder(po, ''), false);

  assert.deepEqual(validateVendorPurchaseOrderAction({ action: 'acknowledge', responder: 'Buyer', note: '' }), {
    ok: true, action: 'acknowledge', responder: 'Buyer', note: '',
  });
  assert.equal(validateVendorPurchaseOrderAction({ action: 'delete', responder: 'Buyer' }).ok, false);
  assert.equal(validateVendorPurchaseOrderAction({ action: 'acknowledge', responder: '' }).ok, false);
});

test('browser and server derive the same revision-bound review-token hash', async () => {
  const clientHash = await hashVendorReviewTokenClient('token-value', 'po_hash', 7);
  assert.equal(clientHash, hashVendorReviewToken('token-value', 'po_hash', 7));
});

test('vendor PO response is idempotent and an acknowledgment cannot be overwritten', () => {
  const po = { id: 'po_response', revision: 2, vendor_response: 'pending' };
  const first = applyVendorPurchaseOrderResponse(po, {
    action: 'acknowledge', responder: 'Supplier Buyer', note: '', now: new Date('2026-07-18T16:00:00.000Z'),
  });
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.purchase_order.vendor_response, 'acknowledged');

  const duplicate = applyVendorPurchaseOrderResponse(first.purchase_order, {
    action: 'acknowledge', responder: 'Supplier Buyer', note: '', now: new Date('2026-07-18T16:01:00.000Z'),
  });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);

  const conflict = applyVendorPurchaseOrderResponse(first.purchase_order, {
    action: 'cannot_fulfill', responder: 'Supplier Buyer', note: 'changed mind', now: new Date('2026-07-18T16:02:00.000Z'),
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, 'response_already_final');
});

test('acknowledged PO cannot be cancelled and ordinary cancellation revokes the hosted link', () => {
  db.insert('purchase_orders', {
    id: 'po_ack_cancel_guard', status: 'sent', revision: 2, vendor_response: 'acknowledged',
    vendor_review_revision: 2, vendor_review_token_hash: hashVendorReviewToken('ack-token', 'po_ack_cancel_guard', 2),
  });
  assert.equal(purchaseOrders.cancel('po_ack_cancel_guard').reason, 'acknowledged_po_cannot_be_cancelled');

  db.insert('purchase_orders', {
    id: 'po_cancel_revokes', status: 'sent', revision: 3, vendor_response: 'pending',
    vendor_review_revision: 3, vendor_review_token_hash: hashVendorReviewToken('cancel-token', 'po_cancel_revokes', 3),
  });
  const cancelled = purchaseOrders.cancel('po_cancel_revokes');
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.po.status, 'cancelled');
  assert.equal(cancelled.po.revision, 4);
  assert.equal(authorizeVendorPurchaseOrder(cancelled.po, 'cancel-token'), false);
});

test('server PO action planner enforces approval, acknowledgment, revision revocation, and AP close guards', () => {
  const approved = planPurchaseOrderAction({ id: 'po_action', status: 'draft', revision: 1 }, { action: 'approve', actorId: 'usr_admin', now: new Date('2026-07-19T12:00:00.000Z') });
  assert.equal(approved.ok, true);
  assert.equal(approved.purchase_order.status, 'approved');

  const acknowledged = planPurchaseOrderAction({ id: 'po_action', status: 'sent', revision: 1, vendor_response: 'acknowledged' }, { action: 'cancel', actorId: 'usr_admin' });
  assert.equal(acknowledged.reason, 'acknowledged_po_cannot_be_cancelled');

  const cancelled = planPurchaseOrderAction({ id: 'po_action', status: 'sent', revision: 2, vendor_response: 'pending', vendor_review_token_hash: 'hash' }, { action: 'cancel', actorId: 'usr_admin' });
  assert.equal(cancelled.purchase_order.revision, 3);
  assert.equal(cancelled.purchase_order.vendor_review_token_hash, null);

  const revised = planPurchaseOrderAction({
    id: 'po_action', status: 'sent', revision: 4, vendor_response: 'changes_requested',
    vendor_response_note: 'Change quantity', vendor_review_token_hash: 'old-hash',
    line_items: [{ sku: 'SKU-1', qty: 2 }], total_cost: 20,
  }, { action: 'revise', actorId: 'usr_admin' });
  assert.equal(revised.purchase_order.status, 'draft');
  assert.equal(revised.purchase_order.revision, 5);
  assert.equal(revised.purchase_order.vendor_review_token_hash, null);
  assert.equal(revised.purchase_order.sent_revisions[0].revision, 4);
  assert.equal(revised.purchase_order.sent_revisions[0].vendor_response_note, 'Change quantity');

  const unresolved = planPurchaseOrderAction({ id: 'po_action', status: 'received', line_items: [{ accepted_qty: 2, billed_qty: 1 }] }, { action: 'close', actorId: 'usr_admin' });
  assert.equal(unresolved.reason, 'ap_unresolved');
  const closed = planPurchaseOrderAction({ id: 'po_action', status: 'received', line_items: [{ accepted_qty: 2, billed_qty: 2 }] }, { action: 'close', actorId: 'usr_admin' });
  assert.equal(closed.purchase_order.status, 'closed');
});

test('supplier PO delivery sends only after winning the durable outbox claim', async () => {
  const outbox = { id: 'po-send-outbox', ref_id: 'po_action', status: 'queued', provider: 'customerio' };
  let updateAttempts = 0;
  const sql = async (strings, ...values) => {
    const query = strings.join('?');
    if (query.includes("UPDATE um_rows SET") && query.includes("tbl='gmail_outbox'")) {
      updateAttempts += 1;
      return [];
    }
    if (query.includes('SELECT data FROM um_rows')) {
      const table = values[0];
      if (table === 'gmail_outbox') return [{ data: { ...outbox, status: 'in_flight' } }];
      if (table === 'purchase_orders') return [{ data: { id: 'po_action', revision: 1, status: 'sent' } }];
    }
    throw new Error(`unexpected query: ${query}`);
  };
  const result = await retryVendorPurchaseOrderOutbox(sql, outbox);
  assert.equal(updateAttempts, 1);
  assert.equal(result.claimed, false);
  assert.equal(result.outbox.status, 'in_flight');
});

test('supplier delivery retries require the current sent revision, token, and pending response', () => {
  assert.equal(isVendorPurchaseOrderOutboxClaimable({ status: 'queued' }), true);
  assert.equal(isVendorPurchaseOrderOutboxClaimable({ status: 'retry' }), true);
  assert.equal(isVendorPurchaseOrderOutboxClaimable({ status: 'provider_unknown' }), false);
  assert.equal(isVendorPurchaseOrderOutboxClaimable({ status: 'in_flight' }), false);
  assert.equal(isVendorPurchaseOrderOutboxClaimable({ status: 'dead_letter' }), false);
  const po = {
    id: 'po_delivery', status: 'sent', revision: 3,
    vendor_review_token_hash: 'token-hash', vendor_response: 'pending',
  };
  const outbox = { ref_id: po.id, po_revision: 3, vendor_review_token_hash: 'token-hash' };
  assert.equal(validateVendorPurchaseOrderDelivery(po, outbox).ok, true);
  assert.equal(validateVendorPurchaseOrderDelivery({ ...po, revision: 4 }, outbox).reason, 'purchase_order_revision_changed');
  assert.equal(validateVendorPurchaseOrderDelivery({ ...po, vendor_review_token_hash: 'new-token' }, outbox).reason, 'vendor_review_token_changed');
  assert.equal(validateVendorPurchaseOrderDelivery({ ...po, vendor_response: 'acknowledged' }, outbox).reason, 'vendor_response_final');
  assert.equal(validateVendorPurchaseOrderDelivery({ ...po, status: 'cancelled' }, outbox).reason, 'purchase_order_not_sent');
});

test('supplier review links stay on the configured deployment origin', () => {
  assert.equal(
    buildVendorPurchaseOrderReviewLink({ poId: 'PO-1', token: 'secret token', origin: 'https://staging.unitemedical.net/' }),
    'https://staging.unitemedical.net/vendor/purchase-orders/PO-1?token=secret%20token',
  );
  assert.throws(() => buildVendorPurchaseOrderReviewLink({ poId: 'PO-1', token: 'x', origin: 'http://staging.unitemedical.net' }), /https_origin_required/);
});
