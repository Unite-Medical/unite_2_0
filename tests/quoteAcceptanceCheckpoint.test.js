import { test } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../src/lib/db.js';
import {
  acceptQuote,
  requestSignerVerification,
  verifySignerCode,
} from '../src/lib/quoteAcceptance.js';

test('quote acceptance requires verified signer evidence and binding acknowledgment', async () => {
  const quoteId = 'quote_signer_checkpoint';
  const token = 'token_signer_checkpoint';
  db.insert('quotes', {
    id: quoteId,
    acceptance_token: token,
    status: 'sent',
    customer_id: 'org_signer_checkpoint',
    customer_name: 'Signer Hospital',
    contact_email: 'signer@hospital.test',
    total: 100,
    valid_until: '2099-01-01T00:00:00.000Z',
    revision: 2,
  });
  db.insert('quote_items', {
    id: 'quote_signer_line', quote_id: quoteId, sku: 'SIGNER-SKU', name: 'Signer item',
    target_qty: 2, sell_per_unit: 50, ext_sell: 100,
  });

  const blocked = await acceptQuote(token, { bindingAcknowledged: true, poNumber: 'PO-123' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'signer_verification_required');

  const challenge = await requestSignerVerification(token, 'signer@hospital.test', {
    code: '123456', now: new Date('2026-07-17T12:00:00.000Z'),
  });
  assert.equal(challenge.ok, true);
  assert.equal((await verifySignerCode(challenge.challenge_id, '000000', { now: new Date('2026-07-17T12:01:00.000Z') })).ok, false);
  assert.equal((await verifySignerCode(challenge.challenge_id, '123456', { now: new Date('2026-07-17T12:01:00.000Z') })).ok, true);

  const accepted = await acceptQuote(token, {
    challengeId: challenge.challenge_id,
    bindingAcknowledged: true,
    signerName: 'Alex Buyer',
    signerTitle: 'Purchasing Director',
    signerEmail: 'signer@hospital.test',
    poNumber: 'PO-123',
    userAgent: 'node-test',
    ipAddress: '192.0.2.10',
    now: new Date('2026-07-17T12:02:00.000Z'),
  });

  assert.equal(accepted.ok, true);
  assert.equal(accepted.order.payment_status, 'pending');
  assert.equal(accepted.order.status, 'payment_pending');
  assert.equal(accepted.order.po_number, 'PO-123');
  const evidence = accepted.quote.acceptance_evidence;
  assert.equal(evidence.signer_name, 'Alex Buyer');
  assert.equal(evidence.signer_email, 'signer@hospital.test');
  assert.equal(evidence.quote_revision, 2);
  assert.equal(evidence.binding_acknowledged, true);
  assert.ok(evidence.accepted_lines_hash);
});

test('verification code can only be sent to an authorized quote signer email', async () => {
  const result = await requestSignerVerification('token_signer_checkpoint', 'attacker@example.test', { code: '654321' });
  assert.deepEqual(result, { ok: false, reason: 'unauthorized_signer_email' });
});
