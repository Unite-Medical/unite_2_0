import test from 'node:test';import assert from 'node:assert/strict';import {authOrigin,authBody} from '../api/_lib/authSecurity.js';
const moduleUrl=new URL('../src/lib/recoveryLink.js',import.meta.url);let serial=0;
test('recovery fragment is scrubbed before UI, held only in memory and forgotten after use',async()=>{
 const old=globalThis.window,token='A'.repeat(43),paths=[];
 try{globalThis.window={location:{pathname:'/login',search:'?reset=1&next=https://evil.example',hash:'#token='+token},history:{replaceState(_a,_b,path){paths.push(path);}}};const module=await import(moduleUrl.href+'?case='+(serial++));assert.equal(paths[0],'/login?reset=1');assert.equal(module.recoveryLinkToken('password'),token);assert.equal(module.recoveryLinkToken('mfa'),'');module.forgetRecoveryLink();assert.equal(module.recoveryLinkToken('password'),'');}finally{if(old===undefined)delete globalThis.window;else globalThis.window=old;}
});
test('malformed recovery fragment is removed without retaining it',async()=>{const old=globalThis.window;try{let path;globalThis.window={location:{pathname:'/login',search:'?mfa_recovery=1',hash:'#token=invalid'},history:{replaceState(_a,_b,value){path=value;}}};const module=await import(moduleUrl.href+'?case='+(serial++));assert.equal(path,'/login?mfa_recovery=1');assert.equal(module.recoveryLinkToken('mfa'),'');}finally{if(old===undefined)delete globalThis.window;else globalThis.window=old;}});
test('recovery accepts only bounded JSON posts from explicitly configured HTTPS origin',async()=>{
 const env={UNITE_AUTH_ORIGIN:'https://qa.example.test',UNITE_ENVIRONMENT:'test'};assert.equal(authOrigin(env),'https://qa.example.test');
 for(const value of ['http://qa.example.test','https://qa.example.test/path','https://user@qa.example.test','https://qa.example.test?to=evil'])assert.throws(()=>authOrigin({...env,UNITE_AUTH_ORIGIN:value}));
 for(const req of [{method:'GET',headers:{}},{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'}},{method:'POST',headers:{origin:env.UNITE_AUTH_ORIGIN,'content-type':'text/plain'}}])await assert.rejects(()=>authBody(req,env));
 assert.deepEqual(await authBody({method:'POST',headers:{origin:env.UNITE_AUTH_ORIGIN,'content-type':'application/json'},body:{action:'request'}},env),{action:'request'});
});
