import {browserSupportsWebAuthn,startAuthentication,startRegistration} from '@simplewebauthn/browser';

const DISMISS_KEY='um.passkeyPromptDismissed.';
const DISMISS_MS=14*24*60*60*1000;
const MESSAGES={
 NotAllowedError:'Passkey was cancelled or timed out. Try again, or use your 6-digit code.',
 InvalidStateError:'This device already has a passkey for your account.',
 SecurityError:'Passkeys only work on the Unite Medical site address.',
};
const SERVER_MESSAGES={sign_in_again_to_add_passkey:'For security, sign out and back in, then add your passkey within 15 minutes.'};
async function call(method,body){
 const response=await fetch('/api/auth/passkeys',{method,credentials:'include',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(SERVER_MESSAGES[data.error]||String(data.error||'Passkey request failed').replaceAll('_',' '));
 return data;
}
export function friendlyPasskeyError(error){return MESSAGES[error?.name]||error?.message||'Passkey failed. Use your 6-digit code instead.';}
export const passkeysSupported=()=>typeof window!=='undefined'&&browserSupportsWebAuthn();
export async function signInWithPasskey(optionsJSON){return startAuthentication({optionsJSON});}
export async function listPasskeys(){return (await call('GET')).passkeys||[];}
export async function addPasskey(name){
 const {options}=await call('POST',{action:'options'});
 const response=await startRegistration({optionsJSON:options});
 return (await call('POST',{action:'register',response,name})).passkey;
}
export async function removePasskey(id){return call('DELETE',{id});}
export function passkeyPromptDismissed(userId){try{return Date.now()-Number(localStorage.getItem(DISMISS_KEY+userId)||0)<DISMISS_MS;}catch{return false;}}
export function dismissPasskeyPrompt(userId){try{localStorage.setItem(DISMISS_KEY+userId,String(Date.now()));}catch{/* storage unavailable */}}
