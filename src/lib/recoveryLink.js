// Capture only the one-time fragment, before rendering analytics or third-party UI.
// Keep it in memory; never localStorage/sessionStorage, logs, query parameters or DOM.
let recovery=null;
if(typeof window!=='undefined'&&window.location.pathname==='/login'){
 const query=new URLSearchParams(window.location.search),token=new URLSearchParams(window.location.hash.slice(1)).get('token');
 const kind=query.has('mfa_recovery')?'mfa':query.has('reset')?'password':null;
 if(kind){if(token&&/^[A-Za-z0-9_-]{43}$/.test(token))recovery={kind,token};window.history.replaceState(null,'','/login?'+(kind==='mfa'?'mfa_recovery=1':'reset=1'));}
}
export const recoveryLinkToken=kind=>recovery?.kind===kind?recovery.token:'';
export function forgetRecoveryLink(){recovery=null;}
