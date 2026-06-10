/**
 * External-service compatibility shim.
 *
 * All real clients live under `./external/*.js` — that's where each
 * upstream's auth, endpoints, error handling, and stub fallback live.
 * This file is a thin re-export so legacy call sites
 * (`import { qbo, stripe, ... } from './services.js'`) keep working
 * unchanged.
 *
 * When the backend lands (PRD-01), each external client gains a
 * `VITE_API_BASE`-based proxy mode and flips from stub to real
 * without any of the call sites needing to know.
 */

export { openfda } from './external/openfda.js';
export { hts } from './external/hts.js';
export { flexport } from './external/flexport.js';
export { shipstation } from './external/shipstation.js';
export { qbo } from './external/qbo.js';
export { stripe } from './external/stripe.js';
export { hubspot } from './external/hubspot.js';
export { cin7 } from './external/cin7.js';
export { gs1 } from './external/gs1.js';
export { fathom } from './external/fathom.js';
export { importgenius } from './external/importgenius.js';

import { db } from './db.js';
import { uid, delay } from './format.js';
import { ai } from './ai/client.js';

// ---------- Gmail / Resend (transactional outbox) ----------
// PRD-05 §4.2: transactional mail flows through Resend in production.
// Reading inbound shared inboxes (`info@`, `sales@`, `support@`) is a
// separate read-only Gmail API integration also covered by PRD-05.
// For dev we still just write to the `gmail_outbox` table.

export const gmail = {
  async send({ to, subject, body, from = 'sales@unitemedical.net', template_key, drafted_by = 'human' }) {
    await delay(160, 320);
    const row = db.insert('gmail_outbox', {
      id: `gm_${uid().slice(3)}`,
      to_address: to,
      from_address: from,
      subject,
      body,
      body_format: 'text',
      status: 'queued',
      drafted_by,
      template_key,
      created_at: new Date().toISOString(),
    });
    return row;
  },
};

// ---------- Claude — routed through the prompt registry (PRD-11) ----------
// Thin compat shim: legacy callers use these named methods, the
// implementation flows through `./ai/client.js` so the prompts
// live in the canonical `prompts/` directory and usage is tracked.

export const claude = {
  async generateQuoteLetter({ customer_name, contact_name, product_count, total_usd, eta_iso }) {
    const eta_human = new Date(eta_iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const { data } = await ai.run('quoting/cover_letter', {
      input: {
        customer_name,
        contact_name,
        contact_first: contact_name?.split(' ')[0] || '',
        product_count,
        total_usd_formatted: total_usd?.toLocaleString() ?? String(total_usd ?? ''),
        eta_human,
        freight_mode: 'LCL',
        freight_lane: 'CN → GA',
        margin_tier: 'standard',
      },
      source: 'quoting-engine',
    });
    return { id: `msg_${uid().slice(3)}`, content: data.content };
  },
  async classifyHTS({ product_name }) {
    const { data } = await ai.run('quoting/hts_classify', {
      input: { product_name },
      source: 'quoting-engine',
    });
    if (data?.primary?.code) return { content: data.primary.code, full: data };
    return { content: data?.content || '' };
  },
};
