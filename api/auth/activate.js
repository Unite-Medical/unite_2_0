import { neon } from '@neondatabase/serverless';
import { hashActivationToken, planActivationRedemption } from '../_lib/customerActivation.js';
import { readRawBody, sendJson } from '../_lib/http.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return sendJson(res,405,{error:'method_not_allowed'});
  if(!process.env.DATABASE_URL) return sendJson(res,503,{error:'not_configured'});
  try{
    const {token='',password=''}=JSON.parse((await readRawBody(req)).toString('utf8')||'{}');
    const tokenHash=hashActivationToken(token);
    const sql=neon(process.env.DATABASE_URL);
    const tokenRows=await sql`SELECT data FROM um_rows WHERE tbl='activation_tokens' AND deleted=false AND data->>'token_hash'=${tokenHash} LIMIT 1`;
    const tokenRecord=tokenRows[0]?.data;
    if(!tokenRecord) return sendJson(res,400,{error:'activation_token_invalid'});
    const profileRows=await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${String(tokenRecord.profile_id)} AND deleted=false LIMIT 1`;
    const profile=profileRows[0]?.data;
    const plan=planActivationRedemption({profile,tokenRecord,token,password});
    if(!plan.ok) return sendJson(res,400,{error:plan.reason});
    const passwordPatch={password_hash:plan.profile.password_hash,password_salt:plan.profile.password_salt,password_algorithm:plan.profile.password_algorithm,status:'active',activation_required:false,activated_at:plan.profile.activated_at,session_revision:plan.profile.session_revision};
    const results=await sql.transaction((txn)=>[
      txn`UPDATE um_rows SET data=(data-'password') || ${JSON.stringify(passwordPatch)}::jsonb,updated_at=now()
        WHERE tbl='profiles' AND id=${profile.id} AND deleted=false AND data->>'status'='pending_activation'
          AND COALESCE((data->>'session_revision')::int,0)=${Number(profile.session_revision||0)} RETURNING id`,
      txn`UPDATE um_rows SET data=data || ${JSON.stringify({status:'active',activated_at:plan.profile.activated_at})}::jsonb,updated_at=now()
        WHERE tbl='organization_users' AND deleted=false AND data->>'user_id'=${profile.id} AND data->>'status'='pending_activation' RETURNING id`,
      txn`UPDATE um_rows SET data=data || ${JSON.stringify({status:'consumed',consumed_at:plan.token.consumed_at})}::jsonb,updated_at=now()
        WHERE tbl='activation_tokens' AND id=${tokenRecord.id} AND deleted=false AND data->>'consumed_at' IS NULL RETURNING id`,
    ]);
    if(!results.every((result)=>result?.length)) return sendJson(res,409,{error:'activation_changed_retry'});
    return sendJson(res,200,{ok:true,activated:true,commerce_approved:false});
  }catch{return sendJson(res,500,{error:'activation_failed'});}
}
