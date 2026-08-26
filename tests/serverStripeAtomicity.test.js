import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Stripe payment side effects are gated by the winning order CAS', async () => {
  const source = await readFile(new URL('../api/hooks/stripe.js', import.meta.url), 'utf8');
  const gates = source.match(/data->>'last_payment_reference'=\$\{parsed\.canonical_payment_id\}/g) || [];
  assert.ok(gates.length >= 5, `expected downstream order-CAS gates, found ${gates.length}`);
});
