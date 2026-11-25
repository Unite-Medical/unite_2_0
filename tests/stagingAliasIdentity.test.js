import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeLiveProfile,createSessionToken,verifySessionToken,withPolicyIdentity} from '../api/_lib/auth.js';
import {isDamon} from '../api/_lib/launchPolicy.js';
import {isUniteCustomerReadIdentity} from '../src/lib/uniteCustomerReadIdentity.js';

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

test('reissued tokens keep the sign-in email, not the mapped one', () => {
  const token=createSessionToken(withPolicyIdentity(session,env),{secret:'x'.repeat(40)});
  assert.equal(verifySessionToken(token,{secret:'x'.repeat(40)}).email,'alex+damon@unitemedical.net');
});

test('the alias map is ignored on production deployments other than staging', () => {
  assert.equal(withPolicyIdentity(session,{...env,VERCEL_ENV:'production',VERCEL_PROJECT_PRODUCTION_URL:'unitemedical.net'}).email,'Alex+Damon@unitemedical.net');
  assert.equal(withPolicyIdentity(session,{...env,VERCEL_ENV:'production'}).email,'Alex+Damon@unitemedical.net');
  assert.equal(withPolicyIdentity(session,{...env,VERCEL_ENV:'production',VERCEL_PROJECT_PRODUCTION_URL:'staging.unitemedical.net'}).email,'damon@unitemedical.net');
});

test('a mapped Jacobe alias gets the customer directory; an unmapped one does not', () => {
  const alias={...session,email:'alex+jacobe@unitemedical.net',role:'sales'};
  const map={UNITE_STAGING_ALIAS_IDENTITIES:'alex+jacobe@unitemedical.net=jacobe@unitemedical.net'};
  assert.equal(isUniteCustomerReadIdentity(withPolicyIdentity(alias,map)),true);
  assert.equal(isUniteCustomerReadIdentity(withPolicyIdentity(alias,{})),false);
  assert.equal(isUniteCustomerReadIdentity({...alias,email:'jacobe@unitemedical.net'}),false);
});
