import crypto from 'node:crypto';
import {verifyStoredPassword} from './auth.js';
import {base32,sealMfa,openMfa,verifyTotp,digestToken,requiresMfa} from './mfa.js';
import {randomToken,validToken,AUTH_ACTION_TTL_MS,authOrigin} from './authSecurity.js';
import {securityMail,authMailReady} from './authMail.js';
const revision=p=>Number(p.session_revision||0);
export const credentialFingerprint=c=>digestToken(JSON.stringify([c.secret,c.recovery_hashes||[]]));
export async function recoveryProfile(sql,id){return (await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${id} AND deleted=false`)[0]?.data;}
export async function recoveryCredential(sql,id){return (await sql`SELECT * FROM um_mfa_credentials WHERE user_id=${id}`)[0];}
function eligible(profile,credential){return profile?.status==='active'&&requiresMfa([profile.role,...(profile.roles||[])])&&Boolean(credential?.secret);}
export async function freshAuthenticatorProof(sql,profile,password,code){
 const credential=await recoveryCredential(sql,profile.id);
 if(!eligible(profile,credential)||!verifyStoredPassword(profile,password))throw new Error('password_or_authenticator_invalid');
 const counter=verifyTotp(openMfa(credential.secret),code,{lastCounter:Number(credential.last_counter)});
 if(counter===null)throw new Error('password_or_authenticator_invalid');return {credential,counter};
}
function enrollment(secret,profile){return {enrollment:true,setup_key:secret,issuer:'Unite Medical',account:profile.email};}
export async function beginOwnReplacement(sql,live,body){
 const {profile}=live;if(live.session?.user_id!==profile.id||live.session.mfa_verified!==true)throw new Error('password_or_authenticator_invalid');
 const {credential,counter}=await freshAuthenticatorProof(sql,profile,body.password,body.code);
 const token=randomToken(),tokenHash=digestToken(token),secret=base32(crypto.randomBytes(20)),sealed=sealMfa(secret),expires=new Date(Date.now()+AUTH_ACTION_TTL_MS).toISOString(),id='self:'+profile.id,auditId=crypto.randomUUID();
 const result=await sql`WITH locked AS (
  SELECT p.id FROM um_rows p JOIN um_mfa_credentials c ON c.user_id=p.id WHERE p.tbl='profiles' AND p.id=${profile.id} AND p.deleted=false AND p.data=${JSON.stringify(profile)}::jsonb AND c.secret=${credential.secret} AND c.last_counter=${Number(credential.last_counter)} AND c.recovery_hashes=${JSON.stringify(credential.recovery_hashes||[])}::jsonb FOR UPDATE OF p,c
 ), proof AS (
  UPDATE um_mfa_credentials c SET last_counter=${counter} FROM locked l WHERE c.user_id=l.id RETURNING c.user_id
 ), prepared AS (
  INSERT INTO um_mfa_replacements(id,user_id,email,kind,token_hash,revision,credential_hash,secret,flow_hash,flow_expires_at,attempts,actor_id,actor_revision,expires_at)
  SELECT ${id},user_id,${String(profile.email).toLowerCase()},'self',${tokenHash},${revision(profile)},${credentialFingerprint(credential)},${sealed},NULL,NULL,0,user_id,${revision(profile)},${expires}::timestamptz FROM proof
  ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,token_hash=EXCLUDED.token_hash,revision=EXCLUDED.revision,credential_hash=EXCLUDED.credential_hash,secret=EXCLUDED.secret,flow_hash=NULL,flow_expires_at=NULL,attempts=0,expires_at=EXCLUDED.expires_at,created_at=now() RETURNING user_id
 ) INSERT INTO um_rows(tbl,id,data) SELECT 'audit_log',${auditId},jsonb_build_object('id',${auditId}::text,'kind','auth.mfa_replacement_started','actor_id',user_id,'ref_id',user_id,'created_at',now()) FROM prepared RETURNING id`;
 if(!result.length)throw new Error('records_changed_sign_in_again');return {ok:true,token,expires_at:expires,enrollment:enrollment(secret,profile)};
}
export async function requestAssistedRecovery(sql,live,target,body,{env=process.env}={}){
 authMailReady(env);
 if(live.session?.role!=='admin'||live.session?.mfa_verified!==true)throw new Error('eligible_staff_account_required');
 const normalized=email=>String(email||'').trim().toLowerCase();
 if(target?.id===live.profile.id)throw new Error('another_administrator_required_for_lost_factor');
 if(!target||!target.org_id||!live.profile.org_id||target.org_id!==live.profile.org_id||target.status!=='active'||!requiresMfa([target.role,...(target.roles||[])]))throw new Error('eligible_staff_account_required');
 if(normalized(body.confirm_email)!==normalized(target.email)||body.confirmed!==true||body.identity_verified!==true||typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.length>500)throw new Error('confirm_exact_account_and_identity_review');
 const targetCredential=await recoveryCredential(sql,target.id);if(!targetCredential)throw new Error('account_not_enrolled_use_normal_sign_in');
 const {credential:actorCredential,counter}=await freshAuthenticatorProof(sql,live.profile,body.password,body.code);
 const token=randomToken(),tokenHash=digestToken(token),expires=new Date(Date.now()+30*60*1000).toISOString(),id='admin:'+target.id,auditId=crypto.randomUUID();
 const mail=securityMail({id:'mfa-recovery-'+tokenHash,user:target,kind:'mfa_recovery',link:authOrigin(env)+'/login?mfa_recovery=1#token='+token});
 const payload=JSON.stringify({id:auditId,kind:'auth.mfa_recovery_authorized',actor_id:live.profile.id,ref_id:target.id,reason:body.reason.trim(),identity_verified:true,created_at:new Date().toISOString()});
 const result=await sql`WITH locked AS (
  SELECT p.id FROM um_rows p JOIN um_mfa_credentials c ON c.user_id=p.id WHERE p.tbl='profiles' AND p.id=ANY(${[live.profile.id,target.id]}::text[]) AND p.deleted=false ORDER BY p.id FOR UPDATE OF p,c
 ), proof AS (
  UPDATE um_mfa_credentials SET last_counter=${counter} WHERE user_id=${live.profile.id} AND secret=${actorCredential.secret} AND last_counter=${Number(actorCredential.last_counter)} AND recovery_hashes=${JSON.stringify(actorCredential.recovery_hashes||[])}::jsonb
   AND (SELECT count(*) FROM locked)=2 AND EXISTS(SELECT 1 FROM um_rows WHERE tbl='profiles' AND id=${live.profile.id} AND data=${JSON.stringify(live.profile)}::jsonb) AND EXISTS(SELECT 1 FROM um_rows WHERE tbl='profiles' AND id=${target.id} AND data=${JSON.stringify(target)}::jsonb) AND EXISTS(SELECT 1 FROM um_mfa_credentials WHERE user_id=${target.id} AND secret=${targetCredential.secret} AND recovery_hashes=${JSON.stringify(targetCredential.recovery_hashes||[])}::jsonb) RETURNING user_id
 ), prepared AS (
  INSERT INTO um_mfa_replacements(id,user_id,email,kind,token_hash,revision,credential_hash,secret,flow_hash,flow_expires_at,attempts,actor_id,actor_revision,expires_at)
  SELECT ${id},${target.id},${String(target.email).toLowerCase()},'admin',${tokenHash},${revision(target)},${credentialFingerprint(targetCredential)},NULL,NULL,NULL,0,user_id,${revision(live.profile)},${expires}::timestamptz FROM proof
  ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,token_hash=EXCLUDED.token_hash,revision=EXCLUDED.revision,credential_hash=EXCLUDED.credential_hash,secret=NULL,flow_hash=NULL,flow_expires_at=NULL,attempts=0,actor_id=EXCLUDED.actor_id,actor_revision=EXCLUDED.actor_revision,expires_at=EXCLUDED.expires_at,created_at=now() RETURNING user_id
 ), audited AS (
  INSERT INTO um_rows(tbl,id,data) SELECT 'audit_log',${auditId},${payload}::jsonb FROM prepared RETURNING id
 ) INSERT INTO um_auth_mail(id,user_id,kind,revision,payload,expires_at) SELECT ${mail.id},user_id,'mfa_recovery',${mail.revision},${mail.payload},${mail.expires_at}::timestamptz FROM prepared RETURNING id`;
 if(!result.length)throw new Error('records_changed_sign_in_again');return {ok:true,delivery:'queued',email:target.email,expires_at:expires,credentials_unchanged:true};
}
async function attemptReplacement(sql,token,kind){
 if(!validToken(token))throw new Error('recovery_expired_or_invalid');
 const rows=await sql`UPDATE um_mfa_replacements SET attempts=attempts+1 WHERE token_hash=${digestToken(token)} AND kind=${kind} AND expires_at>now() AND attempts<8 RETURNING *`;
 if(!rows[0])throw new Error('recovery_expired_or_invalid');return rows[0];
}
async function currentReplacementOwner(sql,pending){
 const profile=await recoveryProfile(sql,pending.user_id),credential=await recoveryCredential(sql,pending.user_id);
 if(!eligible(profile,credential)||revision(profile)!==pending.revision||String(profile.email).toLowerCase()!==pending.email||credentialFingerprint(credential)!==pending.credential_hash)throw new Error('recovery_expired_or_invalid');
 if(pending.kind==='admin'){const actor=await recoveryProfile(sql,pending.actor_id);if(actor?.status!=='active'||![actor.role,...(actor.roles||[])].includes('admin')||actor.org_id!==profile.org_id||revision(actor)!==pending.actor_revision)throw new Error('recovery_expired_or_invalid');}
 return {profile,credential};
}
export async function beginAssistedEnrollment(sql,body){
 const pending=await attemptReplacement(sql,body.token,'admin'),{profile}=await currentReplacementOwner(sql,pending);
 if(!verifyStoredPassword(profile,body.password))throw new Error('recovery_password_invalid');
 const flow=randomToken(),secret=base32(crypto.randomBytes(20)),expires=new Date(Math.min(Date.parse(pending.expires_at),Date.now()+AUTH_ACTION_TTL_MS)).toISOString();
 const rows=await sql`UPDATE um_mfa_replacements SET secret=${sealMfa(secret)},flow_hash=${digestToken(flow)},flow_expires_at=${expires}::timestamptz WHERE id=${pending.id} AND token_hash=${pending.token_hash} AND expires_at>now() AND attempts=${pending.attempts} AND EXISTS(SELECT 1 FROM um_rows WHERE tbl='profiles' AND id=${profile.id} AND deleted=false AND data=${JSON.stringify(profile)}::jsonb) RETURNING id`;
 if(!rows.length)throw new Error('recovery_expired_or_invalid');return {ok:true,flow_token:flow,expires_at:expires,enrollment:enrollment(secret,profile)};
}
export async function completeReplacement(sql,body,{live=null,kind='self'}={}){
 if(body.confirmed!==true)throw new Error('confirm_authenticator_and_session_replacement');
 const pending=await attemptReplacement(sql,body.token,kind),{profile,credential}=await currentReplacementOwner(sql,pending);
 if(kind==='self'&&(!live||live.profile.id!==profile.id||revision(live.profile)!==pending.revision))throw new Error('recovery_expired_or_invalid');
 if(kind==='admin'&&(!validToken(body.flow_token)||pending.flow_hash!==digestToken(body.flow_token)||!pending.flow_expires_at||Date.parse(pending.flow_expires_at)<=Date.now()))throw new Error('recovery_expired_or_invalid');
 if(!pending.secret)throw new Error('verify_password_before_enrollment');
 const counter=verifyTotp(openMfa(pending.secret),body.code);if(counter===null)throw new Error('new_authenticator_code_invalid');
 const codes=Array.from({length:8},()=>crypto.randomBytes(10).toString('hex')),hashes=codes.map(digestToken),auditId=crypto.randomUUID();
 const notice=securityMail({id:'mfa-changed-'+pending.token_hash,user:profile,kind:'mfa_changed'});
 const audit={id:auditId,kind:kind==='self'?'auth.mfa_replaced':'auth.mfa_recovery_completed',actor_id:profile.id,authorized_by:pending.actor_id,ref_id:profile.id,created_at:new Date().toISOString()};
 const rows=await sql`WITH profiles_locked AS (
  SELECT id,data FROM um_rows WHERE tbl='profiles' AND id=ANY(${[profile.id,pending.actor_id]}::text[]) AND deleted=false ORDER BY id FOR UPDATE
 ), locked AS (
  SELECT p.id FROM profiles_locked p JOIN um_mfa_credentials c ON c.user_id=p.id WHERE p.id=${profile.id} AND p.data=${JSON.stringify(profile)}::jsonb AND c.secret=${credential.secret} AND c.last_counter=${Number(credential.last_counter)} AND c.recovery_hashes=${JSON.stringify(credential.recovery_hashes||[])}::jsonb
   AND (${kind}='self' OR EXISTS(SELECT 1 FROM profiles_locked a WHERE a.id=${pending.actor_id} AND a.data->>'status'='active' AND a.data->>'org_id'=${profile.org_id} AND COALESCE((a.data->>'session_revision')::integer,0)=${pending.actor_revision} AND (a.data->>'role'='admin' OR a.data->'roles' @> '["admin"]'::jsonb))) FOR UPDATE OF c
 ), consumed AS (
  DELETE FROM um_mfa_replacements r USING locked l WHERE r.id=${pending.id} AND r.user_id=l.id AND r.token_hash=${pending.token_hash} AND r.revision=${pending.revision} AND r.secret=${pending.secret} AND r.expires_at>now() AND r.attempts=${pending.attempts} AND r.credential_hash=${pending.credential_hash} AND (${kind}='self' OR (r.flow_hash=${pending.flow_hash||''} AND r.flow_expires_at>now())) RETURNING r.user_id
 ), credential_changed AS (
  UPDATE um_mfa_credentials c SET secret=${pending.secret},last_counter=${counter},recovery_hashes=${JSON.stringify(hashes)}::jsonb FROM consumed r WHERE c.user_id=r.user_id RETURNING c.user_id
 ), profile_changed AS (
  UPDATE um_rows p SET data=p.data||jsonb_build_object('session_revision',${pending.revision+1},'mfa_changed_at',now()),updated_at=now() FROM credential_changed c WHERE p.tbl='profiles' AND p.id=c.user_id RETURNING p.id
 ), challenges_revoked AS (DELETE FROM um_mfa_challenges c USING profile_changed p WHERE c.user_id=p.id RETURNING c.user_id),
 other_flows_revoked AS (DELETE FROM um_mfa_replacements r USING profile_changed p WHERE r.user_id=p.id AND r.id<>${pending.id} RETURNING r.id),
 audited AS (INSERT INTO um_rows(tbl,id,data) SELECT 'audit_log',${auditId},${JSON.stringify(audit)}::jsonb FROM profile_changed RETURNING id),
 notified AS (INSERT INTO um_auth_mail(id,user_id,kind,revision,payload,expires_at) SELECT ${notice.id},id,'mfa_changed',${pending.revision+1},${notice.payload},${notice.expires_at}::timestamptz FROM profile_changed ON CONFLICT(id) DO NOTHING RETURNING id)
 SELECT id FROM profile_changed`;
 if(!rows.length)throw new Error('recovery_expired_or_invalid');return {ok:true,signed_out:true,recovery_codes:codes,notice:'queued'};
}
