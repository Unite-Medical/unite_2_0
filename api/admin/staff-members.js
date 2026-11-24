import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody,sendJson } from '../_lib/http.js';
import { planStaffMember,planStaffRemoval } from '../_lib/staffMembers.js';

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 const sql=neon(process.env.DATABASE_URL);
 try{
  const live=await authorizeLiveRequest(req,sql,{roles:['admin']});if(!live.ok)return sendJson(res,403,{error:live.reason});
  const body=JSON.parse((await readRawBody(req)).toString('utf8')||'{}');
  if(body.action==='remove'){
   const rows=await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${String(body.user_id||'')} AND deleted=false`;
   const plan=planStaffRemoval({profile:rows[0]?.data,actor:live.session,reason:body.reason});if(!plan.ok)return sendJson(res,400,{error:plan.reason});
   const before=rows[0].data;
   const changed=await sql`WITH changed AS (UPDATE um_rows SET data=${JSON.stringify(plan.profile)}::jsonb,updated_at=now() WHERE tbl='profiles' AND id=${before.id} AND deleted=false AND data=${JSON.stringify(before)}::jsonb RETURNING id)
    INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${plan.audit.id},${JSON.stringify(plan.audit)}::jsonb,false,now() FROM changed RETURNING id`;
   if(!changed.length)return sendJson(res,409,{error:'profile_changed_refresh'});
   return sendJson(res,200,{ok:true});
  }
  const existing=(await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND deleted=false AND lower(data->>'email')=${String(body.email||'').trim().toLowerCase()}`).map(r=>r.data);
  const plan=planStaffMember({...body,actor:live.session,existing});if(!plan.ok)return sendJson(res,400,{error:plan.reason});
  const rows=[['profiles',plan.profile],['organization_users',plan.membership],['audit_log',plan.audit],...(plan.activation?[['activation_tokens',plan.activation.record]]:[])];
  const email=plan.profile.email,nonce=crypto.randomBytes(16).toString('hex');
  const lock={id:`reglock_${crypto.createHash('sha256').update(email).digest('hex').slice(0,20)}`,email_hash:crypto.createHash('sha256').update(email).digest('hex'),nonce,created_at:plan.profile.created_at};
  const result=await sql.transaction(tx=>[
   tx`INSERT INTO um_rows(tbl,id,data) VALUES('registration_locks',${lock.id},${JSON.stringify(lock)}::jsonb) ON CONFLICT(tbl,id) DO NOTHING RETURNING id`,
   tx`INSERT INTO um_rows(tbl,id,data) SELECT 'profiles',${plan.profile.id},${JSON.stringify(plan.profile)}::jsonb WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='registration_locks' AND id=${lock.id} AND data->>'nonce'=${nonce}) AND NOT EXISTS (SELECT 1 FROM um_rows WHERE tbl='profiles' AND deleted=false AND lower(data->>'email')=${email}) ON CONFLICT(tbl,id) DO NOTHING RETURNING id`,
   ...rows.slice(1).map(([t,r])=>tx`INSERT INTO um_rows(tbl,id,data) SELECT ${t},${r.id},${JSON.stringify(r)}::jsonb WHERE EXISTS (SELECT 1 FROM um_rows WHERE tbl='profiles' AND id=${plan.profile.id} AND data->>'created_at'=${plan.profile.created_at}) ON CONFLICT(tbl,id) DO NOTHING`),
  ]);
  if(!result[1]?.length)return sendJson(res,409,{error:'email_already_has_account'});
  const origin=process.env.PUBLIC_APP_ORIGIN||`https://${req.headers.host}`;
  return sendJson(res,201,{ok:true,person:{id:plan.profile.id,email:plan.profile.email,name:plan.profile.name,roles:plan.profile.roles,status:plan.profile.status},...(plan.activation?{activation_url:`${origin}/activate?token=${plan.activation.token}`}:{})});
 }catch{return sendJson(res,500,{error:'staff_member_failed'});}
}
