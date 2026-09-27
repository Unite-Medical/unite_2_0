import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http2';
import { once } from 'node:events';
import { restoreHttp2Response } from '../api/_lib/restoreHttp2.js';

async function serverFor(t, respond) {
  const server = createServer();
  server.on('stream', respond);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/unite-savings.json`;
}

test('HTTP/2 transport sends the documented auth headers and reads JSON', async t => {
  const url = await serverFor(t, (stream, headers) => {
    assert.equal(headers[':method'], 'GET');
    assert.equal(headers[':path'], '/unite-savings.json');
    assert.equal(headers.authorization, 'Bearer test-only');
    assert.equal(headers['user-agent'], 'Mozilla');
    stream.respond({ ':status': 200 });
    stream.end('{"savings":"$1,411,198.32"}');
  });
  const result = await restoreHttp2Response(url, { headers: { Authorization: 'Bearer test-only', 'User-Agent': 'Mozilla' } });
  assert.equal(result.ok, true);
  assert.deepEqual(await result.json(), { savings: '$1,411,198.32' });
});

test('HTTP/2 transport does not follow redirects or forward credentials to another origin', async t => {
  const url = await serverFor(t, stream => {
    stream.respond({ ':status': 302, location: 'https://example.invalid/redirect' }); stream.end();
  });
  const result = await restoreHttp2Response(url);
  assert.equal(result.ok, false); assert.equal(result.status, 302);
});

test('HTTP/2 transport rejects oversized and malformed responses', async t => {
  for (const body of ['x'.repeat(20000), 'not JSON']) {
    const url = await serverFor(t, stream => { stream.respond({ ':status': 200 }); stream.end(body); });
    if (body.length > 16384) await assert.rejects(restoreHttp2Response(url), /restore_feed_oversized/);
    else await assert.rejects((await restoreHttp2Response(url)).json(), /restore_feed_invalid_json/);
  }
});

test('HTTP/2 transport cancels stalled connections', async t => {
  const url = await serverFor(t, () => {});
  await assert.rejects(restoreHttp2Response(url, { signal: AbortSignal.timeout(50) }), /restore_feed_timeout/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(restoreHttp2Response(url, { signal: controller.signal }), /restore_feed_timeout/);
});
