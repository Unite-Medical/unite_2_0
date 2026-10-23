import {neon} from '@neondatabase/serverless';
import {safeEqual,sendJson} from '../_lib/http.js';
import {securityHeaders,securitySchema} from '../_lib/authSecurity.js';
import {deliverAuthMail} from '../_lib/authMail.js';
export function createSecurityNoticesHandler({env=process.env,sqlFactory=neon,deliver=deliverAuthMail}={}){return async(req,res)=>{
 securityHeaders(res);if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
 if(!env.CRON_SECRET||!safeEqual(req.headers?.authorization||'','Bearer '+env.CRON_SECRET))return sendJson(res,401,{error:'unauthorized'});
 if(!env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 try{const sql=sqlFactory(env.DATABASE_URL);await securitySchema(sql);return sendJson(res,200,{ok:true,...await deliver(sql,{env})});}catch{return sendJson(res,503,{error:'security_mail_unavailable'});}
};}
export default createSecurityNoticesHandler();
