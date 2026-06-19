/**
 * Render the branded React Email templates and send each as a test through
 * Resend. Usage:
 *
 *   npx tsx scripts/send-test-emails.jsx [recipient]
 *
 * Reads RESEND_API_KEY from .env. Tries to send from the branded domain and
 * automatically falls back to Resend's shared onboarding sender if the domain
 * isn't verified yet, so the test always lands.
 */
/* global process */
import React from 'react';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { render } from '@react-email/render';
import { Resend } from 'resend';

import { OrderConfirmation } from '../emails/OrderConfirmation.jsx';
import { Invoice } from '../emails/Invoice.jsx';
import { Quote } from '../emails/Quote.jsx';
import { ShippingUpdate } from '../emails/ShippingUpdate.jsx';
import { VendorOutreach } from '../emails/VendorOutreach.jsx';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, '../.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* no .env — rely on real env */
  }
}

loadEnv();

const TO = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'alex@mavera.io';
const PREFERRED_FROM = 'Unite Medical <sales@unitemedical.net>';
const FALLBACK_FROM = 'Unite Medical <onboarding@resend.dev>';

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('Missing RESEND_API_KEY in .env');
  process.exit(1);
}
const resend = new Resend(apiKey);

const EMAILS = [
  { key: 'order_confirmation', subject: 'Order UM-48201 confirmed — ships today', node: <OrderConfirmation /> },
  { key: 'invoice', subject: 'Invoice INV-20418 — $487.00 due July 12', node: <Invoice /> },
  { key: 'quote', subject: 'Your Unite Medical quote Q-30912 is ready', node: <Quote /> },
  { key: 'shipping_update', subject: 'Your order UM-48201 has shipped', node: <ShippingUpdate /> },
  { key: 'vendor_outreach', subject: 'Unite Medical — supply partnership inquiry', node: <VendorOutreach /> },
];

async function sendOne(from, item) {
  const html = await render(item.node);
  const text = await render(item.node, { plainText: true });
  return resend.emails.send({ from, to: TO, subject: item.subject, html, text });
}

async function dryRun() {
  const outDir = resolve(__dirname, '../emails/preview');
  mkdirSync(outDir, { recursive: true });
  for (const item of EMAILS) {
    const html = await render(item.node);
    const file = resolve(outDir, `${item.key}.html`);
    writeFileSync(file, html);
    console.log(`✓ ${item.key.padEnd(20)} → emails/preview/${item.key}.html (${html.length} bytes)`);
  }
  console.log('\nDry run complete — open the files above in a browser to preview.');
}

async function main() {
  if (process.argv.includes('--dry')) return dryRun();

  let from = PREFERRED_FROM;
  console.log(`Sending ${EMAILS.length} branded test emails to ${TO}\n`);

  for (let i = 0; i < EMAILS.length; i++) {
    const item = EMAILS[i];
    let res = await sendOne(from, item);

    // If the branded domain isn't verified, retry every send via the fallback.
    if (res.error && /domain|not verified|verify/i.test(JSON.stringify(res.error)) && from !== FALLBACK_FROM) {
      console.log(`  ↳ branded domain not verified, switching to ${FALLBACK_FROM}\n`);
      from = FALLBACK_FROM;
      res = await sendOne(from, item);
    }

    if (res.error) {
      console.log(`✗ ${item.key.padEnd(20)} ${JSON.stringify(res.error)}`);
    } else {
      console.log(`✓ ${item.key.padEnd(20)} id=${res.data?.id}`);
    }
    await new Promise((r) => setTimeout(r, 350)); // stay under 5 req/sec
  }

  console.log(`\nFrom: ${from}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
