import { Navigate, useLocation } from 'react-router-dom';
import { auth } from '../../lib/auth.js';
import { commerceAccessFor } from '../../lib/accessPolicy.js';
import { D } from '../../tokens.js';

export function RequireSession({ children, roles = null, approvedAccount = false }) {
  const session = auth.use();
  const location = useLocation();
  const organization = auth.org();

  if (!session) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (roles && !roles.includes(session.role)) {
    return (
      <div style={{ background: D.paper, color: D.ink, fontFamily: D.sans, minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 32 }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.terra }}>403 · ACCESS RESTRICTED</div>
          <h1 style={{ fontFamily: D.display, fontSize: 42, fontWeight: 400, margin: '12px 0' }}>This account cannot open that workspace.</h1>
          <a href="/dashboard" style={{ color: D.plum }}>Return to dashboard</a>
        </div>
      </div>
    );
  }

  if (approvedAccount && !commerceAccessFor(session, organization).can_order) {
    return (
      <div style={{ background: D.paper, color: D.ink, fontFamily: D.sans, minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 32 }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.terra }}>ACCOUNT REVIEW</div>
          <h1 style={{ fontFamily: D.display, fontSize: 42, fontWeight: 400, margin: '12px 0' }}>Ordering is not enabled yet.</h1>
          <p style={{ color: D.ink2 }}>You can browse products and build a Quick Quote while company approval is pending.</p>
          <a href="/portal/quote" style={{ color: D.plum }}>Open Quick Quote</a>
        </div>
      </div>
    );
  }

  return children;
}
