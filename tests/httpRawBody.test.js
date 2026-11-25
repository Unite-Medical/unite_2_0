import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import { readRawBody, verifyStripeSignature } from '../api/_lib/http.js';

const raw = '{\n  "id": "evt_1",\n  "type": "invoice.paid"\n}';

test('readRawBody returns the untouched stream bytes without parsing req.body', async () => {
  const req = Readable.from([Buffer.from(raw)]);
  Object.defineProperty(req, 'body', { get() { throw new Error('req.body must not be read'); } });
  assert.equal((await readRawBody(req)).toString(), raw);
});

test('verifyStripeSignature accepts any matching v1 signature', () => {
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_x').update(`${t}.${raw}`).digest('hex');
  assert.equal(verifyStripeSignature({ header: `t=${t},v1=${sig},v1=deadbeef`, payload: raw, secret: 'whsec_x' }).ok, true);
  assert.equal(verifyStripeSignature({ header: `t=${t},v1=deadbeef,v1=${sig}`, payload: raw, secret: 'whsec_x' }).ok, true);
  assert.equal(verifyStripeSignature({ header: `t=${t},v1=deadbeef`, payload: raw, secret: 'whsec_x' }).reason, 'signature_mismatch');
});
