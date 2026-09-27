import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRestoreFeed, fetchRestoreFeed, refreshRestoreSavings } from '../api/_lib/restoreFeed.js';
import { publicRestoreSnapshot } from '../api/_lib/restoreSavings.js';
import { createRestoreRefreshHandler } from '../api/internal/restore-savings-refresh.js';
import { savingsDisplay } from '../src/lib/roboticsSavings.js';

test('parses the documented amount, zero and ungrouped dollars; rejects malformed and unsafe totals', () => {
  for (const [savings, total] of [['$1,411,198.32', 1411198.32], ['$0.00', 0], ['$1234.56', 1234.56]]) {
    const snapshot = parseRestoreFeed({ savings }, new Date('2026-09-25T11:00:00Z'));
    assert.deepEqual(snapshot, { total_savings_usd: total, checked_at: '2026-09-25T11:00:00.000Z' });
  }
  for (const savings of [null, 1411198.32, '', '$-1.00', '$1,41,198.32', '$12.345', '$12.00junk', '$900719925474099.12']) {
    assert.throws(() => parseRestoreFeed({ savings }), /invalid_restore_amount/);
  }
});

test('uses required headers, a bounded timeout and refuses redirects', async () => {
  const result = await fetchRestoreFeed('test-only-token', async (url, options) => {
    assert.equal(url, 'https://restorerobotics.net/unite-savings.json');
    assert.equal(options.headers.Authorization, 'Bearer test-only-token');
    assert.equal(options.headers['User-Agent'], 'Mozilla');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => ({ savings: '$1,411,198.32' }) };
  });
  assert.equal(result.total_savings_usd, 1411198.32);
});

function fakeDatabase(claimed = true) {
  const queries = [], transactions = [];
  const sql = (strings, ...values) => {
    const query = { text: strings.join('?'), values };
    queries.push(query);
    if (query.text.includes('RETURNING key')) return claimed ? [{ key: 'restore_savings_refresh' }] : [];
    return query;
  };
  sql.transaction = async queries => { transactions.push(queries); return queries.map(() => []); };
  return { sql, queries, transactions };
}

test('persists the validated snapshot and successful day together; repeat job never calls upstream', async () => {
  const db = fakeDatabase();
  const result = await refreshRestoreSavings(db.sql, 'test', async () => ({ ok: true, json: async () => ({ savings: '$1,411,198.32' }) }));
  assert.equal(result.updated, true);
  assert.equal(db.transactions.length, 1);
  assert.equal(db.transactions[0].length, 2);
  const stored = JSON.parse(db.transactions[0][0].values[0]);
  assert.equal(stored.total_savings_usd, 1411198.32);
  assert.equal(stored.as_of, undefined);
  assert.match(db.queries[1].text, /interval '15 minutes'/);
  assert.match(db.queries[1].text, /successful_day/);
  const repeated = fakeDatabase(false);
  const skipped = await refreshRestoreSavings(repeated.sql, 'test', () => assert.fail('must not poll again'));
  assert.equal(skipped.updated, false);
  assert.equal(repeated.transactions.length, 0);
});

test('HTTP, network and malformed response failures never overwrite the stored amount', async () => {
  for (const fetcher of [
    async () => ({ ok: false, status: 401 }),
    async () => { throw new Error('network failure'); },
    async () => ({ ok: true, json: async () => ({ savings: 'broken' }) }),
    async () => ({ ok: true, json: async () => { throw new Error('invalid JSON'); } }),
  ]) {
    const db = fakeDatabase();
    await assert.rejects(refreshRestoreSavings(db.sql, 'test', fetcher));
    assert.equal(db.transactions.length, 0);
    assert.equal(db.queries.length, 2);
  }
});

test('public data exposes a check date, never invents a source date or exposes extra fields', () => {
  const snapshot = parseRestoreFeed({ savings: '$1,411,198.32' }, new Date('2026-09-25T11:00:00Z'));
  const visible = publicRestoreSnapshot({ ...snapshot, token: 'private', breakdown: 'private' }, snapshot.checked_at);
  assert.deepEqual(Object.keys(visible).sort(), ['checked_at', 'ok', 'total_savings_usd', 'updated_at']);
  assert.equal(savingsDisplay(visible).value, '$1,411,198');
  assert.equal(savingsDisplay(visible).detail, 'Last checked Sep 25, 2026 · Updates daily');
  assert.equal(publicRestoreSnapshot({ ...snapshot, checked_at: 'invalid' }).ok, false);
});

const environment = { DATABASE_URL: 'test-db', RESTORE_API_TOKEN: 'test-token', CRON_SECRET: 'test-cron' };
function response() { return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = JSON.parse(body); } }; }
test('refresh requires the cron credential and configuration before accessing the database', async () => {
  for (const [env, method, authorization, status] of [
    [environment, 'POST', 'Bearer test-cron', 405],
    [environment, 'GET', '', 401],
    [environment, 'GET', 'Bearer wrong', 401],
    [{ ...environment, CRON_SECRET: '' }, 'GET', 'Bearer ', 401],
    [{ ...environment, RESTORE_API_TOKEN: '' }, 'GET', 'Bearer test-cron', 503],
  ]) {
    const handler = createRestoreRefreshHandler({ environment: env, connect: () => assert.fail('must not connect') });
    const res = response();
    await handler({ method, headers: { authorization } }, res);
    assert.equal(res.statusCode, status);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
});

test('refresh reports success and returns sanitized failures without credentials', async () => {
  for (const fails of [false, true]) {
    const handler = createRestoreRefreshHandler({ environment, connect: () => 'db', refresh: async (db, token) => {
      assert.equal(db, 'db'); assert.equal(token, 'test-token');
      if (fails) throw new Error('secret failure: test-token');
      return { ok: true, updated: true };
    } });
    const res = response();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-cron' } }, res);
    assert.equal(res.statusCode, fails ? 502 : 200);
    assert.ok(!JSON.stringify(res.body).includes('test-token'));
    if (fails) assert.equal(res.body.previous_snapshot_preserved, true);
  }
});
