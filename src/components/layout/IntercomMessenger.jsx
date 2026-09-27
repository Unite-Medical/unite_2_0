import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { auth } from '../../lib/auth.js';
import { createMessenger, messengerAllowed } from '../../lib/intercomMessenger.js';

let messenger;

export function IntercomMessenger() {
  const { pathname, search, hash } = useLocation();
  const session = auth.use();
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
    messenger ||= createMessenger(window, document, 'w9bdofob');
    if (previousPrincipal.current !== principal) messenger.reset();
    previousPrincipal.current = principal;
    messenger.sync(window.location);
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
  }, [pathname, search, hash, principal, customer]);
  return null;
}
