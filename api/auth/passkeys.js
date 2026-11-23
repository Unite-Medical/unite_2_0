import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {requiresMfa} from '../_lib/mfa.js';
import {defaultPasskeyName,ensurePasskeySchema,listPasskeys,passkeyRegistrationOptions,publicPasskey,relyingParty,verifyPasskeyRegistration} from '../_lib/passkeys.js';
async function audit(sql,kind,actor){const row={id:crypto.randomUUID(),kind,actor_id:actor,created_at:new Date().toISOString()};await sql`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) VALUES('audit_log',${row.id},${JSON.stringify(row)}::jsonb,false,now())`;}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(!['GET','POST','DELETE'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 const sql=neon(process.env.DATABASE_URL);
 try{
  const live=await authorizeLiveRequest(req,sql);
  if(!live.ok)return sendJson(res,401,{error:live.reason});
  const profile=live.profile;
  // Only roles that use a second factor manage passkeys, and only from a fully verified session.
  if(!requiresMfa([profile.role,...(profile.roles||[])]))return sendJson(res,403,{error:'passkeys_not_available_for_role'});
  if(live.session.mfa_verified!==true)return sendJson(res,403,{error:'mfa_required_sign_in_again'});
  await ensurePasskeySchema(sql);
  const userId=String(profile.id);
  if(req.method==='GET')return sendJson(res,200,{passkeys:(await listPasskeys(sql,userId)).map(publicPasskey)});
  const body=JSON.parse((await readRawBody(req)).toString('utf8')||'{}');
  if(req.method==='DELETE'){
   const removed=await sql`DELETE FROM um_passkeys WHERE id=${String(body.id||'')} AND user_id=${userId} RETURNING id`;
   if(!removed.length)return sendJson(res,404,{error:'passkey_not_found'});
   await audit(sql,'auth.passkey_removed',userId);
   return sendJson(res,200,{ok:true});
  }
  const rp=relyingParty(req);
  if(body.action==='options'){
   const options=await passkeyRegistrationOptions(rp,profile,await listPasskeys(sql,userId));
   await sql`INSERT INTO um_passkey_challenges(user_id,challenge,expires_at) VALUES(${userId},${options.challenge},now()+interval '5 minutes') ON CONFLICT(user_id) DO UPDATE SET challenge=EXCLUDED.challenge,expires_at=EXCLUDED.expires_at`;
   return sendJson(res,200,{options});
  }
  if(body.action==='register'){
   const challenges=await sql`DELETE FROM um_passkey_challenges WHERE user_id=${userId} AND expires_at>now() RETURNING challenge`;
   if(!challenges.length)return sendJson(res,400,{error:'passkey_setup_expired_try_again'});
   let credential=null;
   try{credential=await verifyPasskeyRegistration({rp,response:body.response,expectedChallenge:challenges[0].challenge});}catch{credential=null;}
   if(!credential)return sendJson(res,400,{error:'passkey_not_verified'});
   const name=String(body.name||'').trim().slice(0,60)||defaultPasskeyName(req.headers['user-agent']);
   const saved=await sql`INSERT INTO um_passkeys(id,user_id,public_key,counter,transports,device_type,backed_up,name) VALUES(${credential.id},${userId},${credential.public_key},${credential.counter},${JSON.stringify(credential.transports)}::jsonb,${credential.device_type},${credential.backed_up},${name}) ON CONFLICT(id) DO NOTHING RETURNING id,name,created_at,last_used_at`;
   if(!saved.length)return sendJson(res,409,{error:'passkey_already_registered'});
   await audit(sql,'auth.passkey_added',userId);
   return sendJson(res,200,{ok:true,passkey:publicPasskey(saved[0])});
  }
  return sendJson(res,400,{error:'unknown_action'});
 }catch{return sendJson(res,503,{error:'passkeys_unavailable'});}
}
