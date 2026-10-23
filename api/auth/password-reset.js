import {neon} from '@neondatabase/serverless';
import {sendJson} from '../_lib/http.js';
import {clearSessionCookie,hashStoredPassword} from '../_lib/auth.js';
import {RECOVERY_TTL_MS,recoveryDigest,validRecoveryToken,validNewPassword,ensureRecoverySchema,reserveRecoveryAttempt,redeemRecovery} from '../_lib/passwordRecovery.js';
import {authBody,authOrigin,requestIp,randomToken,securityHeaders,securitySchema} from '../_lib/authSecurity.js';
import {authMailReady,securityMail} from '../_lib/authMail.js';
const generic={ok:true,message:'If an active account matches, a reset link will arrive shortly. Check your inbox and spam folder.'};
export function createPasswordResetHandler({env=process.env,sqlFactory=neon,hashPassword=hashStoredPassword,makeMail=securityMail}={}){return async(req,res)=>{
 securityHeaders(res);if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed'});
 if(!env.DATABASE_URL)return sendJson(res,503,{error:'recovery_unavailable'});
 try{
  const body=await authBody(req,env),sql=sqlFactory(env.DATABASE_URL);await ensureRecoverySchema(sql);await securitySchema(sql);
  if(!await reserveRecoveryAttempt(sql,'password-ip:'+recoveryDigest(requestIp(req)),20))return sendJson(res,429,{error:'too_many_attempts_try_later'});
  if(body.action==='complete'){
   if(!validRecoveryToken(body.token))return sendJson(res,400,{error:'reset_link_expired_or_used'});
   if(!validNewPassword(body.password))return sendJson(res,400,{error:'use_15_to_256_characters'});
   if(!await reserveRecoveryAttempt(sql,'password-token:'+recoveryDigest(body.token),5))return sendJson(res,400,{error:'reset_link_expired_or_used'});
   const rows=await sql`SELECT p.data FROM um_password_resets r JOIN um_rows p ON p.tbl='profiles' AND p.id=r.user_id AND p.deleted=false WHERE r.token_hash=${recoveryDigest(body.token)} AND r.expires_at>now() AND p.data->>'status'='active' AND COALESCE((p.data->>'session_revision')::integer,0)=r.revision AND lower(p.data->>'email')=r.email`;
   if(!rows[0])return sendJson(res,400,{error:'reset_link_expired_or_used'});
   const notice=makeMail({id:'password-changed-'+recoveryDigest(body.token),user:rows[0].data,kind:'password_changed'});
   const changed=await redeemRecovery(sql,body.token,hashPassword(body.password),{notice});
   if(!changed.length)return sendJson(res,400,{error:'reset_link_expired_or_used'});
   clearSessionCookie(res);return sendJson(res,200,{ok:true,signed_out:true,notice:'queued',mfa_unchanged:true});
  }
  if(body.action!=='request')return sendJson(res,400,{error:'invalid_request'});
  authMailReady(env); // Uniform configuration failure before looking up any address.
  const email=String(body.email||'').trim().toLowerCase();if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return sendJson(res,400,{error:'enter_a_valid_email'});
  if(!await reserveRecoveryAttempt(sql,'password-email:'+recoveryDigest(email),3))return sendJson(res,200,generic);
  const rows=await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND deleted=false AND data->>'status'='active' AND lower(data->>'email')=${email} LIMIT 2`;
  if(rows.length!==1)return sendJson(res,200,generic);
  const profile=rows[0].data,token=randomToken(),tokenHash=recoveryDigest(token),revision=Number(profile.session_revision||0),expires=new Date(Date.now()+RECOVERY_TTL_MS).toISOString();
  const mail=makeMail({id:'password-reset-'+tokenHash,user:profile,kind:'password_reset',link:authOrigin(env)+'/login?reset=1#token='+token});
  await sql`WITH issued AS (
   INSERT INTO um_password_resets(token_hash,user_id,revision,email,expires_at) SELECT ${tokenHash},id,${revision},${email},${expires}::timestamptz FROM um_rows WHERE tbl='profiles' AND id=${profile.id} AND deleted=false AND data->>'status'='active' AND COALESCE((data->>'session_revision')::integer,0)=${revision} AND lower(data->>'email')=${email} RETURNING user_id
  ) INSERT INTO um_auth_mail(id,user_id,kind,revision,payload,expires_at) SELECT ${mail.id},user_id,'password_reset',${revision},${mail.payload},${mail.expires_at}::timestamptz FROM issued`;
  return sendJson(res,200,generic);
 }catch(error){const message=String(error.message||'');return sendJson(res,/same_origin/.test(message)?403:503,{error:/auth_origin|email_not_configured/.test(message)?'recovery_email_unavailable':'recovery_unavailable_try_again'});}
};}
export default createPasswordResetHandler();
