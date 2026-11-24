import crypto from 'node:crypto';
import { hashStoredPassword } from './auth.js';
import { planActivationIssue } from './customerActivation.js';

export const STAFF_ROLES=['sales','customer_service','warehouse_operator','warehouse_manager','finance','sourcing','sourcing_manager','sales_manager','admin'];
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function planStaffMember({name,email,roles,password,reason,actor,existing=[],now=new Date()}={}){
  const cleanEmail=String(email||'').trim().toLowerCase(),cleanName=String(name||'').trim();
  if(!cleanName||!EMAIL.test(cleanEmail))return {ok:false,reason:'name_and_email_required'};
  if(!Array.isArray(roles)||!roles.length||roles.some(r=>!STAFF_ROLES.includes(r)))return {ok:false,reason:'valid_roles_required'};
  if(!String(reason||'').trim())return {ok:false,reason:'reason_required'};
  if(existing.some(p=>String(p.email||'').trim().toLowerCase()===cleanEmail))return {ok:false,reason:'email_already_has_account'};
  const at=now.toISOString(),id=`usr_staff_${crypto.createHash('sha256').update(cleanEmail).digest('hex').slice(0,16)}`;
  const base={id,email:cleanEmail,name:cleanName,role:roles[0],roles:[...new Set(roles)],org_id:actor.org_id,created_at:at,created_by:actor.user_id,session_revision:0};
  let profile,token=null,membershipStatus='active';
  if(String(password||'')){
    let record;try{record=hashStoredPassword(String(password));}catch{return {ok:false,reason:'password_too_short'};}
    profile={...base,...record,status:'active',activation_required:false,activated_at:at};
  }else{
    profile={...base,status:'pending_activation',activation_required:true};membershipStatus='pending_activation';
    const issued=planActivationIssue(profile,{now});if(!issued.ok)return issued;token=issued;
  }
  const membership={id:`member_${id}`,user_id:id,org_id:actor.org_id,role:'member',status:membershipStatus,created_at:at};
  const audit={id:crypto.randomUUID(),kind:'profile.staff_created',actor_id:actor.user_id,ref_id:id,payload:{email:cleanEmail,roles:profile.roles,reason:String(reason).trim(),password_set:!token},created_at:at};
  return {ok:true,profile,membership,audit,activation:token&&{token:token.token,record:token.record}};
}

export function planStaffRemoval({profile,actor,reason,now=new Date()}={}){
  if(!profile||!STAFF_ROLES.includes(profile.role))return {ok:false,reason:'internal_profile_required'};
  if(profile.id===actor.user_id)return {ok:false,reason:'cannot_remove_yourself'};
  if(!String(reason||'').trim())return {ok:false,reason:'reason_required'};
  const at=now.toISOString();
  const next={...profile,status:'disabled',disabled_at:at,disabled_by:actor.user_id,session_revision:Number(profile.session_revision||0)+1};
  delete next.password;delete next.password_hash;delete next.password_salt;
  return {ok:true,profile:next,audit:{id:crypto.randomUUID(),kind:'profile.staff_removed',actor_id:actor.user_id,ref_id:profile.id,payload:{email:profile.email,reason:String(reason).trim()},created_at:at}};
}
