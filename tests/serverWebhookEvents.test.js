import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { buildWebhookEvent, eventsSince } from '../api/_lib/events.js';

const input = {
  source: 'shopify', type: 'orders/create', verified: true,
  payload: { id: 'upstream-event-1', customer: { email: 'private@example.test' }, total: 100 },
};

test('verified webhook identities are deterministic and bind source plus upstream ID', () => {
  const first = buildWebhookEvent({ ...input, now: new Date('2026-07-19T12:00:00.000Z') });
  const replay = buildWebhookEvent({ ...input, now: new Date('2026-07-19T12:01:00.000Z') });
  const other = buildWebhookEvent({ ...input, payload: { ...input.payload, id: 'upstream-event-2' } });
  assert.equal(first.id, replay.id);
  assert.notEqual(first.id, other.id);
  assert.equal(first.status, 'pending');
  assert.throws(() => buildWebhookEvent({ ...input, verified: false }), /verified_webhook_event_required/);
});

test('authenticated event feed projection never returns upstream payloads', async () => {
  const event = buildWebhookEvent(input);
  const sql = async () => [{ data: event, updated_at: '2026-07-19T12:00:01.000Z' }];
  const projected = await eventsSince(sql, null);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].id, event.id);
  assert.equal('payload' in projected[0], false);
  assert.doesNotMatch(JSON.stringify(projected), /private@example\.test/);
});

test('event feed is live-admin authorized and verified receivers await durable persistence', async () => {
  const feed = await readFile(new URL('../api/hooks/events.js', import.meta.url), 'utf8');
  assert.match(feed, /authorizeLiveRequest/);
  assert.match(feed, /roles: \['admin'\]/);
  const hooksRoot = new URL('../api/hooks/', import.meta.url);
  const names = (await readdir(hooksRoot)).filter((name) => name.endsWith('.js'));
  for (const name of names) {
    const source = await readFile(new URL(name, hooksRoot), 'utf8');
    if (!source.includes('pushEvent(')) continue;
    assert.match(source, /await pushEvent\(/, name);
  }
});
