import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import process from 'node:process';
import { Buffer } from 'node:buffer';

import { buildTransactionalEmail } from '../src/lib/external/customerio.js';
import { applyCustomerIoTelemetry, authorizeCustomerIoWebhook, normalizeCustomerIoEvent } from '../api/hooks/customerio.js';
import { providerMessageFields } from '../src/lib/mailer.js';
import {
  buildCustomerIoOutbox,
  nextCustomerIoOutboxState,
  nextStaleCustomerIoClaimState,
  recoverCustomerIoOutbox,
} from '../api/_lib/customerioOutbox.js';

test('Customer.io transactional payload uses a trigger name and verified email identifier', () => {
  const payload = buildTransactionalEmail({
    to: 'buyer@example.test',
    from: 'support@unitemedical.net',
    subject: 'Order ready',
    body: 'Your order is ready.',
    template_key: 'order/ready',
    message_data: { order_id: 'order_123' },
  });
  assert.equal(payload.transactional_message_id, 'order_ready');
  assert.equal(payload.auto_create, true);
  assert.deepEqual(payload.identifiers, { email: 'buyer@example.test' });
  assert.equal(payload.to, 'buyer@example.test');
  assert.equal(payload.send_to_unsubscribed, true);
  assert.equal(payload.message_data.order_id, 'order_123');
});

test('mailer preserves provider message ID for Customer.io webhook correlation', () => {
  assert.deepEqual(providerMessageFields('customerio', 'cio_delivery_123'), {
    provider_message_id: 'cio_delivery_123',
    gmail_message_id: null,
    customerio_message_id: 'cio_delivery_123',
  });
});

test('Customer.io reporting event preserves delivery evidence and privacy-proxy flags', () => {
  const event = normalizeCustomerIoEvent({
    event_id: 'cio_event_1',
    metric: 'opened',
    delivery_type: 'email',
    message_id: 'cio_message_1',
    recipient: 'buyer@example.test',
    transactional_message_id: 'order_ready',
    prefetched: true,
    proxied: true,
    machine: false,
    timestamp: 1784304000,
  });

  assert.equal(event.id, 'cio_event_1');
  assert.equal(event.kind, 'email_opened');
  assert.equal(event.message_id, 'cio_message_1');
  assert.equal(event.recipient, 'buyer@example.test');
  assert.equal(event.prefetched, true);
  assert.equal(event.proxied, true);
  assert.equal(event.conclusive_human_open, false);
});

test('Customer.io outbox is deterministic and reaches retry, provider-unknown, sent, and dead-letter states', () => {
  const row = buildCustomerIoOutbox({
    idempotency_key: 'order:123:shipped', to: 'Buyer@Example.test',
    transactional_message_id: 'order_shipped', subject: 'Shipped', body: 'On the way',
    message_data: { order_id: '123' }, now: new Date('2026-07-19T12:00:00.000Z'),
  });
  assert.equal(row.id, buildCustomerIoOutbox({ idempotency_key: 'order:123:shipped', to: 'buyer@example.test' }).id);
  assert.equal(row.message_data.unite_outbox_id, row.id);
  const retry = nextCustomerIoOutboxState(row, { ok: false, reason: 'customerio_send_failed' }, { now: new Date('2026-07-19T12:01:00.000Z') });
  assert.equal(retry.status, 'retry');
  const unknown = nextCustomerIoOutboxState(retry, { ok: false, reason: 'customerio_unreachable' }, { now: new Date('2026-07-19T12:02:00.000Z') });
  assert.equal(unknown.status, 'provider_unknown');
  const sent = nextCustomerIoOutboxState(unknown, { ok: true, provider_message_id: 'cio_123' }, { now: new Date('2026-07-19T12:03:00.000Z') });
  assert.equal(sent.status, 'sent');
  assert.equal(sent.provider_message_id, 'cio_123');
  const dead = nextCustomerIoOutboxState({ ...row, attempts: 7 }, { ok: false, reason: 'customerio_send_failed' }, { maxAttempts: 8 });
  assert.equal(dead.status, 'dead_letter');
  assert.equal(dead.next_retry_at, null);
});

test('Customer.io webhook rejects query tokens and accepts the provider v0 HMAC protocol', () => {
  const prior = process.env.CUSTOMERIO_WEBHOOK_SIGNING_SECRET;
  process.env.CUSTOMERIO_WEBHOOK_SIGNING_SECRET = 'customerio-test-signing-secret';
  const now = Date.parse('2026-07-19T12:00:00.000Z');
  const timestamp = String(Math.floor(now / 1000));
  const body = Buffer.from('{"event_id":"event_1"}');
  const signature = crypto.createHmac('sha256', process.env.CUSTOMERIO_WEBHOOK_SIGNING_SECRET)
    .update(`v0:${timestamp}:${body.toString('utf8')}`).digest('hex');
  assert.equal(authorizeCustomerIoWebhook({ headers: {}, query: { token: process.env.CUSTOMERIO_WEBHOOK_SIGNING_SECRET } }, body, { now }).ok, false);
  assert.equal(authorizeCustomerIoWebhook({ headers: { 'x-cio-timestamp': timestamp, 'x-cio-signature': signature } }, body, { now }).ok, true);
  assert.equal(authorizeCustomerIoWebhook({ headers: { 'x-cio-timestamp': timestamp, 'x-cio-signature': signature } }, body, { now: now + 10 * 60 * 1000 }).ok, false);
  if (prior === undefined) delete process.env.CUSTOMERIO_WEBHOOK_SIGNING_SECRET;
  else process.env.CUSTOMERIO_WEBHOOK_SIGNING_SECRET = prior;
});

test('Customer.io event IDs bind one payload and older telemetry cannot regress the latest state', () => {
  const delivered = normalizeCustomerIoEvent({ event_id: 'event_same', metric: 'delivered', timestamp: 1784462400 });
  const changed = normalizeCustomerIoEvent({ event_id: 'event_same', metric: 'bounced', timestamp: 1784462400 });
  assert.notEqual(delivered.payload_hash, changed.payload_hash);

  const latest = applyCustomerIoTelemetry({}, {
    metric: 'delivered', occurred_at: '2026-07-19T12:00:00.000Z', prefetched: false, proxied: false, machine: false,
  }, { now: new Date('2026-07-19T12:00:01.000Z') });
  const replayedOlder = applyCustomerIoTelemetry(latest, {
    metric: 'opened', occurred_at: '2026-07-19T11:59:00.000Z', prefetched: false, proxied: false, machine: false,
  }, { now: new Date('2026-07-19T12:00:02.000Z') });
  assert.deepEqual(replayedOlder, latest);
});

test('Customer.io provider envelope normalizes nested delivery evidence', () => {
  const event = normalizeCustomerIoEvent({
    event_id: 'cio_provider_event_1',
    metric: 'delivered',
    timestamp: 1784462400,
    data: {
      delivery_id: 'cio_delivery_1',
      recipient: 'buyer@example.test',
      transactional_message_id: 'order_ready',
      message_data: { unite_outbox_id: 'cio_outbox_1' },
    },
  });
  assert.equal(event.message_id, 'cio_delivery_1');
  assert.equal(event.outbox_id, 'cio_outbox_1');
  assert.equal(event.recipient, 'buyer@example.test');
  assert.equal(event.transactional_message_id, 'order_ready');
});

test('stale Customer.io claims become provider-unknown instead of automatic retries', () => {
  const row = {
    ...buildCustomerIoOutbox({ idempotency_key: 'stale:1', to: 'buyer@example.test' }),
    status: 'in_flight', claim_token: 'claim_1', claimed_at: '2026-07-19T11:00:00.000Z',
  };
  const next = nextStaleCustomerIoClaimState(row, { now: new Date('2026-07-19T12:00:00.000Z') });
  assert.equal(next.status, 'provider_unknown');
  assert.equal(next.next_retry_at, null);
  assert.equal(next.claim_token, null);
});

test('provider-unknown and dead-letter recovery requires attributable evidence', () => {
  const unknown = { ...buildCustomerIoOutbox({ idempotency_key: 'recover:1', to: 'buyer@example.test' }), status: 'provider_unknown' };
  assert.throws(
    () => recoverCustomerIoOutbox(unknown, { action: 'retry', actor_id: 'admin_1', reason: 'try again' }),
    /evidence_required/,
  );
  const retry = recoverCustomerIoOutbox(unknown, {
    action: 'retry', actor_id: 'admin_1', reason: 'Provider confirms no delivery',
    evidence: 'Customer.io delivery search returned no match', now: new Date('2026-07-19T12:00:00.000Z'),
  });
  assert.equal(retry.status, 'queued');
  assert.equal(retry.recovery.actor_id, 'admin_1');
  const sent = recoverCustomerIoOutbox(unknown, {
    action: 'mark_sent', actor_id: 'admin_1', reason: 'Provider accepted before timeout',
    evidence: 'Customer.io delivery cio_123', provider_message_id: 'cio_123',
    now: new Date('2026-07-19T12:00:00.000Z'),
  });
  assert.equal(sent.status, 'sent');
  assert.equal(sent.provider_message_id, 'cio_123');
});
