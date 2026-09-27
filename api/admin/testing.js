import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody,sendJson } from '../_lib/http.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.UNITE_ENVIRONMENT!=='staging')return sendJson(res,404,{error:'not_found'});
  if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
  const sql=neon(process.env.DATABASE_URL);
  try{
    const live=await authorizeLiveRequest(req,sql,{roles:['admin']});
    if(!live.ok)return sendJson(res,401,{error:live.reason});
    if(req.method==='GET'){
      const feedback=await sql`SELECT data FROM um_rows WHERE tbl='staging_feedback' AND deleted=false ORDER BY updated_at DESC LIMIT 200`;
      const imports=await sql`SELECT data FROM um_rows WHERE tbl='staging_imports' AND deleted=false ORDER BY updated_at DESC`;
      return sendJson(res,200,{feedback:feedback.map(r=>r.data),imports:imports.map(r=>r.data)});
    }
    if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed'});
    const body=JSON.parse((await readRawBody(req)).toString('utf8'));
    if(!body.workflow||!['passed','blocked','confusing','bug'].includes(body.result)||!String(body.notes||'').trim())return sendJson(res,400,{error:'workflow_result_and_notes_required'});
    const data={id:crypto.randomUUID(),workflow:String(body.workflow).slice(0,160),result:body.result,notes:String(body.notes).slice(0,8000),created_at:new Date().toISOString(),author:live.session.email};
    await sql`INSERT INTO um_rows(tbl,id,data) VALUES('staging_feedback',${data.id},${JSON.stringify(data)}::jsonb)`;
    return sendJson(res,200,{ok:true,feedback:data});
  }catch{return sendJson(res,500,{error:'testing_feedback_unavailable'});}
}
