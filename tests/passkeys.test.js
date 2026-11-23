import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultPasskeyName,passkeyRegistrationOptions,passkeySignInOptions,publicPasskey,relyingParty} from '../api/_lib/passkeys.js';

test('passkeys are bound to the host the browser is on',()=>{
 assert.deepEqual(relyingParty({headers:{host:'staging.unitemedical.net'}}),{rpID:'staging.unitemedical.net',origin:'https://staging.unitemedical.net'});
 assert.deepEqual(relyingParty({headers:{'x-forwarded-host':'unitemedical.net, proxy',host:'internal'}}),{rpID:'unitemedical.net',origin:'https://unitemedical.net'});
 assert.deepEqual(relyingParty({headers:{host:'localhost:5173'}}),{rpID:'localhost',origin:'http://localhost:5173'});
});

test('sign-in options only allow the user’s own passkeys',async()=>{
 const options=await passkeySignInOptions({rpID:'staging.unitemedical.net'},[{id:'cred-a',transports:['internal']},{id:'cred-b',transports:null}]);
 assert.equal(options.rpId,'staging.unitemedical.net');
 assert.deepEqual(options.allowCredentials.map(c=>c.id),['cred-a','cred-b']);
 assert.ok(options.challenge.length>=32);
});

test('registration options exclude existing passkeys and never request attestation',async()=>{
 const options=await passkeyRegistrationOptions({rpID:'staging.unitemedical.net'},{id:'user-1',email:'damon@example.test',name:'Damon'},[{id:'cred-a',transports:[]}]);
 assert.equal(options.rp.id,'staging.unitemedical.net');
 assert.equal(options.attestation,'none');
 assert.equal(options.user.name,'damon@example.test');
 assert.deepEqual(options.excludeCredentials.map(c=>c.id),['cred-a']);
});

test('passkey list never exposes key material',()=>{
 const row={id:'cred-a',name:null,public_key:'secret-ish',counter:4,created_at:'2026-11-23',last_used_at:null};
 assert.deepEqual(publicPasskey(row),{id:'cred-a',name:'Passkey',created_at:'2026-11-23',last_used_at:null});
});

test('default passkey names describe the device',()=>{
 assert.equal(defaultPasskeyName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'),'Mac · Safari');
 assert.equal(defaultPasskeyName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'),'iPhone · Safari');
 assert.equal(defaultPasskeyName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0'),'Windows PC · Edge');
 assert.equal(defaultPasskeyName(''),'This device');
});

test('session tokens keep the time of the last second-factor check across re-issue',async()=>{
 const {createSessionToken,verifySessionToken}=await import('../api/_lib/auth.js');
 const secret='x'.repeat(48);
 const token=createSessionToken({user_id:'u1',role:'admin',mfa_verified:true,mfa_at:1700000000},{secret,now:1700000000000});
 const payload=verifySessionToken(token,{secret,now:1700000001000});
 assert.equal(payload.mfa_at,1700000000);
 const reissued=verifySessionToken(createSessionToken({...payload,role:'sales'},{secret,now:1700000500000}),{secret,now:1700000501000});
 assert.equal(reissued.mfa_at,1700000000);
 assert.equal('mfa_at' in verifySessionToken(createSessionToken({user_id:'u2',role:'sales'},{secret}),{secret}),false);
});

test('trusted-device cookie skips the code only for the same user and session revision',async()=>{
 const {setTrustedDeviceCookie,trustedDevice,verifySessionToken}=await import('../api/_lib/auth.js');
 const secret='y'.repeat(48);const headers={};
 const res={getHeader:k=>headers[k],setHeader:(k,v)=>{headers[k]=v;}};
 headers['Set-Cookie']='um_session=abc; Path=/';
 setTrustedDeviceCookie(res,{id:'u1',session_revision:2},{secret,now:1700000000000});
 assert.equal(headers['Set-Cookie'].length,2);
 const cookie=headers['Set-Cookie'][1];assert.match(cookie,/HttpOnly/);assert.match(cookie,/Path=\/api\/auth/);
 const value=cookie.split(';')[0];const req={headers:{cookie:value}};
 assert.equal(trustedDevice(req,{id:'u1',session_revision:2},{secret,now:1700000001000}),true);
 assert.equal(trustedDevice(req,{id:'u2',session_revision:2},{secret,now:1700000001000}),false);
 assert.equal(trustedDevice(req,{id:'u1',session_revision:3},{secret,now:1700000001000}),false);
 assert.equal(trustedDevice(req,{id:'u1',session_revision:2},{secret,now:1700000000000+31*24*3600*1000}),false);
 assert.equal(trustedDevice(req,{id:'u1',session_revision:2},{secret:'z'.repeat(48),now:1700000001000}),false);
 assert.equal(verifySessionToken(value.split('=')[1],{secret,now:1700000001000}),null);
});
