import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { auth } from '../../lib/auth.js';
import { createMessenger, messengerAllowed } from '../../lib/intercomMessenger.js';

let messenger;

export function IntercomMessenger() {
  const { pathname, search, hash } = useLocation();
  const session = auth.use();
  const [requested, setRequested] = useState(false);
  const openPending = useRef(false);
  const allowed = messengerAllowed(window.location);
  const customer = ['customer', 'distributor'].includes(session?.role);
  const principal = session ? `${session.user_id}:${session.org_id}:${session.role}:${session.session_revision || 0}` : 'anonymous';
  const previousPrincipal = useRef(principal);
  useEffect(() => {
    const onStorage = (event) => {
      if (['um.session.v1', 'um.logout.pending.v1'].includes(event.key)) {
        messenger?.reset();
        auth.bootstrap();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => {
    if (!requested || !allowed) { messenger?.reset(); return; }
    messenger ||= createMessenger(window, document, 'w9bdofob', {onError: () => setRequested(false)});
    if (previousPrincipal.current !== principal) messenger.reset();
    previousPrincipal.current = principal;
    messenger.sync(window.location);
    if (openPending.current) { window.Intercom?.('show'); openPending.current = false; }
    if (!messengerAllowed(window.location) || !customer) return;
    const controller = new AbortController();
    // Token issuance is disabled server-side until the private connector is approved.
    // These short-lived tokens only authorize the Fin read-only staging API.
    const refresh = async () => {
      try {
        window.Intercom?.('setAuthTokens', { unite_customer_token: '' });
        const response = await fetch('/api/fin/customer-token', { method: 'POST', credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        if (!controller.signal.aborted && typeof data.token === 'string') {
          window.Intercom?.('setAuthTokens', { unite_customer_token: data.token });
        }
      } catch { /* Anonymous chat remains available when verification is unavailable. */ }
    };
    refresh();
    const timer = setInterval(refresh, 10 * 60 * 1000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [pathname, search, hash, principal, customer, requested, allowed]);
  return allowed && !requested ? <button className={`um-chat-launcher${pathname === '/' ? ' is-home' : ''}`} onClick={() => {openPending.current = true; setRequested(true);}} aria-label="Chat with Unite"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.5-.7L4 20l1.2-4.5A8 8 0 1 1 20 11.5Z"/><path d="M8 10h8M8 14h5"/></svg><span className="um-chat-label">Chat with Unite</span></button> : null;
}
