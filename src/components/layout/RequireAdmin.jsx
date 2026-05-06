import { Navigate, useLocation } from 'react-router-dom';
import { auth } from '../../lib/auth.js';
import { D } from '../../tokens.js';

/**
 * Route guard for /admin/* pages. Redirects unauthenticated users to /login
 * (preserving the destination via `?next=`), and shows a "not authorized"
 * splash for signed-in non-admin users.
 */
export function RequireAdmin({ children }) {
  const session = auth.use();
  const location = useLocation();

  if (!session) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (session.role !== 'admin') {
    return (
      <div style={{ background: D.paper, color: D.ink, fontFamily: D.sans, minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 32 }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.terra, marginBottom: 14 }}>403 · ADMIN ONLY</div>
          <div style={{ fontFamily: D.display, fontSize: 44, letterSpacing: -1.1, lineHeight: 1.05 }}>You don&apos;t have access to this console.</div>
          <p style={{ color: D.ink2, fontSize: 14.5, marginTop: 16, lineHeight: 1.6 }}>
            Signed in as <strong>{session.name}</strong> ({session.role}). Switch to an admin
            account on the sign-in page to continue.
          </p>
          <a href="/login" style={{ display: 'inline-block', marginTop: 22, background: D.plum, color: D.paper, padding: '12px 22px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>Open sign-in</a>
        </div>
      </div>
    );
  }

  return children;
}
