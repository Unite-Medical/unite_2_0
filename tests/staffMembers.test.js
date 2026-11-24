import test from 'node:test';
import assert from 'node:assert/strict';
import {planStaffMember,planStaffRemoval} from '../api/_lib/staffMembers.js';
const actor={user_id:'damon',org_id:'org_team',role:'admin'};
test('new staff member with a password is active with exactly the chosen roles',()=>{
 const p=planStaffMember({name:'Test Ashley',email:' Alex+Ashley@UniteMedical.net ',roles:['finance'],password:'long-enough-password-1',reason:'QA alias',actor});
 assert.equal(p.ok,true);assert.equal(p.profile.email,'alex+ashley@unitemedical.net');assert.deepEqual(p.profile.roles,['finance']);assert.equal(p.profile.role,'finance');
 assert.equal(p.profile.status,'active');assert.ok(p.profile.password_hash);assert.equal(p.profile.password,undefined);assert.equal(p.activation,null);
 assert.equal(p.membership.org_id,'org_team');assert.equal(p.audit.payload.password_set,true);
});
test('without a password the member gets an activation link',()=>{
 const p=planStaffMember({name:'Test',email:'a@b.co',roles:['sales'],reason:'x',actor});
 assert.equal(p.profile.status,'pending_activation');assert.ok(p.activation.token);assert.equal(p.membership.status,'pending_activation');
});
test('duplicate emails, unknown roles, customer roles and missing reasons are refused',()=>{
 assert.equal(planStaffMember({name:'T',email:'a@b.co',roles:['sales'],reason:'x',actor,existing:[{email:'A@b.co'}]}).reason,'email_already_has_account');
 assert.equal(planStaffMember({name:'T',email:'a@b.co',roles:['owner'],reason:'x',actor}).reason,'valid_roles_required');
 assert.equal(planStaffMember({name:'T',email:'a@b.co',roles:['sales'],reason:' ',actor}).reason,'reason_required');
 assert.equal(planStaffMember({name:'T',email:'a@b.co',roles:['sales'],password:'short',reason:'x',actor}).reason,'password_too_short');
});
test('removing access disables the profile, drops the password and revokes sessions',()=>{
 const r=planStaffRemoval({profile:{id:'u',role:'sales',password_hash:'h',password_salt:'s',session_revision:2},actor,reason:'QA done'});
 assert.equal(r.profile.status,'disabled');assert.equal(r.profile.password_hash,undefined);assert.equal(r.profile.session_revision,3);
 assert.equal(planStaffRemoval({profile:{id:'damon',role:'admin'},actor,reason:'x'}).reason,'cannot_remove_yourself');
 assert.equal(planStaffRemoval({profile:{id:'c',role:'owner'},actor,reason:'x'}).reason,'internal_profile_required');
});
