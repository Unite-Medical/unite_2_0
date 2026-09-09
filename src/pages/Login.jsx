import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { D } from '../tokens.js';
import { UMLogo } from '../components/shared/Logo.jsx';
import { auth } from '../lib/auth.js';
import '../styles/workspace.css';
import { useSEO } from '../lib/seo.js';

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');
  useSEO({ title: 'Sign in', description: 'Sign in to your Unite Medical B2B account.', canonical: '/login', noindex: true });
  const [email, setEmail] = useState(() => import.meta.env.DEV ? 'sarah@atlanta-surgical.com' : '');
  const [password, setPassword] = useState(() => import.meta.env.DEV ? 'demo' : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [mfa,setMfa]=useState(null);const [code,setCode]=useState('');const [recovery,setRecovery]=useState(false);const [recoveryCodes,setRecoveryCodes]=useState(null);const [verifiedSession,setVerifiedSession]=useState(null);

  function destinationFor(session) {
    if (next && /^\/(?!\/)/.test(next) && !next.includes('\\')) return next;
    if (session.role === 'admin') return '/admin';
    if (['warehouse_manager', 'warehouse_operator'].includes(session.role)) return '/admin/inventory/receive';
    if(session.role==='finance')return '/admin/finance';
    if(['sales','sales_manager','customer_service','sourcing','sourcing_manager'].includes(session.role))return '/work';
    return session.role === 'distributor' ? '/distributor' : '/dashboard';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null); setSubmitting(true);
    try {
      const session = await auth.login(email, password);
      if(session.mfa_required){setMfa(session);setPassword('');return;}
      navigate(destinationFor(session));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemoAdmin() {
    setError(null); setSubmitting(true);
    setEmail('damon@unitemedical.net');
    setPassword('admin');
    try {
      const session = await auth.login('damon@unitemedical.net', 'admin');
      navigate(next && /^\/(?!\/)/.test(next) && !next.includes('\\') ? next : '/admin');
      void session;
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyMfa(e){e.preventDefault();setSubmitting(true);setError(null);try{const result=await auth.completeMfa(mfa.challenge,recovery?'':code,recovery?code:undefined);setCode('');if(result.recovery_codes){setRecoveryCodes(result.recovery_codes);setVerifiedSession(result.session);setMfa(null);}else navigate(destinationFor(result.session));}catch(err){setError(err.message);}finally{setSubmitting(false);}}
  if(recoveryCodes)return <main id="main" className="um-workspace" style={{maxWidth:560}}><section className="ws-card"><h1>Save your recovery codes</h1><p>Each code works once if you lose your authenticator. Store these in your password manager. They will not be shown again.</p><pre style={{whiteSpace:'pre-wrap'}}>{recoveryCodes.join('\n')}</pre><button className="ws-button primary" onClick={()=>{setRecoveryCodes(null);navigate(destinationFor(verifiedSession));}}>I saved my codes. Continue</button></section></main>;
  if(mfa)return <main id="main" className="um-workspace" style={{maxWidth:560}}><section className="ws-card"><h1>{mfa.enrollment?'Set up two-step sign-in':'Verify your sign-in'}</h1>{mfa.enrollment?<><p>In your authenticator, add an account using this setup key. Choose time-based codes.</p><label>Account<input readOnly value={mfa.account}/></label><label>Setup key<input readOnly value={mfa.setup_key} onFocus={e=>e.target.select()}/></label></>:<p>Enter a fresh code from your authenticator.</p>}<form onSubmit={verifyMfa}><label>{recovery?'Recovery code':'Six-digit code'}<input autoComplete="one-time-code" inputMode={recovery?'text':'numeric'} value={code} onChange={e=>setCode(e.target.value)} required pattern={recovery?undefined:'[0-9]{6}'}/></label>{error&&<p className="ws-error" role="alert">{error}</p>}<button type="submit" className="ws-button primary" disabled={submitting}>{submitting?'Verifying…':'Verify'}</button></form>{!mfa.enrollment&&<button className="ws-button" onClick={()=>{setRecovery(v=>!v);setCode('');}}>{recovery?'Use authenticator':'Use a recovery code'}</button>}<button className="ws-button" onClick={()=>{setMfa(null);setCode('');setError(null);}}>Back to sign in</button></section></main>;
  return <main id="main" className="um-workspace" style={{maxWidth:520,minHeight:'100vh',paddingTop:64}}>
    <Link to="/" aria-label="Unite Medical home"><UMLogo size={28} color={D.ink} weight={600}/></Link>
    <section className="ws-card" style={{marginTop:32}}><h1>Sign in</h1><p>Access your account and orders.</p>
      <form onSubmit={handleSubmit}>
        <label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label style={{marginTop:16}}>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        {error&&<div className="ws-error" role="alert">{error}</div>}
        <button className="ws-button primary" type="submit" disabled={submitting} style={{width:'100%',marginTop:24}}>{submitting?'Signing in…':'Sign in'}</button>
      </form>
      <p>New to Unite? <Link to="/register">Request an account</Link></p>
      <p><Link to="/contact">Need help signing in?</Link></p>
      {import.meta.env.DEV&&<details className="ws-details"><summary>Local demo access</summary><p>Sample accounts for development.</p><button type="button" className="ws-button" onClick={handleDemoAdmin} disabled={submitting}>Open admin console</button><p>Customer: sarah@atlanta-surgical.com / demo</p></details>}
    </section>
  </main>;
}
