import { useEffect, useState } from 'react';
import { WorkspaceIcon } from './workspace/WorkspaceIcon.jsx';

export function PasswordRecovery({ onBack }) {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [confirm,setConfirm] = useState('');
  const [show,setShow] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [done,setDone] = useState(false);
  useEffect(() => { if (window.location.hash) window.history.replaceState(null,'','/login?reset=1'); },[]);
  async function submit(event) {
    event.preventDefault(); setError('');
    if (token && password !== confirm) { setError('Your passwords do not match.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/password-reset',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(token?{action:'complete',token,password}:{action:'request',email})});
      const body = await response.json();
      if (!response.ok) throw new Error((body.error || 'Please try again').replaceAll('_',' '));
      setPassword('');setConfirm('');setDone(true);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <>
    <div className="um-signin-kicker"><WorkspaceIcon name="shield" size={18}/> Account recovery</div>
    <h1>{done ? (token?'You’re all set.':'Check your inbox.') : (token?'A fresh start.':'Let’s get you back in.')}</h1>
    <p className="um-signin-subtitle">{done ? (token?'Your password has been changed. Sign in with your new password.':'If an active account matches, a reset link is on its way. Check your inbox and spam folder. The link works once and expires in 30 minutes.') : (token?'Choose a new password with at least 12 characters.':'Enter your account email and we’ll send a link to choose a new password.')}</p>
    {!done && <form onSubmit={submit}>
      {token ? <><label>New password<div className="um-password-field"><input name="new-password" type={show?'text':'password'} autoComplete="new-password" minLength={12} maxLength={256} required value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" aria-label={show?'Hide password':'Show password'} aria-pressed={show} onClick={()=>setShow(v=>!v)}>{show?'Hide':'Show'}</button></div></label><label>Confirm new password<input name="confirm-password" type={show?'text':'password'} autoComplete="new-password" minLength={12} maxLength={256} required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label></> : <label>Work email<input name="username" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/></label>}
      {error && <div className="ws-error" role="alert">{error}{token && <button type="button" onClick={()=>window.location.assign('/login?forgot=1')}>Request a new link</button>}</div>}
      <button type="submit" className="ws-button primary um-signin-submit" disabled={busy}>{busy?'Please wait…':token?'Save new password':'Send reset link'}<WorkspaceIcon name="arrow" size={17}/></button>
    </form>}
    <div className="um-signin-secondary"><button type="button" onClick={onBack}>Back to sign in</button></div>
  </>;
}
