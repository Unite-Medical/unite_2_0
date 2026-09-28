import test from 'node:test';
import process from 'node:process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {recoveryDigest,validRecoveryToken,validNewPassword,recoveryOrigin} from '../api/_lib/passwordRecovery.js';
import {issueSession,verifySessionToken,authorizeLiveProfile,sessionFromRequest,REMEMBER_TTL_MS} from '../api/_lib/auth.js';

test('reset credentials enforce entropy and bounded password lengths',()=>{
 const token=crypto.randomBytes(32).toString('base64url');
 assert.equal(validRecoveryToken(token),true);
 for(const bad of ['',undefined,{},'a'.repeat(42),'a'.repeat(44),'<'.repeat(43)])assert.equal(validRecoveryToken(bad),false);
 assert.match(recoveryDigest(token),/^[a-f0-9]{64}$/);
 assert.equal(validNewPassword('a'.repeat(11)),false);assert.equal(validNewPassword('a'.repeat(12)),true);assert.equal(validNewPassword('a'.repeat(257)),false);
 assert.equal(recoveryOrigin({headers:{host:'evil.example'}}),'https://unitemedical.net');
 assert.equal(recoveryOrigin({headers:{host:'staging.unitemedical.net'}}),'https://staging.unitemedical.net');
});
test('remembered MFA persists exactly 30 days, refresh does not extend it, revocation still wins',()=>{
 const old=process.env.SESSION_SECRET;process.env.SESSION_SECRET='test-signing-secret-that-is-long-enough';
 try{
  const now=Math.floor(Date.now()/1000)*1000, headers={};const res={setHeader:(k,v)=>headers[k]=v};
  const session={user_id:'a',email:'a@example.test',role:'admin',roles:['admin'],session_revision:2,mfa_verified:true};
  issueSession(res,session,{remember:true,now});
  const token=()=>decodeURIComponent(headers['Set-Cookie'].split(';')[0].split('=')[1]);
  const original=verifySessionToken(token(),{now});assert.equal(original.exp,Math.floor((now+REMEMBER_TTL_MS)/1000));
  assert.match(headers['Set-Cookie'],/HttpOnly; SameSite=Lax; Max-Age=2592000/);
  assert.equal(sessionFromRequest({headers:{cookie:headers['Set-Cookie']}},{now:now+29*86400000}).mfa_verified,true);
  issueSession(res,original,{now:now+86400000});
  assert.equal(verifySessionToken(token(),{now:now+86400000}).exp,original.exp);
  assert.equal(verifySessionToken(token(),{now:now+REMEMBER_TTL_MS}),null);
  const profile={id:'a',email:session.email,role:'admin',status:'active',session_revision:3};
  assert.equal(authorizeLiveProfile(original,profile).reason,'session_revoked');
  issueSession(res,{...session,mfa_verified:false},{remember:true,now});
  assert.equal(sessionFromRequest({headers:{cookie:headers['Set-Cookie']}},{now}),null);
 }finally{if(old===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=old;}
});
