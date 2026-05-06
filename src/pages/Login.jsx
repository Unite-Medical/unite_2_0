import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { D } from '../tokens.js';
import { UMLogo } from '../components/shared/Logo.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { auth } from '../lib/auth.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');
  const { isMobile } = useViewport();
  useSEO({ title: 'Sign in', description: 'Sign in to your Unite Medical B2B account.', canonical: '/login', noindex: true });
  const [email, setEmail] = useState('sarah@atlanta-surgical.com');
  const [password, setPassword] = useState('demo');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function destinationFor(session) {
    if (next && next.startsWith('/')) return next;
    return session.role === 'admin' ? '/admin' : '/dashboard';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null); setSubmitting(true);
    try {
      const session = await auth.login(email, password);
      navigate(destinationFor(session));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemoAdmin() {
    setError(null); setSubmitting(true);
    setEmail('damon@unitemedical.com');
    setPassword('admin');
    try {
      const session = await auth.login('damon@unitemedical.com', 'admin');
      navigate(next && next.startsWith('/') ? next : '/admin');
      void session;
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
      <div style={{ padding: isMobile ? '32px 22px 56px' : '64px 72px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: isMobile ? 28 : 0 }}>
        <Link to="/"><UMLogo size={isMobile ? 26 : 32} color={D.ink} weight={600} /></Link>
        <form onSubmit={handleSubmit} style={{ maxWidth: 420, width: '100%' }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 18 }}>SIGN IN · B2B PORTAL</div>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(40px, 8vw, 68px)', fontWeight: 400, letterSpacing: -1.6, lineHeight: 1.0, margin: 0 }}>
            Welcome <Grad>back</Grad>.
          </h1>
          <p style={{ fontSize: 15, color: D.ink2, marginTop: 18, lineHeight: 1.55 }}>
            Your net-30 terms, saved lists, and dedicated rep — all behind one login.
          </p>
          <div style={{ marginTop: 32 }}>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>WORK EMAIL</div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', marginTop: 6, padding: '14px 16px', background: D.card, border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 14, color: D.ink, outline: 'none' }}
              />
            </label>
            <label style={{ display: 'block' }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>PASSWORD</div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', marginTop: 6, padding: '14px 16px', background: D.card, border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 14, color: D.ink, outline: 'none' }}
              />
            </label>
            {error && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#fbe9e1', color: '#7a2d10', fontSize: 13 }}>{error}</div>}
            <button type="submit" disabled={submitting} style={{ marginTop: 18, width: '100%', background: D.plum, color: D.paper, border: 'none', padding: 14, borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={handleDemoAdmin}
              disabled={submitting}
              style={{ marginTop: 10, width: '100%', background: D.ink, color: D.paper, border: 'none', padding: 13, borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              Open admin console <span aria-hidden="true">→</span>
            </button>
            <div style={{ marginTop: 14, padding: 12, background: D.paperAlt, border: `1px dashed ${D.line}`, borderRadius: 10, fontSize: 12, color: D.ink2, lineHeight: 1.6 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>DEMO ACCOUNTS</div>
              <div>Customer · sarah@atlanta-surgical.com / <code>demo</code></div>
              <div>Pharmacy · kareem@holloway.com / <code>demo</code></div>
              <div>Admin · damon@unitemedical.com / <code>admin</code></div>
            </div>
            <div style={{ marginTop: 20, fontSize: 13, color: D.ink2, textAlign: 'center' }}>
              New to Unite? <Link to="/register" style={{ color: D.plum, textDecoration: 'underline' }}>Request an account</Link>
            </div>
          </div>
        </form>
        {!isMobile && <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>FDA 3015727296 · VOSB · CAGE 8MK70</div>}
      </div>
      {isMobile ? null : (
      <div style={{ background: D.plum, color: D.paper, padding: 72, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
        <div />
        <div>
          <div style={{ fontFamily: D.display, fontSize: 56, fontWeight: 400, letterSpacing: -1.2, lineHeight: 1, fontStyle: 'italic' }}>
            &ldquo;No trees, no queues — just the rep assigned to our segment.&rdquo;
          </div>
          <div style={{ marginTop: 24, fontSize: 14, color: D.plumSoft }}>Jessica Garcia · Sunrise ASC · 4 years on Unite</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 32 }}>
          {[['98.6%', 'Fill rate'], ['48 hr', 'Median ship'], ['4 yr', 'Avg tenure']].map(([b, s], i) => (
            <div key={i}>
              <div style={{ fontFamily: D.display, fontSize: 40, letterSpacing: -0.7, lineHeight: 1 }}>{b}</div>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plumSoft, marginTop: 8 }}>{s.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
