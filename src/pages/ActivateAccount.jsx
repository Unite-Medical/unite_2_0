import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Nav } from '../components/layout/Nav.jsx';
import { useSEO } from '../lib/seo.js';
import { postWorkspace } from '../lib/workspaceRequest.js';
import '../styles/workspace.css';
export function ActivateAccount() {
  const [params]=useSearchParams(); const token=params.get('token');
  const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');
  const [error,setError]=useState('');const [done,setDone]=useState(false);const [busy,setBusy]=useState(false);
  useSEO({title:'Activate your account',noindex:true});
  async function activate(event){event.preventDefault();if(busy)return;if(password!==confirm){setError('The passwords do not match. Please enter them again.');return;}
    setBusy(true);setError('');try{await postWorkspace('/api/auth/activate',{token,password});setDone(true);setPassword('');setConfirm('');}catch(e){setError(e.message+' If this link has expired or was already used, ask Unite for a new one.');}finally{setBusy(false);}}
  return <><Nav/><main id="main" className="um-workspace" style={{maxWidth:580,paddingTop:60}}><section className="ws-card"><h1>{done?'Your login is ready':'Activate your account'}</h1>{done?<><p>Sign in to view your account. Our team will confirm your pricing before ordering is enabled.</p><Link className="ws-button primary" to="/login">Sign in</Link></>:!token?<><p>Open the activation link sent by Unite to set your password.</p><Link className="ws-button" to="/contact">Request an activation link</Link><p style={{marginTop:20}}>Already activated? <Link to="/login">Sign in</Link></p></>:<><p>Set a password to access your existing Unite account.</p><form className="ws-stack" onSubmit={activate}><label>New password<input autoComplete="new-password" type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} aria-describedby="password-help"/></label><span id="password-help" className="ws-muted">Use at least 8 characters.</span><label>Confirm password<input autoComplete="new-password" type="password" minLength={8} required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>{error&&<div role="alert" className="ws-error">{error}</div>}<button className="ws-button primary" disabled={busy}>{busy?'Activating…':'Activate account'}</button></form></>}</section></main></>;
}
