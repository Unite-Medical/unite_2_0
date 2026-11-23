import {useEffect,useState} from 'react';
import {AdminShell} from '../components/layout/AdminShell.jsx';
import {WorkspaceIcon} from '../components/workspace/WorkspaceIcon.jsx';
import {addPasskey,friendlyPasskeyError,listPasskeys,passkeysSupported,removePasskey} from '../lib/passkeys.js';

const when=value=>value?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(value)):'Never';

export function StaffSecurity(){
 const [passkeys,setPasskeys]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const supported=passkeysSupported();
 async function load(){setError('');try{setPasskeys(await listPasskeys());}catch(err){setPasskeys([]);setError(err.message);}}
 useEffect(()=>{let cancelled=false;listPasskeys().then(rows=>{if(!cancelled)setPasskeys(rows);}).catch(err=>{if(!cancelled){setPasskeys([]);setError(err.message);}});return()=>{cancelled=true;};},[]);
 async function add(){setBusy('add');setError('');setNotice('');try{await addPasskey();setNotice('Passkey added. Use it next time you sign in.');await load();}catch(err){setError(friendlyPasskeyError(err));}finally{setBusy('');}}
 async function remove(p){if(!window.confirm(`Remove “${p.name}”? You can still sign in with your 6-digit code.`))return;setBusy(p.id);setError('');setNotice('');try{await removePasskey(p.id);setNotice('Passkey removed.');await load();}catch(err){setError(err.message);}finally{setBusy('');}}
 return <AdminShell active="security"><main id="main" className="uw-workday">
  <header className="uw-day-heading"><div><h1>Sign-in security</h1><p>Use a passkey (Face ID, Touch ID, Windows Hello or a security key) instead of typing a 6-digit code. Your authenticator code and recovery codes still work as a backup.</p></div>
   <button className="uw-button primary" onClick={add} disabled={!supported||busy==='add'}><WorkspaceIcon name="shield" size={16}/>{busy==='add'?'Waiting for your device…':'Add a passkey'}</button></header>
  {!supported&&<p className="ws-error" role="alert">This browser doesn’t support passkeys. Try Safari, Chrome or Edge.</p>}
  {error&&<p className="ws-error" role="alert">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  <section className="uw-panel" aria-label="Your passkeys">
   <h2>Your passkeys</h2>
   {passkeys===null?<p>Loading…</p>:!passkeys.length?<p>No passkeys yet. Add one to skip the 6-digit code at sign-in.</p>:
   <ul className="uw-passkey-list">{passkeys.map(p=><li key={p.id}><span><strong>{p.name}</strong><small>Added {when(p.created_at)} · Last used {when(p.last_used_at)}</small></span><button className="uw-button" onClick={()=>remove(p)} disabled={busy===p.id}>{busy===p.id?'Removing…':'Remove'}</button></li>)}</ul>}
  </section>
 </main></AdminShell>;
}
