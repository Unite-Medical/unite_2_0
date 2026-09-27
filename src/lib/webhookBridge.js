import { useEffect } from 'react';
import { API_BASE } from './external/_http.js';
import { db } from './db.js';

const CURSOR_KEY = 'um.webhook_bridge.cursor.v2';
const POLL_MS = 20_000;

function cursor() {
  try { return localStorage.getItem(CURSOR_KEY) || ''; } catch { return ''; }
}
function saveCursor(value) {
  try { if (value) localStorage.setItem(CURSOR_KEY, value); } catch { /* private mode */ }
}

/**
 * Hydrate authenticated event metadata for operations visibility.
 * Upstream payloads and domain mutations remain server-only.
 */
export async function drainWebhookEvents() {
  if (!API_BASE) return { drained: 0 };
  try {
    const since = cursor();
    const res = await fetch(`${API_BASE}/hooks/events${since ? `?since=${encodeURIComponent(since)}` : ''}`, { credentials: 'include' });
    if (!res.ok) return { drained: 0 };
    const data = await res.json();
    const events = data?.events || [];
    if (events.length) db.applyRemoteSnapshot({ webhook_events: events });
    saveCursor(data?.latest_cursor);
    return { drained: events.length };
  } catch {
    return { drained: 0 };
  }
}

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
