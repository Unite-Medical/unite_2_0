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
