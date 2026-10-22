import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
export function validateProfilePatch(body){
 if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['name','title'].includes(k))||typeof body.name!=='string'||typeof body.title!=='string')return null;
 const name=body.name.trim(),title=body.title.trim();
 return name&&name.length<=120&&title.length<=120?{name,title}:null;
}
export function createProfileHandler({sqlFactory=neon,authorize=authorizeLiveRequest,env=process.env}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store, private');
  if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed'});
  if(!env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
  try{
   const origin=req.headers.origin,host=req.headers['x-forwarded-host']||req.headers.host;
   if(!origin||new URL(origin).host!==host)return sendJson(res,403,{error:'same_origin_required'});
   const sql=sqlFactory(env.DATABASE_URL),live=await authorize(req,sql,{roles:['customer','distributor']});
   if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
   const patch=validateProfilePatch(JSON.parse((await readRawBody(req)).toString('utf8')||'{}'));
   if(!patch)return sendJson(res,400,{error:'name_and_title_only'});
   const at=new Date().toISOString(),id=crypto.randomUUID(),current=live.profile;
   const next={...patch,updated_at:at};
   const audit={id,kind:'profile.updated',ref_id:live.session.user_id,actor_id:live.session.user_id,org_id:live.session.org_id,payload:{fields:['name','title']},created_at:at};
   const results=await sql.transaction(tx=>[
    tx`UPDATE um_rows SET data=data||${JSON.stringify(next)}::jsonb,updated_at=now() WHERE tbl='profiles' AND id=${live.session.user_id} AND deleted=false AND data=${JSON.stringify(current)}::jsonb RETURNING id`,
    tx`INSERT INTO um_rows(tbl,id,data) SELECT 'audit_log',${id},${JSON.stringify(audit)}::jsonb WHERE EXISTS(SELECT 1 FROM um_rows WHERE tbl='profiles' AND id=${live.session.user_id} AND deleted=false AND data->>'updated_at'=${at})`,
   ]);
   if(!results[0]?.length)return sendJson(res,409,{error:'profile_changed_refresh'});
   return sendJson(res,200,{ok:true,profile:{id:live.session.user_id,...next}});
  }catch{return sendJson(res,400,{error:'profile_not_saved'});}
 };
}
export default createProfileHandler();
