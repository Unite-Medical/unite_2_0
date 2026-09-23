import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { WorkspaceIcon } from '../components/workspace/WorkspaceIcon.jsx';
import { auth } from '../lib/auth.js';
import { staffHome } from '../lib/staffWorkspace.js';
import '../styles/workspace.css';
import '../styles/login.css';
import { useSEO } from '../lib/seo.js';

function SignInLayout({children,step}) {
  return <main id="main" className="um-signin">
    <aside className="um-signin-story" aria-label="Unite Medical">
      <Link to="/" className="um-signin-brand" aria-label="Unite Medical home"><img src="/brand/unite-medical-logo.png" alt="Unite Medical"/></Link>
      <div className="um-signin-intro"><span className="um-signin-eyebrow">CONNECTED CARE STARTS HERE</span><p className="um-signin-headline">Good work.<br/>All in one place.</p><p>Your people, your orders, your next step.<br/>A clearer way to work with Unite Medical.</p>
      <div className="um-signin-features">{[['box','Orders & delivery','Stay close to every detail.'],['people','Your team, connected','Keep the next handoff clear.'],['shield','Access that fits your role','The right tools for your work.']].map(([icon,title,detail])=><div key={title}><span><WorkspaceIcon name={icon} size={19}/></span><div><strong>{title}</strong><p>{detail}</p></div></div>)}</div></div>
      <div className="um-signin-story-footer"><span>UNITE MEDICAL</span><span>Built around people.</span></div>
    </aside>
    <div className="um-signin-main"><header><Link to="/">← Back to website</Link><span>{step||'YOUR UNITE ACCOUNT'}</span></header><section className="um-signin-form um-workspace">{children}</section><footer><WorkspaceIcon name="shield" size={14}/><span>Your workspace. Your access.</span><Link to="/privacy">Privacy</Link></footer></div>
  </main>;
}

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');
  useSEO({ title: 'Sign in', description: 'Sign in to your Unite Medical B2B account.', canonical: '/login', noindex: true });
  const [email, setEmail] = useState(() => import.meta.env.DEV ? 'sarah@atlanta-surgical.com' : '');
  const [password, setPassword] = useState(() => import.meta.env.DEV ? 'demo' : '');
  const [showPassword,setShowPassword]=useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [mfa,setMfa]=useState(null);const [code,setCode]=useState('');const [recovery,setRecovery]=useState(false);const [recoveryCodes,setRecoveryCodes]=useState(null);const [verifiedSession,setVerifiedSession]=useState(null);

  function destinationFor(session) {
    if (next && /^\/(?!\/)/.test(next) && !next.includes('\\')) return next;
    return staffHome(session.role);
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
  if(recoveryCodes)return <SignInLayout step="ACCOUNT SECURITY"><div className="um-signin-kicker"><WorkspaceIcon name="shield" size={18}/> Recovery access</div><h1>Keep a way back in.</h1><p className="um-signin-subtitle">Save these recovery codes in your password manager. Each works once if you lose your authenticator, and they will not be shown again.</p><pre className="um-recovery-codes">{recoveryCodes.join('\n')}</pre><button className="ws-button primary um-signin-submit" onClick={()=>{setRecoveryCodes(null);navigate(destinationFor(verifiedSession));}}>I saved my codes. Continue <WorkspaceIcon name="arrow" size={16}/></button></SignInLayout>;
  if(mfa)return <SignInLayout step="TWO-STEP SIGN-IN"><div className="um-signin-kicker"><WorkspaceIcon name="shield" size={18}/> One more step</div><h1>{mfa.enrollment?'Secure your account.':'Verify it’s you.'}</h1>{mfa.enrollment?<><p className="um-signin-subtitle">Add this account in your authenticator using the setup key below. Choose time-based codes.</p><div className="um-enrollment"><label>Account<input readOnly value={mfa.account}/></label><label>Setup key<input readOnly value={mfa.setup_key} onFocus={e=>e.target.select()}/></label></div></>:<p className="um-signin-subtitle">{recovery?'Enter one of the recovery codes you saved.':'Enter the six-digit code from your authenticator.'}</p>}<form onSubmit={verifyMfa}><label>{recovery?'Recovery code':'Verification code'}<input className="um-code-input" autoComplete="one-time-code" inputMode={recovery?'text':'numeric'} value={code} onChange={e=>setCode(e.target.value)} required pattern={recovery?undefined:'[0-9]{6}'} placeholder={recovery?'Recovery code':'000000'}/></label>{error&&<p className="ws-error" role="alert">{error}</p>}<button type="submit" className="ws-button primary um-signin-submit" disabled={submitting}>{submitting?'Verifying…':'Verify and continue'}<WorkspaceIcon name="arrow" size={16}/></button></form><div className="um-signin-secondary">{!mfa.enrollment&&<button onClick={()=>{setRecovery(v=>!v);setCode('');setError(null);}}>{recovery?'Use authenticator instead':'Use a recovery code'}</button>}<button onClick={()=>{setMfa(null);setCode('');setError(null);}}>Back to sign in</button></div></SignInLayout>;
  return <SignInLayout>
    <div className="um-signin-kicker"><span/> Welcome to Unite</div><h1>Welcome back.</h1><p className="um-signin-subtitle">Sign in to pick up where you left off.</p>
    <form onSubmit={handleSubmit}>
      <label>Work email<input type="email" autoComplete="username" placeholder="you@company.com" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label>Password<div className="um-password-field"><input aria-label="Password" type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(v=>!v)}>{showPassword?'Hide':'Show'}</button></div></label>
      <div className="um-signin-help"><Link to="/contact">Need help signing in?</Link></div>
      {error&&<div className="ws-error" role="alert">{error}</div>}
      <button className="ws-button primary um-signin-submit" type="submit" disabled={submitting}>{submitting?'Signing in…':'Sign in'}<WorkspaceIcon name="arrow" size={17}/></button>
    </form>
    <div className="um-signin-register">New to Unite? <Link to="/register">Request an account <span aria-hidden="true">↗</span></Link></div>
    {import.meta.env.DEV&&<details className="ws-details um-demo-access"><summary>Local demo access</summary><p>Sample accounts for development.</p><button type="button" className="ws-button" onClick={handleDemoAdmin} disabled={submitting}>Open admin console</button><p>Customer: sarah@atlanta-surgical.com / demo</p></details>}
  </SignInLayout>;
}
