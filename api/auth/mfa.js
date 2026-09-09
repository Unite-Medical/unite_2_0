import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {readRawBody,sendJson} from '../_lib/http.js';
import {createSessionToken,setSessionCookie} from '../_lib/auth.js';
import {digestToken,openMfa,verifyTotp,requiresMfa} from '../_lib/mfa.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 const sql=neon(process.env.DATABASE_URL);
 try{
  const body=JSON.parse((await readRawBody(req)).toString('utf8'));
  if(!/^[A-Za-z0-9_-]{43}$/.test(body.challenge||''))return sendJson(res,401,{error:'challenge_expired_sign_in_again'});
  // Each attempt consumes one slot atomically, before checking the secret.
  const challenges=await sql`UPDATE um_mfa_challenges SET attempts=attempts+1 WHERE token_hash=${digestToken(body.challenge)} AND expires_at>now() AND attempts<5 RETURNING *`;
  const challenge=challenges[0];if(!challenge)return sendJson(res,401,{error:'challenge_expired_sign_in_again'});
  const profiles=await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${challenge.user_id} AND deleted=false`;
  const p=profiles[0]?.data;
  if(!p||p.status!=='active'||!requiresMfa([p.role,...(p.roles||[])])||Number(p.session_revision||0)!==challenge.revision)return sendJson(res,401,{error:'sign_in_again'});
  const credentials=await sql`SELECT * FROM um_mfa_credentials WHERE user_id=${p.id}`;
  const cred=credentials[0];
  const recoveryHash=body.recovery_code?digestToken(String(body.recovery_code).trim()):null;
  const recovery=Boolean(cred&&recoveryHash&&(cred.recovery_hashes||[]).includes(recoveryHash));
  const secret=cred?.secret||challenge.secret;
  const counter=secret?verifyTotp(openMfa(secret),body.code,{lastCounter:Number(cred?.last_counter??-1)}):null;
  if(counter===null&&!recovery)return sendJson(res,400,{error:'invalid_or_used_code'});
  const recoveryCodes=cred?[]:Array.from({length:8},()=>crypto.randomBytes(10).toString('hex'));
  const recoveryHashes=cred?(cred.recovery_hashes||[]).filter(h=>h!==recoveryHash):recoveryCodes.map(digestToken);
  const acceptedCounter=counter??Number(cred.last_counter);
  const audit={id:crypto.randomUUID(),kind:cred?'auth.mfa_verified':'auth.mfa_enrolled',actor_id:p.id,created_at:new Date().toISOString()};
  const results=await sql`WITH consumed AS (
   DELETE FROM um_mfa_challenges WHERE user_id=${p.id} AND token_hash=${challenge.token_hash} AND expires_at>now() AND revision=${challenge.revision} AND EXISTS(SELECT 1 FROM um_rows WHERE tbl='profiles' AND id=${p.id} AND deleted=false AND data->>'status'='active' AND data->>'role'=${p.role} AND COALESCE((data->>'session_revision')::integer,0)=${challenge.revision}) RETURNING user_id
  ), verified AS (INSERT INTO um_mfa_credentials(user_id,secret,last_counter,recovery_hashes) SELECT user_id,${secret},${acceptedCounter},${JSON.stringify(recoveryHashes)}::jsonb FROM consumed
  ON CONFLICT(user_id) DO UPDATE SET last_counter=EXCLUDED.last_counter,recovery_hashes=EXCLUDED.recovery_hashes
  WHERE um_mfa_credentials.last_counter=${Number(cred?.last_counter??-1)} AND um_mfa_credentials.recovery_hashes=${JSON.stringify(cred?.recovery_hashes||[])}::jsonb RETURNING user_id) INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() FROM verified RETURNING id`;
  if(!results.length)return sendJson(res,409,{error:'sign_in_again'});
  const session={user_id:p.id,email:p.email,name:p.name,role:p.role,roles:[...new Set([p.role,...(p.roles||[])])],org_id:p.org_id,session_revision:Number(p.session_revision||0),mfa_verified:true};
  setSessionCookie(res,createSessionToken(session));
  return sendJson(res,200,{ok:true,session,...(recoveryCodes.length?{recovery_codes:recoveryCodes}:{})});
 }catch{return sendJson(res,503,{error:'mfa_unavailable'});}
}
