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
export { shopify } from './external/shopify.js';
export { qbo } from './external/qbo.js';
export { stripe } from './external/stripe.js';
export { hubspot } from './external/hubspot.js';
// PRD-25: UniteWMS replaces the Cin7 dependency as the system of record for
// stock. The external/cin7.js client stays for legacy inventory-sync screens
// but is NO LONGER re-exported here — import it directly where still needed.
export { gs1 } from './external/gs1.js';
export { fathom } from './external/fathom.js';
export { importgenius } from './external/importgenius.js';
// PRD-05 / brief §5 — email + scheduling.
//
// Email: `gmail.send` is provider-agnostic via the mailer chain
// (Resend primary → Gmail fallback → local outbox). Callers keep using
// `gmail.send(...)`; the Gmail-specific inbox methods (listInbox,
// getMessage) still come from the real Gmail client. Set RESEND_API_KEY
// to send for real — no call-site changes.
//
// Calendar: Calendly is the primary scheduler (real booking, links, and
// webhook → calendar_events/CRM). Google Calendar (`gcal`) is OPTIONAL
// and only needed if you also want events mirrored into a Google
// Calendar; nothing in the app requires it.
import { gmail as gmailClient } from './external/gmail.js';
import { mailer } from './mailer.js';

export const gmail = { ...gmailClient, send: mailer.send };
export const email = mailer;
export { mailer };
export { resend } from './external/resend.js';
export { gcal } from './external/gcal.js';
export { calendly } from './external/calendly.js';
// PRD-12 Phase 2 — Prophet forecasting sidecar (forecasting/) via the
// backend proxy; replenishment swaps run-rate math for these horizons.
export { forecast } from './external/forecast.js';

// PRD-25 — UniteWMS, the native warehouse management system. The ledger is the
// single source of truth for stock; everything else reads availability.
export { ledger } from './wms/ledger.js';
export { availability } from './wms/availability.js';
export { reservations } from './wms/reservations.js';
export { lots } from './wms/lots.js';
export { purchaseOrders } from './wms/purchaseOrders.js';
export { picking } from './wms/picking.js';
export { packing } from './wms/packing.js';
export { shipping } from './wms/shipping.js';
export { transfers } from './wms/transfers.js';
export { counts } from './wms/counts.js';
export { adjustments } from './wms/adjustments.js';
export { bundles } from './wms/bundles.js';
export { access as wmsAccess } from './wms/access.js';

import { uid } from './format.js';
import { ai } from './ai/client.js';

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
