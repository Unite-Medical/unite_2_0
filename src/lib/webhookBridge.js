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
import { API_BASE } from './external/_http.js';
import { ingestEvent, processDue } from './webhookBus.js';

const SEQ_KEY = 'um.webhook_bridge.seq.v1';
const POLL_MS = 20_000;

function lastSeq() {
  try { return Number(localStorage.getItem(SEQ_KEY)) || 0; } catch { return 0; }
}
function saveSeq(seq) {
  try { localStorage.setItem(SEQ_KEY, String(seq)); } catch { /* private mode */ }
}

/**
 * Poll the serverless buffer and hand every event to the durable bus
 * (idempotent record → dispatch → retry/dead-letter). Also drives the
 * retry timer for events that previously failed.
 */
export async function drainWebhookEvents() {
  // Always advance any due retries, even when offline.
  let retried = 0;
  try { retried = await processDue(); } catch { /* non-fatal */ }

  if (!API_BASE) return { drained: 0, retried };
  let data;
  try {
    const res = await fetch(`${API_BASE}/hooks/events?since=${lastSeq()}`);
    if (!res.ok) return { drained: 0, retried };
    data = await res.json();
  } catch {
    return { drained: 0, retried }; // dev server / offline
  }
  const events = data?.events || [];
  for (const evt of events) {
    try { await ingestEvent(evt); } catch { /* bus records failures itself */ }
    if (evt.seq != null) saveSeq(evt.seq);
  }
  return { drained: events.length, retried };
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
