import {Resend} from 'resend';
import {sealMfa,openMfa} from './mfa.js';
import {authOrigin,randomToken} from './authSecurity.js';
export function authMailReady(env=process.env){
 authOrigin(env);
 if(!env.RESEND_API_KEY||!env.UNITE_AUTH_FROM||/[\r\n]/.test(env.UNITE_AUTH_FROM)||!env.CRON_SECRET||!/^[a-f0-9]{64}$/i.test(env.MFA_ENCRYPTION_KEY||''))throw new Error('recovery_email_not_configured');
}
export function securityMail({id,user,kind,link=null,now=Date.now()}){
 const at=new Date(now).toISOString(),notice=kind.endsWith('_changed');
 const subjects={password_reset:'Reset your Unite Medical password',mfa_recovery:'Replace your Unite Medical authenticator',password_changed:'Your Unite Medical password changed',mfa_changed:'Your Unite Medical authenticator changed'};
 const message=notice?`Your ${kind==='password_changed'?'password':'authenticator'} was changed at ${at}. Existing sessions were revoked. ${kind==='password_changed'?'Your authenticator requirement has not been removed.':'Old authenticator and recovery codes no longer work.'} If you did not authorize this, contact your Unite account administrator immediately.`:`${kind==='password_reset'?'Use this link to choose a new password':'An administrator approved authenticator recovery. Use this link, your current password and your own authenticator to complete replacement'}:\n\n${link}\n\nThis link expires in 30 minutes and works once. Opening the link does not change your account. Never share the link or setup key. If you did not request this, contact your Unite account administrator. Your current credentials remain unchanged until you complete the flow.`;
 return {id,user_id:user.id,kind,revision:Number(user.session_revision||0),payload:sealMfa(JSON.stringify({to:user.email,subject:subjects[kind],text:message})),expires_at:new Date(now+(notice?24*60*60*1000:30*60*1000)).toISOString()};
}
export async function insertSecurityMail(sql,mail){return sql`INSERT INTO um_auth_mail(id,user_id,kind,revision,payload,expires_at) VALUES(${mail.id},${mail.user_id},${mail.kind},${mail.revision},${mail.payload},${mail.expires_at}) ON CONFLICT(id) DO NOTHING`;}
export async function deliverAuthMail(sql,{env=process.env,send=null,limit=5}={}){
 authMailReady(env);const deliver=send||((message,key)=>new Resend(env.RESEND_API_KEY).emails.send({...message,from:env.UNITE_AUTH_FROM},{idempotencyKey:key}));
 await sql`UPDATE um_auth_mail SET status='expired',payload='',claim=NULL WHERE expires_at<=now() AND status NOT IN ('sent','cancelled','expired')`;
 const rows=await sql`SELECT id FROM um_auth_mail WHERE attempts<5 AND expires_at>now() AND next_attempt_at<=now() AND (status IN ('pending','retry') OR (status='sending' AND claimed_at<now()-interval '3 minutes')) ORDER BY created_at LIMIT ${limit}`;
 const result={sent:0,retry:0,cancelled:0};
 for(const row of rows){
  const claim=randomToken();const claimed=await sql`UPDATE um_auth_mail SET status='sending',claim=${claim},claimed_at=now(),attempts=attempts+1 WHERE id=${row.id} AND attempts<5 AND expires_at>now() AND next_attempt_at<=now() AND (status IN ('pending','retry') OR (status='sending' AND claimed_at<now()-interval '3 minutes')) RETURNING *`;
  const mail=claimed[0];if(!mail)continue;
  try{
   const message=JSON.parse(openMfa(mail.payload)),profiles=await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${mail.user_id} AND deleted=false`;
   const profile=profiles[0]?.data,linkMail=['password_reset','mfa_recovery'].includes(mail.kind);
   if(!profile||String(profile.email||'').toLowerCase()!==String(message.to).toLowerCase()||(linkMail&&(profile.status!=='active'||Number(profile.session_revision||0)!==mail.revision))){await sql`UPDATE um_auth_mail SET status='cancelled',payload='',claim=NULL WHERE id=${mail.id} AND claim=${claim}`;result.cancelled++;continue;}
   const response=await deliver(message,'unite-auth-'+mail.id);if(response?.error||!response?.data?.id)throw new Error('mail_rejected');
   await sql`UPDATE um_auth_mail SET status='sent',sent_at=now(),payload='',claim=NULL WHERE id=${mail.id} AND claim=${claim}`;result.sent++;
  }catch{
   await sql`UPDATE um_auth_mail SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'retry' END,next_attempt_at=now()+interval '5 minutes',claim=NULL WHERE id=${mail.id} AND claim=${claim}`;result.retry++;
  }
 }
 return result;
}
