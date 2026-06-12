/**
 * Webhook bridge — PRD-01 interim.
 *
 * The serverless receivers (/api/hooks/*) verify upstream signatures
 * and buffer events. This bridge polls GET /api/hooks/events from the
 * signed-in admin's browser and dispatches each event to the existing
 * client-side handler, which applies the same DB mutations a
 * server-side worker will once Postgres lands:
 *
 *   stripe.*       → stripe.handleWebhookEvent     (invoice paid, PI succeeded)
 *   flexport.*     → flexport.handleWebhookEvent   (cleared → receiving chain)
 *   shipstation.*  → shipstation.handleWebhookEvent
 *   fathom.*       → fathom.handleCallCompleted    (AI extraction → HubSpot tasks)
 *   calendly.*     → calendly.handleWebhookEvent   (booking → CRM activity)
 *
 * Poll cadence is 20s while an admin tab is focused — cheap, and the
 * function returns in single-digit ms when the buffer is empty.
 */

import { useEffect } from 'react';
import { API_BASE, warn } from './external/_http.js';
import { stripe } from './external/stripe.js';
import { flexport } from './external/flexport.js';
import { shipstation } from './external/shipstation.js';
import { fathom } from './external/fathom.js';
import { calendly } from './external/calendly.js';

const SEQ_KEY = 'um.webhook_bridge.seq.v1';
const POLL_MS = 20_000;

function lastSeq() {
  try { return Number(localStorage.getItem(SEQ_KEY)) || 0; } catch { return 0; }
}
function saveSeq(seq) {
  try { localStorage.setItem(SEQ_KEY, String(seq)); } catch { /* private mode */ }
}

async function dispatch(evt) {
  const { source, payload } = evt;
  if (source === 'stripe') return stripe.handleWebhookEvent(payload);
  if (source === 'flexport') return flexport.handleWebhookEvent(payload);
  // ShipStation events arrive hydrated as { notice, resource }; the
  // client dispatcher consumes the original notice shape.
  if (source === 'shipstation') return shipstation.handleWebhookEvent(payload?.notice || payload);
  if (source === 'fathom') return fathom.handleCallCompleted(payload);
  if (source === 'calendly') return calendly.handleWebhookEvent(payload);
  return { ok: false, reason: `unknown_source_${source}` };
}

export async function drainWebhookEvents() {
  if (!API_BASE) return { drained: 0 };
  let data;
  try {
    const res = await fetch(`${API_BASE}/hooks/events?since=${lastSeq()}`);
    if (!res.ok) return { drained: 0 };
    data = await res.json();
  } catch {
    return { drained: 0 }; // dev server / offline — nothing to drain
  }
  const events = data?.events || [];
  for (const evt of events) {
    try {
      await dispatch(evt);
    } catch (err) {
      warn('webhookBridge', `dispatch ${evt.source}/${evt.type} failed: ${err.message}`);
    }
    saveSeq(evt.seq);
  }
  return { drained: events.length };
}

/** Mount once inside the admin shell. */
export function useWebhookBridge(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    const tick = () => { if (!stopped && document.visibilityState === 'visible') drainWebhookEvents(); };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { stopped = true; clearInterval(id); };
  }, [enabled]);
}
