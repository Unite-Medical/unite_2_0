import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {base32,totp,verifyTotp,requiresMfa} from '../api/_lib/mfa.js';
import {authorizeLiveProfile,createSessionToken,sessionFromRequest} from '../api/_lib/auth.js';
const key=base32(Buffer.from('12345678901234567890'));
test('TOTP matches independent RFC 6238 SHA-1 vectors',()=>{
 for(const [time,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']])assert.equal(totp(key,Math.floor(time/30),8),expected);
});
test('customer and distributor sign-ins remain valid without MFA, including after account approval',()=>{
 const secret='customer-regression-session-secret';
 for(const role of ['customer','distributor']){
  const profile={id:`qa-${role}`,email:`${role}@example.test`,role,roles:[role],status:'active',org_id:'qa-org',session_revision:1};
  const session={user_id:profile.id,email:profile.email,role,roles:[role],org_id:profile.org_id,session_revision:1,approval_status:'approved',mfa_verified:false};
  assert.equal(requiresMfa([profile.role,...profile.roles]),false);
  const parsed=sessionFromRequest({headers:{cookie:'um_session='+createSessionToken(session,{secret})}},{secret});
  assert.equal(parsed?.user_id,profile.id);
  assert.equal(authorizeLiveProfile(parsed,profile).ok,true);
  assert.equal(authorizeLiveProfile({...parsed,session_revision:0},profile).reason,'session_revoked');
  assert.equal(authorizeLiveProfile(parsed,profile,{roles:['admin']}).reason,'forbidden');
 }
});
test('a customer label cannot bypass MFA on an account with a privileged staff grant',()=>{
 const profile={id:'mixed',email:'mixed@example.test',role:'customer',roles:['finance'],status:'active',org_id:'qa-org',session_revision:0};
 const session={user_id:profile.id,email:profile.email,role:'customer',org_id:profile.org_id,session_revision:0,mfa_verified:false};
 assert.equal(requiresMfa([profile.role,...profile.roles]),true);
 assert.equal(authorizeLiveProfile(session,profile).reason,'mfa_required');
 for(const role of ['admin','finance','warehouse_manager','sales_manager','sourcing_manager'])assert.equal(requiresMfa(role),true);
});
test('MFA rejects replay, stale and malformed codes',()=>{
 const now=1234567890000,counter=Math.floor(now/30000),code=totp(key,counter);
 assert.equal(verifyTotp(key,code,{now}),counter);
 assert.equal(verifyTotp(key,code,{now,lastCounter:counter}),null);
 assert.equal(verifyTotp(key,code,{now:now+120000}),null);
 assert.equal(verifyTotp(key,'bad',{now}),null);
});
test('privileged sessions without completed MFA cannot access API requests',()=>{
 const secret='test-session-signing-key-long-enough';const session={user_id:'a',role:'admin'};
 const req=mfa=>({headers:{authorization:'Bearer '+createSessionToken({...session,mfa_verified:mfa},{secret})}});
 assert.equal(sessionFromRequest(req(false),{secret}),null);
 assert.equal(sessionFromRequest(req(true),{secret}).user_id,'a');
 assert.equal(requiresMfa('finance'),true);assert.equal(requiresMfa('warehouse_manager'),true);assert.equal(requiresMfa('customer'),false);
});
