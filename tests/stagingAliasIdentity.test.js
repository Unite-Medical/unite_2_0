import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeLiveProfile,withPolicyIdentity} from '../api/_lib/auth.js';
import {isDamon} from '../api/_lib/launchPolicy.js';

const env={UNITE_STAGING_ALIAS_IDENTITIES:'alex+damon@unitemedical.net=damon@unitemedical.net, alex+darren@unitemedical.net=darren@unitemedical.net'};
const session={user_id:'u1',email:'Alex+Damon@unitemedical.net',role:'admin',org_id:'',session_revision:0,mfa_verified:true};

test('aliases act as the mapped person only when the staging map is set', () => {
  assert.equal(withPolicyIdentity(session,{}).email,'Alex+Damon@unitemedical.net');
  const mapped=withPolicyIdentity(session,env);
  assert.equal(mapped.email,'damon@unitemedical.net');
  assert.equal(mapped.login_email,'Alex+Damon@unitemedical.net');
  assert.equal(isDamon(mapped),true);
  assert.equal(isDamon(withPolicyIdentity(session,{})),false);
  assert.equal(withPolicyIdentity({...session,email:'alex+jacobe@unitemedical.net'},env).email,'alex+jacobe@unitemedical.net');
});

test('mapped sessions still check the signed-in profile email', () => {
  const mapped=withPolicyIdentity(session,env);
  const profile={id:'u1',email:'alex+damon@unitemedical.net',role:'admin',status:'active',session_revision:0};
  assert.equal(authorizeLiveProfile(mapped,profile).ok,true);
  assert.equal(authorizeLiveProfile(mapped,{...profile,email:'damon@unitemedical.net'}).reason,'session_identity_stale');
});
