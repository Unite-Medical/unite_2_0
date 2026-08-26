import { test } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../src/lib/db.js';
import {
  createSourcingRequest,
  recordVendorOffer,
  approveVendorOffer,
  acknowledgePurchaseOrder,
} from '../src/lib/sourcing.js';
import { purchaseOrders } from '../src/lib/wms/purchaseOrders.js';

const NOW = new Date('2026-07-17T12:00:00.000Z');

test('sourcing request emails its account owner and suppresses a duplicate', async () => {
  const ownerEmail = 'owner-checkpoint@unitemedical.net';
  const beforeMail = db.list('gmail_outbox').length;

  const first = await createSourcingRequest({
    source_channel: 'quick_quote',
    organization_id: 'org_checkpoint_sourcing',
    organization_name: 'Checkpoint Surgical',
    contact_email: 'buyer@checkpoint.example',
    account_owner_email: ownerEmail,
    account_owner_name: 'Checkpoint Owner',
    product_description: 'Sterile instrument tray',
    quantity: 20,
  }, { now: NOW });

  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.request.status, 'new');
  assert.equal(db.list('tasks', { where: { ref_id: first.request.id } }).length, 1);
  const ownerMail = db.list('gmail_outbox').filter((row) => row.to_address === ownerEmail);
  assert.equal(ownerMail.length, 1);
  assert.match(ownerMail[0].subject, /New sourcing request/);

  const duplicate = await createSourcingRequest({
    source_channel: 'work_email',
    organization_id: 'org_checkpoint_sourcing',
    organization_name: 'Checkpoint Surgical',
    contact_email: 'buyer@checkpoint.example',
    account_owner_email: ownerEmail,
    product_description: 'Sterile instrument tray',
    quantity: 20,
  }, { now: new Date('2026-07-17T13:00:00.000Z') });

  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.request.id, first.request.id);
  assert.equal(db.list('gmail_outbox').length, beforeMail + 1);
});

test('passive anonymous page view cannot enter the contactable sourcing queue', async () => {
  await assert.rejects(
    createSourcingRequest({
      source_channel: 'anonymous_page_view',
      product_description: 'Browsing only',
      account_owner_email: 'owner@unitemedical.net',
    }, { now: NOW }),
    /contactable source/i,
  );
});

test('approved current vendor offer creates a draft PO that sends only on explicit action', async () => {
  db.insert('vendors', {
    id: 'vendor_checkpoint_approved',
    name: 'Checkpoint Medical Supply',
    contact_email: 'orders@checkpoint-vendor.example',
    status: 'approved',
  });
  const request = (await createSourcingRequest({
    source_channel: 'sales_entry',
    organization_id: 'org_checkpoint_po',
    organization_name: 'Checkpoint Hospital',
    contact_email: 'buyer@checkpoint-hospital.example',
    account_owner_email: 'owner-po@unitemedical.net',
    product_description: 'Compression sleeve',
    quantity: 100,
  }, { now: NOW })).request;

  const normalized = {
    sku: 'COMP-SLEEVE-TEST',
    name: 'Compression sleeve',
    qty: 100,
    unit_price: 7,
    currency: 'USD',
    valid_until: '2026-08-01T00:00:00.000Z',
  };
  const offer = recordVendorOffer({
    sourcing_request_id: request.id,
    vendor_id: 'vendor_checkpoint_approved',
    vendor_name: 'Checkpoint Medical Supply',
    extraction_passes: [normalized, normalized, normalized],
    extraction_confidence: 0.995,
  }, { now: NOW });

  assert.equal(offer.status, 'reviewable');
  const approved = approveVendorOffer(offer.id, { approved_by: 'damon', now: NOW });
  assert.equal(approved.ok, true);
  assert.equal(approved.purchase_order.status, 'draft');
  assert.equal(approved.purchase_order.vendor_offer_id, offer.id);
  assert.equal(approved.purchase_order.sourcing_request_id, request.id);
  assert.equal(db.list('gmail_outbox').some((row) => row.subject?.includes(approved.purchase_order.id)), false);

  const poApproved = purchaseOrders.approve(approved.purchase_order.id, { approved_by: 'damon' });
  assert.equal(poApproved.ok, true);
  const sent = await purchaseOrders.send(approved.purchase_order.id, { sent_by: 'damon' });
  assert.equal(sent.ok, true);
  assert.equal(sent.po.status, 'sent');
  assert.equal(sent.po.vendor_review_token, null);
  assert.ok(sent.po.vendor_review_token_hash);
  const poMail = db.list('gmail_outbox').find((row) => row.subject?.includes(approved.purchase_order.id));
  assert.ok(poMail);
  assert.match(poMail.body, /Review purchase order/);
  const tokenMatch = poMail.body.match(/[?&]token=([^\s]+)/);
  assert.ok(tokenMatch);
  const reviewToken = decodeURIComponent(tokenMatch[1]);
  assert.doesNotMatch(JSON.stringify(sent.po), new RegExp(reviewToken));

  const acknowledged = await acknowledgePurchaseOrder(reviewToken, {
    action: 'acknowledge',
    vendor_name: 'Checkpoint Medical Supply',
    now: new Date('2026-07-17T14:00:00.000Z'),
  });
  assert.equal(acknowledged.ok, true);
  assert.equal(acknowledged.purchase_order.vendor_response, 'acknowledged');
  assert.equal(acknowledged.purchase_order.vendor_acknowledged_at, '2026-07-17T14:00:00.000Z');
});

test('expired vendor pricing cannot create a purchase order', async () => {
  db.insert('vendors', {
    id: 'vendor_checkpoint_expired',
    name: 'Expired Offer Vendor',
    status: 'approved',
  });
  const request = (await createSourcingRequest({
    source_channel: 'rfq',
    organization_id: 'org_checkpoint_expired',
    organization_name: 'Expired Buyer',
    contact_email: 'buyer@expired.example',
    account_owner_email: 'owner-expired@unitemedical.net',
    product_description: 'Expired quote line',
    quantity: 5,
  }, { now: NOW })).request;
  const expiredLine = {
    sku: 'EXP-1', name: 'Expired quote line', qty: 5, unit_price: 10,
    currency: 'USD', valid_until: '2026-07-16T00:00:00.000Z',
  };
  const offer = recordVendorOffer({
    sourcing_request_id: request.id,
    vendor_id: 'vendor_checkpoint_expired',
    vendor_name: 'Expired Offer Vendor',
    extraction_passes: [expiredLine, expiredLine, expiredLine],
    extraction_confidence: 1,
  }, { now: NOW });

  const result = approveVendorOffer(offer.id, { approved_by: 'damon', now: NOW });
  assert.deepEqual(result, { ok: false, reason: 'vendor_price_expired' });
});
