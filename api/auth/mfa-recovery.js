import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest,clearSessionCookie} from '../_lib/auth.js';
import {ensureMfaSchema,requiresMfa} from '../_lib/mfa.js';
import {ensureRecoverySchema,reserveRecoveryAttempt} from '../_lib/passwordRecovery.js';
import {authBody,securityHeaders,securitySchema,requestIp,digest,securityError} from '../_lib/authSecurity.js';
import {recoveryCredential,beginOwnReplacement,beginAssistedEnrollment,completeReplacement} from '../_lib/mfaRecovery.js';
import {sendJson} from '../_lib/http.js';
export function createMfaRecoveryHandler({env=process.env,sqlFactory=neon,authorize=authorizeLiveRequest}={}){return async(req,res)=>{
 securityHeaders(res);if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
 if(!env.DATABASE_URL)return sendJson(res,503,{error:'recovery_unavailable'});
 try{
  const sql=sqlFactory(env.DATABASE_URL);
  if(req.method==='GET'){const live=await authorize(req,sql);if(!live.ok)return sendJson(res,401,{error:'sign_in_required'});await ensureMfaSchema(sql);const credential=await recoveryCredential(sql,live.profile.id);return sendJson(res,200,{ok:true,email:live.profile.email,mfa_required:requiresMfa([live.profile.role,...(live.profile.roles||[])]),enrolled:Boolean(credential)});}
  const body=await authBody(req,env);await ensureRecoverySchema(sql);await securitySchema(sql);await ensureMfaSchema(sql);
  if(!await reserveRecoveryAttempt(sql,'mfa-ip:'+digest(requestIp(req)),30))return sendJson(res,429,{error:'too_many_attempts_try_later'});
  if(['recovery_begin','recovery_complete'].includes(body.action)){
   if(!await reserveRecoveryAttempt(sql,'mfa-token:'+digest(body.token),12))return sendJson(res,400,{error:'recovery_expired_or_invalid'});
   const result=body.action==='recovery_begin'?await beginAssistedEnrollment(sql,body):await completeReplacement(sql,body,{kind:'admin'});if(result.signed_out)clearSessionCookie(res);return sendJson(res,200,result);
  }
  const live=await authorize(req,sql);if(!live.ok)return sendJson(res,401,{error:'sign_in_required'});
  if(!requiresMfa([live.profile.role,...(live.profile.roles||[])]))return sendJson(res,403,{error:'authenticator_not_required_for_this_account'});
  if(!await reserveRecoveryAttempt(sql,'mfa-user:'+digest(live.profile.id),15))return sendJson(res,429,{error:'too_many_attempts_try_later'});
  if(body.action==='replace_begin')return sendJson(res,200,await beginOwnReplacement(sql,live,body));
  if(body.action==='replace_complete'){const result=await completeReplacement(sql,body,{live,kind:'self'});clearSessionCookie(res);return sendJson(res,200,result);}
  if(body.action==='cancel'){await sql`DELETE FROM um_mfa_replacements WHERE id=${'self:'+live.profile.id} AND token_hash=${digest(body.token)}`;return sendJson(res,200,{ok:true,credentials_unchanged:true});}
  return sendJson(res,400,{error:'invalid_request'});
 }catch(error){return sendJson(res,/same_origin/.test(error.message)?403:400,{error:securityError(error)});}
};}
export default createMfaRecoveryHandler();
