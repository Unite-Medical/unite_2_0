import { connect } from 'node:http2';

// Restore's load balancer rejects HTTP/1.1 with status 464. Use native HTTP/2
// explicitly instead of relying on the Node runtime's default fetch protocol.
export function restoreHttp2Response(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const signal = options.signal || AbortSignal.timeout(15000);
    if (signal.aborted) return reject(new Error('restore_feed_timeout'));
    const client = connect(target.origin, { settings: { enablePush: false } });
    let request, settled = false;
    function finish(error, result) {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      request?.close();
      client.destroy();
      if (error) reject(error); else resolve(result);
    }
    function abort() { finish(new Error('restore_feed_timeout')); }
    signal.addEventListener('abort', abort, { once: true });
    client.on('error', () => finish(new Error('restore_feed_network_error')));
    try {
      request = client.request({ ':method': 'GET', ':path': target.pathname + target.search, ...options.headers });
    } catch {
      return finish(new Error('restore_feed_network_error'));
    }
    let status = 0, size = 0;
    const chunks = [];
    request.on('response', headers => { status = Number(headers[':status']); });
    request.on('data', chunk => {
      size += chunk.length;
      if (size > 16384) return finish(new Error('restore_feed_oversized'));
      chunks.push(chunk);
    });
    request.on('error', () => finish(new Error('restore_feed_network_error')));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      finish(null, { ok: status >= 200 && status < 300, status, json: async () => {
        try { return JSON.parse(body); } catch { throw new Error('restore_feed_invalid_json'); }
      } });
    });
    request.on('close', () => { if (!settled) finish(new Error('restore_feed_network_error')); });
    request.end();
  });
}
