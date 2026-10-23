import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {ensureMfaSchema,requiresMfa} from '../_lib/mfa.js';
import {ensureRecoverySchema,reserveRecoveryAttempt} from '../_lib/passwordRecovery.js';
import {authBody,securityHeaders,securitySchema,requestIp,digest,securityError} from '../_lib/authSecurity.js';
import {recoveryProfile,requestAssistedRecovery} from '../_lib/mfaRecovery.js';
import {sendJson} from '../_lib/http.js';
export function createAdminRecoveryHandler({env=process.env,sqlFactory=neon,authorize=authorizeLiveRequest}={}){return async(req,res)=>{
 securityHeaders(res);if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
 if(!env.DATABASE_URL)return sendJson(res,503,{error:'recovery_unavailable'});
 try{
  const sql=sqlFactory(env.DATABASE_URL),live=await authorize(req,sql,{roles:['admin']});if(!live.ok||live.session.role!=='admin'||live.session.mfa_verified!==true)return sendJson(res,403,{error:'administrator_mfa_required'});
  await ensureRecoverySchema(sql);await securitySchema(sql);await ensureMfaSchema(sql);
  if(req.method==='GET'){
   const rows=await sql`SELECT p.data,c.user_id AS enrolled FROM um_rows p LEFT JOIN um_mfa_credentials c ON c.user_id=p.id WHERE p.tbl='profiles' AND p.deleted=false AND p.data->>'status'='active' AND p.data->>'org_id'=${live.profile.org_id} ORDER BY lower(p.data->>'email') LIMIT 500`;
   const mailStatus=await sql`SELECT status,count(*)::integer AS count FROM um_auth_mail GROUP BY status`;
   return sendJson(res,200,{ok:true,mail_status:mailStatus,accounts:rows.filter(r=>requiresMfa([r.data.role,...(r.data.roles||[])])).map(r=>({id:r.data.id,email:r.data.email,name:r.data.name,role:r.data.role,enrolled:Boolean(r.enrolled),self:r.data.id===live.profile.id}))});
  }
  const body=await authBody(req,env);
  if(!await reserveRecoveryAttempt(sql,'admin-mfa-user:'+digest(live.profile.id),10)||!await reserveRecoveryAttempt(sql,'admin-mfa-ip:'+digest(requestIp(req)),20))return sendJson(res,429,{error:'too_many_attempts_try_later'});
  if(body.action!=='request_recovery'||typeof body.user_id!=='string')return sendJson(res,400,{error:'invalid_request'});
  const target=await recoveryProfile(sql,body.user_id);return sendJson(res,200,await requestAssistedRecovery(sql,live,target,body,{env}));
 }catch(error){return sendJson(res,/same_origin/.test(error.message)?403:400,{error:securityError(error)});}
};}
export default createAdminRecoveryHandler();
